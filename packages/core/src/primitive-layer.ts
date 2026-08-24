import {
  Cartesian3,
  ClassificationType,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  GroundPolylineGeometry,
  GroundPolylinePrimitive,
  GroundPrimitive,
  Material,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  PolylineColorAppearance,
  PolylineCollection,
  Primitive,
  ShowGeometryInstanceAttribute,
  type Scene,
} from 'cesium';
import { densifyRing } from './geodesy.js';
import type { CellBoundary, CellId, CellStyle, CellStyleFunction } from './types.js';

/** Construction options for {@link CellPrimitiveLayer}. */
export interface CellPrimitiveLayerOptions {
  /** Per-cell style resolver, consulted on every build and restyle. */
  style?: CellStyleFunction;
  /** Fill color for cells the style function does not cover. */
  color?: Color;
  /** Outline color for cells the style function does not cover. */
  outlineColor?: Color;
  /** Draw cell outlines in a companion polyline primitive. Off by default. */
  outlines?: boolean;
  /** Outline width in pixels. */
  outlineWidth?: number;
  /** Drape cells over terrain instead of drawing them on the ellipsoid. */
  clampToGround?: boolean;
  /** What clamped cells classify. Defaults to `ClassificationType.BOTH`. */
  classificationType?: ClassificationType;
  /** Default base height in meters. Ignored when `clampToGround` is set. */
  height?: number;
  /** Default top height in meters, producing prisms. Ignored when clamped. */
  extrudedHeight?: number;
  /** Allow translucent fills. Costs a depth-sorted pass, so it is opt-in. */
  translucent?: boolean;
  /** Build geometry off the main thread over several frames. Defaults to true. */
  asynchronous?: boolean;
  /** Longest outline segment before extra vertices are inserted, in meters. */
  outlineMaxEdgeMeters?: number;
  /** Whether cells respond to picking. Defaults to true. */
  allowPicking?: boolean;
  /** Initial visibility. */
  show?: boolean;
}

interface BuiltCell {
  ring: number[];
  height: number;
  extrudedHeight: number | undefined;
}

const DEFAULT_COLOR = Color.CYAN.withAlpha(0.35);
const DEFAULT_OUTLINE_COLOR = Color.CYAN;

/**
 * Draws many cells as a single batched Cesium primitive.
 *
 * The expensive operation is building geometry, so the layer distinguishes two
 * kinds of change. Changing which cells are present rebuilds the primitive;
 * changing only color or visibility writes directly into the existing
 * primitive's per-instance attributes, which is cheap enough to do every frame.
 * Changing a cell's height is a geometry change and forces a rebuild.
 */
export class CellPrimitiveLayer {
  private readonly options: Required<
    Pick<
      CellPrimitiveLayerOptions,
      | 'color'
      | 'outlineColor'
      | 'outlines'
      | 'outlineWidth'
      | 'clampToGround'
      | 'height'
      | 'translucent'
      | 'asynchronous'
      | 'outlineMaxEdgeMeters'
      | 'allowPicking'
    >
  > &
    CellPrimitiveLayerOptions;

  private primitive: Primitive | GroundPrimitive | undefined;
  private outlinePrimitive: PolylineCollection | GroundPolylinePrimitive | undefined;
  private built = new Map<CellId, BuiltCell>();
  private pendingStyles = new Map<CellId, CellStyle>();
  private removePostRender: (() => void) | undefined;
  private visible: boolean;
  private destroyed = false;

  constructor(
    private readonly scene: Scene,
    options: CellPrimitiveLayerOptions = {},
  ) {
    this.options = {
      color: DEFAULT_COLOR,
      outlineColor: DEFAULT_OUTLINE_COLOR,
      outlines: false,
      outlineWidth: 1,
      clampToGround: false,
      height: 0,
      translucent: true,
      asynchronous: true,
      outlineMaxEdgeMeters: 25_000,
      allowPicking: true,
      ...options,
    };
    this.visible = options.show ?? true;
    this.removePostRender = scene.postRender.addEventListener(() => this.flushPendingStyles());
  }

  /** The cell ids currently rendered by this layer. */
  get cellIds(): Iterable<CellId> {
    return this.built.keys();
  }

  /** Number of cells currently rendered. */
  get size(): number {
    return this.built.size;
  }

  get show(): boolean {
    return this.visible;
  }

  set show(value: boolean) {
    this.visible = value;
    if (this.primitive) this.primitive.show = value;
    if (this.outlinePrimitive) this.outlinePrimitive.show = value;
  }

  /**
   * Replaces the layer's contents.
   *
   * When the incoming cells match what is already drawn, this restyles in place
   * instead of rebuilding.
   */
  setCells(boundaries: readonly CellBoundary[]): void {
    this.assertAlive();
    if (this.matchesBuilt(boundaries)) {
      this.restyle();
      return;
    }
    this.rebuild(boundaries);
  }

  /** Removes every cell from the layer. */
  clear(): void {
    this.setCells([]);
  }

  /**
   * Applies a style override to one cell without rebuilding.
   *
   * Color and visibility take effect on the next frame. Height changes cannot
   * be applied in place and are ignored here; pass them through
   * {@link setCells} instead.
   */
  setCellStyle(id: CellId, style: CellStyle): void {
    if (!this.built.has(id)) return;
    this.pendingStyles.set(id, { ...this.pendingStyles.get(id), ...style });
  }

  /** Re-runs the style function over every cell. */
  restyle(): void {
    const resolve = this.options.style;
    if (!resolve) return;
    for (const id of this.built.keys()) {
      const style = resolve(id);
      if (style) this.setCellStyle(id, style);
    }
  }

  /**
   * Maps a Cesium pick result back to a cell id, or `undefined` when the pick
   * did not land on this layer.
   */
  resolvePick(picked: unknown): CellId | undefined {
    if (!picked || typeof picked !== 'object') return undefined;
    const candidate = picked as { id?: unknown; primitive?: unknown };
    if (candidate.primitive !== this.primitive) return undefined;
    if (typeof candidate.id !== 'string') return undefined;
    return this.built.has(candidate.id) ? candidate.id : undefined;
  }

  /** Releases every Cesium resource held by the layer. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.removePostRender?.();
    this.removePostRender = undefined;
    this.removePrimitives();
    this.built.clear();
    this.pendingStyles.clear();
  }

  private matchesBuilt(boundaries: readonly CellBoundary[]): boolean {
    if (boundaries.length !== this.built.size) return false;
    for (const boundary of boundaries) {
      const existing = this.built.get(boundary.id);
      if (!existing) return false;
      const style = this.options.style?.(boundary.id);
      if (this.heightFor(style) !== existing.height) return false;
      if (this.extrudedHeightFor(style) !== existing.extrudedHeight) return false;
    }
    return true;
  }

  private rebuild(boundaries: readonly CellBoundary[]): void {
    this.removePrimitives();
    this.built.clear();
    this.pendingStyles.clear();

    if (boundaries.length === 0) return;

    const instances: GeometryInstance[] = [];
    let anyExtruded = false;

    for (const boundary of boundaries) {
      const style = this.options.style?.(boundary.id);
      const height = this.heightFor(style);
      const extrudedHeight = this.extrudedHeightFor(style);
      if (extrudedHeight !== undefined) anyExtruded = true;

      const positions = Cartesian3.fromDegreesArray(boundary.ring);
      const geometry = new PolygonGeometry({
        polygonHierarchy: new PolygonHierarchy(positions),
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        ...(this.options.clampToGround ? {} : { height, extrudedHeight }),
      });

      instances.push(
        new GeometryInstance({
          geometry,
          id: boundary.id,
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(this.colorFor(style)),
            show: new ShowGeometryInstanceAttribute(style?.show ?? true),
          },
        }),
      );

      this.built.set(boundary.id, { ring: boundary.ring, height, extrudedHeight });
    }

    const appearance = new PerInstanceColorAppearance({
      // Unlit fills read better as flat overlays; prisms need shading to have form.
      flat: !anyExtruded,
      closed: anyExtruded,
      translucent: this.options.translucent,
    });

    this.primitive = this.options.clampToGround
      ? new GroundPrimitive({
          geometryInstances: instances,
          appearance,
          classificationType: this.options.classificationType ?? ClassificationType.BOTH,
          asynchronous: this.options.asynchronous,
          allowPicking: this.options.allowPicking,
        })
      : new Primitive({
          geometryInstances: instances,
          appearance,
          asynchronous: this.options.asynchronous,
          allowPicking: this.options.allowPicking,
        });

    this.primitive.show = this.visible;
    this.scene.primitives.add(this.primitive);

    if (this.options.outlines) this.buildOutlines(boundaries);
  }

  private buildOutlines(boundaries: readonly CellBoundary[]): void {
    const width = this.options.outlineWidth;
    const maxEdge = this.options.outlineMaxEdgeMeters;

    if (this.options.clampToGround && GroundPolylinePrimitive.isSupported(this.scene)) {
      const instances = boundaries.map((boundary) => {
        const ring = closeRing(boundary.ring);
        return new GeometryInstance({
          geometry: new GroundPolylineGeometry({
            positions: Cartesian3.fromDegreesArray(ring),
            width,
          }),
          id: boundary.id,
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              this.outlineColorFor(this.options.style?.(boundary.id)),
            ),
          },
        });
      });
      const outlines = new GroundPolylinePrimitive({
        geometryInstances: instances,
        appearance: new PolylineColorAppearance(),
        asynchronous: this.options.asynchronous,
      });
      outlines.show = this.visible;
      this.outlinePrimitive = outlines;
      this.scene.primitives.add(outlines);
      return;
    }

    const collection = new PolylineCollection();
    for (const boundary of boundaries) {
      const built = this.built.get(boundary.id);
      const ring = closeRing(densifyRing(boundary.ring, maxEdge));
      const height = built?.extrudedHeight ?? built?.height ?? 0;
      collection.add({
        positions: Cartesian3.fromDegreesArrayHeights(withHeights(ring, height)),
        width,
        material: Material.fromType('Color', {
          color: this.outlineColorFor(this.options.style?.(boundary.id)),
        }),
        id: boundary.id,
      });
    }
    collection.show = this.visible;
    this.outlinePrimitive = collection;
    this.scene.primitives.add(collection);
  }

  /**
   * Writes queued color/visibility changes into the live primitive.
   *
   * Per-instance attributes can only be touched once the primitive has finished
   * building, so updates queued during an asynchronous build wait here.
   */
  private flushPendingStyles(): void {
    if (this.pendingStyles.size === 0) return;
    const primitive = this.primitive;
    if (!primitive || !primitive.ready) return;

    for (const [id, style] of this.pendingStyles) {
      const attributes = primitive.getGeometryInstanceAttributes(id);
      if (!attributes) continue;
      if (style.color) {
        attributes.color = ColorGeometryInstanceAttribute.toValue(style.color, attributes.color);
      }
      if (style.show !== undefined) {
        attributes.show = ShowGeometryInstanceAttribute.toValue(style.show, attributes.show);
      }
    }
    this.pendingStyles.clear();
  }

  private colorFor(style: CellStyle | undefined): Color {
    return style?.color ?? this.options.color;
  }

  private outlineColorFor(style: CellStyle | undefined): Color {
    return style?.outlineColor ?? this.options.outlineColor;
  }

  private heightFor(style: CellStyle | undefined): number {
    return style?.height ?? this.options.height;
  }

  private extrudedHeightFor(style: CellStyle | undefined): number | undefined {
    return style?.extrudedHeight ?? this.options.extrudedHeight;
  }

  private removePrimitives(): void {
    if (this.primitive) {
      this.scene.primitives.remove(this.primitive);
      this.primitive = undefined;
    }
    if (this.outlinePrimitive) {
      this.scene.primitives.remove(this.outlinePrimitive);
      this.outlinePrimitive = undefined;
    }
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('CellPrimitiveLayer has been destroyed');
  }
}

/** Repeats the first vertex at the end, which polylines need and polygons do not. */
function closeRing(ring: number[]): number[] {
  if (ring.length < 4) return ring.slice();
  const closed = ring.slice();
  if (closed[0] !== closed[closed.length - 2] || closed[1] !== closed[closed.length - 1]) {
    closed.push(closed[0], closed[1]);
  }
  return closed;
}

/** Expands a flat [lng, lat, ...] ring into [lng, lat, height, ...]. */
function withHeights(ring: number[], height: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < ring.length; i += 2) out.push(ring[i], ring[i + 1], height);
  return out;
}
