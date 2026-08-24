import type { Scene } from 'cesium';
import {
  computeViewInfo,
  type LevelSelector,
  type LevelSelectionOptions,
  type ViewInfo,
} from '@stevenpg/cesium-spatial-core';
import { coverRectangle, type CoverResult } from './cover.js';
import { levelForMetersPerPixel } from './level.js';

/** Options for {@link cellsInView}. */
export interface CellsInViewOptions extends LevelSelectionOptions {
  /** Use this level instead of deriving one from the camera. */
  level?: number;
  /**
   * A {@link LevelSelector} to derive the level through, so repeated calls get
   * hysteresis. Ignored when `level` is given.
   */
  selector?: LevelSelector;
  /** Upper bound on returned cells. Defaults to 20000. */
  maxCells?: number;
}

/** What {@link cellsInView} produces. */
export interface CellsInViewResult extends CoverResult {
  /** The camera measurements the level was derived from. */
  view: ViewInfo;
}

/**
 * The cells covering whatever the camera can currently see.
 *
 * Returns `undefined` when Cesium cannot produce a view rectangle, which
 * happens when the camera is pointed away from the globe.
 *
 * A fully zoomed-out view has no natural bound, so the cell budget does the
 * real work there: the cover steps to coarser levels until it fits.
 */
export function cellsInView(
  scene: Scene,
  options: CellsInViewOptions = {},
): CellsInViewResult | undefined {
  const view = computeViewInfo(scene);
  if (!view) return undefined;

  const level =
    options.level ??
    options.selector?.update(view.metersPerPixel) ??
    levelForMetersPerPixel(view.metersPerPixel, options);

  const cover = coverRectangle(view.rectangle, {
    level,
    maxCells: options.maxCells,
    minLevel: options.minLevel,
  });

  return { ...cover, view };
}
