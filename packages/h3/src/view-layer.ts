import type { Scene } from 'cesium';
import type { LevelSelector } from '@stevenpg/cesium-spatial-core';
import { H3CellLayer, type H3CellLayerOptions } from './layer.js';
import { createResolutionSelector } from './resolution.js';
import { cellsInView, type CellsInViewOptions, type CellsInViewResult } from './view.js';

/** Options for {@link H3ViewLayer}. */
export interface H3ViewLayerOptions extends H3CellLayerOptions, CellsInViewOptions {
  /**
   * Quiet period after camera movement before recomputing, in milliseconds.
   * Defaults to 120.
   */
  debounceMs?: number;
  /**
   * How much the camera must move before Cesium reports a change, as a
   * fraction of the viewport. Defaults to 0.1.
   */
  cameraChangeThreshold?: number;
  /** Called after every recompute, with the cells and resolution chosen. */
  onUpdate?: (result: CellsInViewResult) => void;
}

/**
 * An H3 layer that keeps itself filled with whatever the camera is looking at.
 *
 * Recomputes on camera movement, choosing a resolution from the view's ground
 * resolution through a {@link LevelSelector} so zooming steps between
 * resolutions instead of flickering between them, and coarsening further if the
 * cell budget demands it.
 */
export class H3ViewLayer {
  readonly layer: H3CellLayer;

  private readonly selector: LevelSelector;
  private readonly removeCameraChanged: () => void;
  private readonly removeMoveEnd: () => void;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private last: CellsInViewResult | undefined;
  private destroyed = false;

  constructor(
    private readonly scene: Scene,
    private readonly options: H3ViewLayerOptions = {},
  ) {
    this.layer = new H3CellLayer(scene, options);
    this.selector = options.selector ?? createResolutionSelector(options);

    scene.camera.percentageChanged = options.cameraChangeThreshold ?? 0.1;
    this.removeCameraChanged = scene.camera.changed.addEventListener(() => this.schedule());
    this.removeMoveEnd = scene.camera.moveEnd.addEventListener(() => this.schedule());

    this.refresh();
  }

  /** The most recent cover, or `undefined` before the first successful refresh. */
  get lastResult(): CellsInViewResult | undefined {
    return this.last;
  }

  /** The resolution currently drawn. */
  get resolution(): number | undefined {
    return this.last?.resolution;
  }

  get show(): boolean {
    return this.layer.show;
  }

  set show(value: boolean) {
    this.layer.show = value;
  }

  /** Recomputes immediately, bypassing the debounce. */
  refresh(): void {
    if (this.destroyed) return;
    const result = cellsInView(this.scene, { ...this.options, selector: this.selector });
    if (!result) return;
    this.last = result;
    this.layer.setCells(result.cells);
    this.options.onUpdate?.(result);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.removeCameraChanged();
    this.removeMoveEnd();
    this.layer.destroy();
  }

  /** Coalesces bursts of camera events into one recompute. */
  private schedule(): void {
    if (this.destroyed) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.refresh();
    }, this.options.debounceMs ?? 120);
  }
}
