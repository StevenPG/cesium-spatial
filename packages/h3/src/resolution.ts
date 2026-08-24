import {
  LevelSelector,
  selectLevel,
  type LevelInfo,
  type LevelSelectionOptions,
} from '@stevenpg/cesium-spatial-core';
import { UNITS, getHexagonAreaAvg, getHexagonEdgeLengthAvg } from 'h3-js';

/** Coarsest H3 resolution. */
export const MIN_RESOLUTION = 0;
/** Finest H3 resolution. */
export const MAX_RESOLUTION = 15;

/**
 * Average edge length of an H3 cell at every resolution, in meters.
 *
 * Read from h3-js rather than hard-coded so the table stays correct if the
 * library's constants are ever refined.
 */
export const H3_RESOLUTIONS: readonly LevelInfo[] = Object.freeze(
  Array.from({ length: MAX_RESOLUTION + 1 }, (_, level) => ({
    level,
    edgeLengthMeters: getHexagonEdgeLengthAvg(level, UNITS.m),
  })),
);

/** Average area of an H3 cell at a resolution, in square meters. */
export function resolutionAreaMeters(resolution: number): number {
  return getHexagonAreaAvg(resolution, UNITS.m2);
}

/** Average edge length of an H3 cell at a resolution, in meters. */
export function resolutionEdgeMeters(resolution: number): number {
  return getHexagonEdgeLengthAvg(resolution, UNITS.m);
}

/**
 * Chooses the H3 resolution whose cells are closest to `targetEdgePixels`
 * across on screen at the given ground resolution.
 */
export function resolutionForMetersPerPixel(
  metersPerPixel: number,
  options: LevelSelectionOptions = {},
): number {
  return selectLevel(H3_RESOLUTIONS, metersPerPixel, options);
}

/**
 * A resolution picker with hysteresis, for cameras that move continuously.
 *
 * Prefer this over {@link resolutionForMetersPerPixel} when reacting to camera
 * movement, so small nudges near a resolution boundary do not rebuild the layer.
 */
export function createResolutionSelector(
  options: LevelSelectionOptions & { deadband?: number } = {},
): LevelSelector {
  return new LevelSelector(H3_RESOLUTIONS, options);
}

/** Clamps a resolution into the valid H3 range and rounds it to an integer. */
export function clampResolution(resolution: number): number {
  return Math.min(MAX_RESOLUTION, Math.max(MIN_RESOLUTION, Math.round(resolution)));
}
