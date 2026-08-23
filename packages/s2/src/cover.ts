import { Ellipsoid, type Rectangle } from 'cesium';
import { rectangleAreaMeters } from '@stevenpg/cesium-spatial-core';
import { r1, s1, s2 } from 's2js';
import { MIN_LEVEL, clampLevel, levelAreaMeters } from './level.js';
import { toToken } from './cells.js';
import type { S2Cell } from './types.js';

const { RegionCoverer, Rect } = s2;

/** Options for the budget-aware cover helpers. */
export interface CoverOptions {
  /** Level to aim for. Coarsened as needed to respect `maxCells`. */
  level: number;
  /**
   * Upper bound on how many cells to produce. The cover steps to coarser
   * levels until the estimate fits. Defaults to 20000.
   */
  maxCells?: number;
  /** Never go coarser than this while respecting the budget. */
  minLevel?: number;
  /** The ellipsoid used for area estimates. Defaults to WGS84. */
  ellipsoid?: Ellipsoid;
}

/** The outcome of a budget-aware cover. */
export interface CoverResult {
  cells: S2Cell[];
  /** The level actually used, which may be coarser than requested. */
  level: number;
  /** True when the cell budget forced a coarser level than requested. */
  coarsened: boolean;
}

/** Options for S2's native mixed-level covering. */
export interface AdaptiveCoverOptions {
  /** Target number of cells. S2 trades level for count to approach this. */
  maxCells?: number;
  /** Coarsest level the covering may use. */
  minLevel?: number;
  /** Finest level the covering may use. */
  maxLevel?: number;
  /** Return only cells fully inside the region, rather than covering it. */
  interior?: boolean;
}

const DEFAULT_MAX_CELLS = 20_000;

/**
 * Converts a Cesium rectangle into an S2 rectangle.
 *
 * S2's longitude interval represents wrapping natively, so a Cesium rectangle
 * that crosses the antimeridian (`west > east`) becomes an inverted interval
 * and needs none of the splitting H3 requires.
 */
export function toS2Rect(rectangle: Rectangle): s2.Rect {
  return new Rect(
    new r1.Interval(rectangle.south, rectangle.north),
    new s1.Interval(rectangle.west, rectangle.east),
  );
}

/**
 * Every cell at exactly `level` that intersects a rectangle.
 *
 * S2's coverer treats a minimum level as non-negotiable and will happily return
 * millions of cells rather than truncate, so callers driving this from a camera
 * should go through {@link coverRectangle} and its budget instead.
 */
export function cellsInRectangle(rectangle: Rectangle, level: number): S2Cell[] {
  const target = clampLevel(level);
  const coverer = new RegionCoverer({
    minLevel: target,
    maxLevel: target,
    // Only a work hint here, since an exact level overrides it entirely.
    maxCells: 1024,
  });
  return [...coverer.covering(toS2Rect(rectangle))].map(toToken);
}

/**
 * S2's native covering: a mixed-level set of cells approximating the region.
 *
 * This is what S2 is actually good at, and has no H3 equivalent. Rather than
 * one level everywhere, it uses coarse cells in the interior and fine cells
 * along the edges to hit a cell count.
 */
export function adaptiveCover(rectangle: Rectangle, options: AdaptiveCoverOptions = {}): S2Cell[] {
  const coverer = new RegionCoverer({
    minLevel: clampLevel(options.minLevel ?? MIN_LEVEL),
    maxLevel: clampLevel(options.maxLevel ?? 30),
    maxCells: options.maxCells ?? 64,
  });
  const region = toS2Rect(rectangle);
  const covering = options.interior ? coverer.interiorCovering(region) : coverer.covering(region);
  return [...covering].map(toToken);
}

/**
 * Roughly how many cells at `level` it takes to fill a rectangle.
 *
 * Cheap enough to call before generating anything, which is the point: it lets
 * a cover back off to a coarser level without first materialising a set that
 * could be billions of cells.
 */
export function estimateCellCount(
  rectangle: Rectangle,
  level: number,
  ellipsoid: Ellipsoid = Ellipsoid.WGS84,
): number {
  const area = rectangleAreaMeters(rectangle, ellipsoid);
  return Math.ceil(area / levelAreaMeters(clampLevel(level)));
}

/**
 * Covers a rectangle with uniform-level cells, stepping to a coarser level
 * rather than exceeding the cell budget.
 */
export function coverRectangle(rectangle: Rectangle, options: CoverOptions): CoverResult {
  const {
    maxCells = DEFAULT_MAX_CELLS,
    minLevel = MIN_LEVEL,
    ellipsoid = Ellipsoid.WGS84,
  } = options;

  const requested = clampLevel(options.level);
  const floor = clampLevel(minLevel);
  let level = requested;

  while (level > floor && estimateCellCount(rectangle, level, ellipsoid) > maxCells) {
    level--;
  }

  return {
    cells: cellsInRectangle(rectangle, level),
    level,
    coarsened: level < requested,
  };
}
