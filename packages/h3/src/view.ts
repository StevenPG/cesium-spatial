import type { Scene } from 'cesium';
import {
  computeViewInfo,
  type LevelSelector,
  type LevelSelectionOptions,
  type ViewInfo,
} from '@stevenpg/cesium-spatial-core';
import { coverRectangle, type CoverResult } from './cover.js';
import { resolutionForMetersPerPixel } from './resolution.js';

/** Options for {@link cellsInView}. */
export interface CellsInViewOptions extends LevelSelectionOptions {
  /** Use this resolution instead of deriving one from the camera. */
  resolution?: number;
  /**
   * A {@link LevelSelector} to derive the resolution through, so repeated calls
   * get hysteresis. Ignored when `resolution` is given.
   */
  selector?: LevelSelector;
  /** Upper bound on returned cells. Defaults to 20000. */
  maxCells?: number;
}

/** What {@link cellsInView} produces. */
export interface CellsInViewResult extends CoverResult {
  /** The camera measurements the resolution was derived from. */
  view: ViewInfo;
}

/**
 * The cells covering whatever the camera can currently see.
 *
 * Returns `undefined` when Cesium cannot produce a view rectangle, which
 * happens when the camera is pointed away from the globe.
 *
 * A fully zoomed-out view has no natural bound, so the cell budget does the
 * real work there: the cover steps to coarser resolutions until it fits.
 */
export function cellsInView(
  scene: Scene,
  options: CellsInViewOptions = {},
): CellsInViewResult | undefined {
  const view = computeViewInfo(scene);
  if (!view) return undefined;

  const resolution =
    options.resolution ??
    options.selector?.update(view.metersPerPixel) ??
    resolutionForMetersPerPixel(view.metersPerPixel, options);

  const cover = coverRectangle(view.rectangle, {
    resolution,
    maxCells: options.maxCells,
    minResolution: options.minLevel,
  });

  return { ...cover, view };
}
