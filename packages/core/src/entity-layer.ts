import {
  CallbackProperty,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  Entity,
  PolygonHierarchy,
  type EntityCollection,
} from 'cesium';
import type { CellBoundary, CellId, CellStyle, CellStyleFunction } from './types.js';

/** The entity options this layer would build, handed to {@link CellEntityLayerOptions.entityFactory}. */
export interface CellEntityDefaults {
  id: string;
  polygon: Record<string, unknown>;
}

/** Construction options for {@link CellEntityLayer}. */
export interface CellEntityLayerOptions {
  /** Per-cell style resolver. */
  style?: CellStyleFunction;
  /** Fill color for cells the style function does not cover. */
  color?: Color;
  /** Outline color for cells the style function does not cover. */
  outlineColor?: Color;
  /** Draw a one-pixel outline. Wider outlines are unsupported on most platforms. */
  outlines?: boolean;
  /** Drape cells on terrain by leaving heights unset. */
  clampToGround?: boolean;
  /** Default base height in meters. */
  height?: number;
  /** Default top height in meters. */
  extrudedHeight?: number;
  /** Prefix for generated entity ids, keeping them clear of the app's own. */
  idPrefix?: string;
  /**
   * Re-evaluate the style every frame through `CallbackProperty`.
   *
   * Convenient for animation, but it runs the style function once per cell per
   * frame; prefer calling {@link CellEntityLayer.restyle} on change instead.
   */
  dynamic?: boolean;
  /**
   * Takes full control of entity construction. Receives the options this layer
   * would otherwise have used, and returns what to build instead.
   */
  entityFactory?: (
    boundary: CellBoundary,
    style: CellStyle | undefined,
    defaults: CellEntityDefaults,
  ) => Entity.ConstructorOptions;
}

const DEFAULT_COLOR = Color.CYAN.withAlpha(0.35);
const DEFAULT_OUTLINE_COLOR = Color.CYAN;

/**
 * Renders cells as individual Cesium entities.
 *
 * Entities cost far more per cell than {@link CellPrimitiveLayer} but give each
 * cell its own pickable, describable, mutable object. Use this for hundreds of
 * cells and interactive editing; use the primitive layer for thousands.
 */
export class CellEntityLayer {
  private readonly entities = new Map<CellId, Entity>();
  private readonly idPrefix: string;
  private visible = true;
  private destroyed = false;

  constructor(
    private readonly collection: EntityCollection,
    private readonly options: CellEntityLayerOptions = {},
  ) {
    this.idPrefix = options.idPrefix ?? 'cell-';
  }

  /** The cell ids currently rendered by this layer. */
  get cellIds(): Iterable<CellId> {
    return this.entities.keys();
  }

  get size(): number {
    return this.entities.size;
  }

  get show(): boolean {
    return this.visible;
  }

  set show(value: boolean) {
    this.visible = value;
    for (const entity of this.entities.values()) entity.show = value;
  }

  /**
   * Reconciles the layer against `boundaries`: adds what is new, removes what
   * is gone, and restyles what stayed. Entities that survive keep their
   * identity, so external references and selection remain valid.
   */
  setCells(boundaries: readonly CellBoundary[]): void {
    this.assertAlive();
    const incoming = new Set<CellId>();

    this.collection.suspendEvents();
    try {
      for (const boundary of boundaries) {
        incoming.add(boundary.id);
        if (this.entities.has(boundary.id)) {
          this.applyStyle(boundary.id);
        } else {
          this.entities.set(boundary.id, this.createEntity(boundary));
        }
      }

      for (const [id, entity] of this.entities) {
        if (incoming.has(id)) continue;
        this.collection.remove(entity);
        this.entities.delete(id);
      }
    } finally {
      this.collection.resumeEvents();
    }
  }

  /** Removes every cell from the layer. */
  clear(): void {
    this.setCells([]);
  }

  /** Re-runs the style function over every cell. */
  restyle(): void {
    for (const id of this.entities.keys()) this.applyStyle(id);
  }

  /** The entity backing a cell, if the cell is currently rendered. */
  getEntity(id: CellId): Entity | undefined {
    return this.entities.get(id);
  }

  /** Maps a Cesium pick result back to a cell id. */
  resolvePick(picked: unknown): CellId | undefined {
    const entity = (picked as { id?: unknown })?.id;
    if (!(entity instanceof Entity)) return undefined;
    if (!entity.id.startsWith(this.idPrefix)) return undefined;
    const cellId = entity.id.slice(this.idPrefix.length);
    return this.entities.has(cellId) ? cellId : undefined;
  }

  /** Removes every entity this layer owns from its collection. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.collection.suspendEvents();
    for (const entity of this.entities.values()) this.collection.remove(entity);
    this.collection.resumeEvents();
    this.entities.clear();
  }

  private createEntity(boundary: CellBoundary): Entity {
    const style = this.options.style?.(boundary.id);
    const defaults: CellEntityDefaults = {
      id: this.idPrefix + boundary.id,
      polygon: this.polygonOptions(boundary, style),
    };
    const constructorOptions = this.options.entityFactory
      ? this.options.entityFactory(boundary, style, defaults)
      : defaults;

    const entity = new Entity(constructorOptions as Entity.ConstructorOptions);
    entity.show = this.visible && (style?.show ?? true);
    this.collection.add(entity);
    return entity;
  }

  private polygonOptions(boundary: CellBoundary, style: CellStyle | undefined) {
    const clamped = this.options.clampToGround ?? false;
    const material = this.options.dynamic
      ? new ColorMaterialProperty(
          new CallbackProperty(() => this.colorFor(this.options.style?.(boundary.id)), false),
        )
      : new ColorMaterialProperty(this.colorFor(style));

    return {
      hierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(boundary.ring)),
      material,
      outline: this.options.outlines ?? false,
      outlineColor: style?.outlineColor ?? this.options.outlineColor ?? DEFAULT_OUTLINE_COLOR,
      // Leaving heights undefined is what makes an entity polygon drape on terrain.
      ...(clamped
        ? {}
        : {
            height: style?.height ?? this.options.height ?? 0,
            extrudedHeight: style?.extrudedHeight ?? this.options.extrudedHeight,
          }),
    };
  }

  private applyStyle(id: CellId): void {
    const entity = this.entities.get(id);
    const polygon = entity?.polygon;
    if (!entity || !polygon) return;

    const style = this.options.style?.(id);
    entity.show = this.visible && (style?.show ?? true);
    if (this.options.dynamic) return; // CallbackProperty already reads live values.

    polygon.material = new ColorMaterialProperty(this.colorFor(style));
    if (style?.outlineColor) polygon.outlineColor = new ConstantProperty(style.outlineColor);
    if (!this.options.clampToGround) {
      if (style?.height !== undefined) polygon.height = new ConstantProperty(style.height);
      if (style?.extrudedHeight !== undefined) {
        polygon.extrudedHeight = new ConstantProperty(style.extrudedHeight);
      }
    }
  }

  private colorFor(style: CellStyle | undefined): Color {
    return style?.color ?? this.options.color ?? DEFAULT_COLOR;
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error('CellEntityLayer has been destroyed');
  }
}
