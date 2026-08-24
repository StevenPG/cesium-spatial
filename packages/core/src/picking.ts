import { ScreenSpaceEventHandler, ScreenSpaceEventType, type Cartesian2, type Scene } from 'cesium';
import type { CellId } from './types.js';

/** Anything that can turn a Cesium pick result into a cell id. */
export interface PickableCellLayer {
  resolvePick(picked: unknown): CellId | undefined;
}

/** Details handed to {@link CellPickerOptions} callbacks. */
export interface CellPickEvent {
  id: CellId;
  layer: PickableCellLayer;
  position: Cartesian2;
}

/** Callbacks for {@link CellPicker}. */
export interface CellPickerOptions {
  onClick?: (event: CellPickEvent) => void;
  onHover?: (event: CellPickEvent) => void;
  /** Fired once when the cursor leaves the previously hovered cell. */
  onHoverOut?: (id: CellId) => void;
}

/**
 * Turns Cesium pick results back into cell ids.
 *
 * Batched primitives report a picked geometry instance rather than an object
 * the app knows about, so each layer is asked in turn to claim the pick. Layers
 * are consulted in registration order and the first match wins.
 */
export class CellPicker {
  private readonly handler: ScreenSpaceEventHandler;
  private readonly layers: PickableCellLayer[];
  private hovered: CellId | undefined;

  constructor(
    private readonly scene: Scene,
    layers: readonly PickableCellLayer[] = [],
    private readonly options: CellPickerOptions = {},
  ) {
    this.layers = [...layers];
    this.handler = new ScreenSpaceEventHandler(scene.canvas);

    if (options.onClick) {
      this.handler.setInputAction((movement: { position: Cartesian2 }) => {
        const hit = this.pickAt(movement.position);
        if (hit) options.onClick?.(hit);
      }, ScreenSpaceEventType.LEFT_CLICK);
    }

    if (options.onHover || options.onHoverOut) {
      this.handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
        this.updateHover(movement.endPosition);
      }, ScreenSpaceEventType.MOUSE_MOVE);
    }
  }

  /** Registers another layer to resolve picks against. */
  addLayer(layer: PickableCellLayer): void {
    if (!this.layers.includes(layer)) this.layers.push(layer);
  }

  /** Stops resolving picks against a layer. */
  removeLayer(layer: PickableCellLayer): void {
    const index = this.layers.indexOf(layer);
    if (index >= 0) this.layers.splice(index, 1);
  }

  /** Resolves whatever cell is under a screen position, if any. */
  pickAt(position: Cartesian2): CellPickEvent | undefined {
    const picked = this.scene.pick(position);
    if (!picked) return undefined;
    for (const layer of this.layers) {
      const id = layer.resolvePick(picked);
      if (id !== undefined) return { id, layer, position };
    }
    return undefined;
  }

  destroy(): void {
    this.handler.destroy();
  }

  private updateHover(position: Cartesian2): void {
    const hit = this.pickAt(position);
    if (hit?.id === this.hovered) return;
    if (this.hovered !== undefined) this.options.onHoverOut?.(this.hovered);
    this.hovered = hit?.id;
    if (hit) this.options.onHover?.(hit);
  }
}
