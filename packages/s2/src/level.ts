import {
  LevelSelector,
  selectLevel,
  type LevelInfo,
  type LevelSelectionOptions,
} from '@stevenpg/cesium-spatial-core';
import { s2 } from 's2js';
import { EARTH_RADIUS_METERS } from './types.js';

/** Coarsest S2 level: the six cube faces. */
export const MIN_LEVEL = 0;
/** Finest S2 level, where cells are roughly a centimeter across. */
export const MAX_LEVEL = 30;

/** Average area of an S2 cell at a level, in square meters. */
export function levelAreaMeters(level: number): number {
  const steradians = s2.Cell.fromCellID(s2.cellid.fromFace(0)).averageArea();
  return (steradians / 4 ** clampLevel(level)) * EARTH_RADIUS_METERS ** 2;
}

/**
 * Typical edge length of an S2 cell at a level, in meters.
 *
 * Taken as the square root of the average cell area rather than from S2's
 * average-edge metric, which the library does not export. The two agree to
 * within one percent, and this way the figure is derived from the library
 * rather than a copied constant.
 */
export function levelEdgeMeters(level: number): number {
  return Math.sqrt(levelAreaMeters(level));
}

/** Every S2 level with its typical cell edge length, for level-of-detail work. */
export const S2_LEVELS: readonly LevelInfo[] = Object.freeze(
  Array.from({ length: MAX_LEVEL + 1 }, (_, level) => ({
    level,
    edgeLengthMeters: levelEdgeMeters(level),
  })),
);

/** Chooses the level whose cells are closest to `targetEdgePixels` on screen. */
export function levelForMetersPerPixel(
  metersPerPixel: number,
  options: LevelSelectionOptions = {},
): number {
  return selectLevel(S2_LEVELS, metersPerPixel, options);
}

/**
 * A level picker with hysteresis, for cameras that move continuously.
 *
 * Prefer this over {@link levelForMetersPerPixel} when reacting to camera
 * movement, so small nudges near a level boundary do not rebuild the layer.
 */
export function createLevelSelector(
  options: LevelSelectionOptions & { deadband?: number } = {},
): LevelSelector {
  return new LevelSelector(S2_LEVELS, options);
}

/** Clamps a level into the valid S2 range and rounds it to an integer. */
export function clampLevel(level: number): number {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)));
}
