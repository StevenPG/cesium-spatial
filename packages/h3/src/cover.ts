import { Ellipsoid, Math as CesiumMath, Rectangle } from 'cesium';
import { rectangleAreaMeters } from '@stevenpg/cesium-spatial-core';
import { polygonToCells } from 'h3-js';
import { MIN_RESOLUTION, clampResolution, resolutionAreaMeters } from './resolution.js';
import type { H3Cell } from './types.js';

/** Options for the budget-aware cover helpers. */
export interface CoverOptions {
  /** Resolution to aim for. Coarsened as needed to respect `maxCells`. */
  resolution: number;
  /**
   * Upper bound on how many cells to produce. The cover steps to coarser
   * resolutions until the estimate fits. Defaults to 20000.
   */
  maxCells?: number;
  /** Never go coarser than this while respecting the budget. */
  minResolution?: number;
  /** The ellipsoid used for area estimates. Defaults to WGS84. */
  ellipsoid?: Ellipsoid;
}

/** The outcome of a budget-aware cover. */
export interface CoverResult {
  cells: H3Cell[];
  /** The resolution actually used, which may be coarser than requested. */
  resolution: number;
  /** True when the cell budget forced a coarser resolution than requested. */
  coarsened: boolean;
}

const DEFAULT_MAX_CELLS = 20_000;

/**
 * Widest longitude span handed to H3 in one piece.
 *
 * H3 infers that a polygon crosses the antimeridian whenever consecutive
 * longitudes jump more than 180 degrees, and it has no way to be told
 * otherwise. A rectangle wider than that is therefore read as its own
 * complement: asking for the 200 degrees around Greenwich silently returns the
 * 160 degrees around the dateline instead. Splitting into narrower segments
 * removes the ambiguity, and correctly covers wrapping rectangles as a side
 * effect.
 */
const MAX_SEGMENT_RADIANS = CesiumMath.PI_OVER_TWO;

/**
 * Every cell whose center falls inside a rectangle.
 *
 * Handles rectangles that wrap the antimeridian (`west > east`) and rectangles
 * wide enough to confuse H3's own antimeridian heuristic.
 */
export function cellsInRectangle(rectangle: Rectangle, resolution: number): H3Cell[] {
  const res = clampResolution(resolution);
  const cells = new Set<H3Cell>();
  for (const segment of splitByLongitude(rectangle, MAX_SEGMENT_RADIANS)) {
    for (const cell of polygonToCells(rectangleToRing(segment), res, true)) cells.add(cell);
  }
  return [...cells];
}

/**
 * Cuts a rectangle into longitude slices no wider than `maxWidth`, walking east
 * from `west` so wrapping rectangles come out in the right order.
 */
export function splitByLongitude(rectangle: Rectangle, maxWidth: number): Rectangle[] {
  const width = Rectangle.computeWidth(rectangle);
  const count = Math.max(1, Math.ceil(width / maxWidth));
  if (count === 1) return [rectangle];

  const step = width / count;
  const segments: Rectangle[] = [];
  for (let i = 0; i < count; i++) {
    const west = CesiumMath.negativePiToPi(rectangle.west + i * step);
    const east = CesiumMath.negativePiToPi(rectangle.west + (i + 1) * step);
    segments.push(new Rectangle(west, rectangle.south, east, rectangle.north));
  }
  return segments;
}

/**
 * Every cell whose center falls inside a polygon.
 *
 * `ring` is a flat `[lng, lat, ...]` list in degrees; `holes` are interior
 * rings in the same form.
 */
export function cellsInPolygon(
  ring: number[],
  resolution: number,
  holes: readonly number[][] = [],
): H3Cell[] {
  const coordinates = [toCoordinatePairs(ring), ...holes.map(toCoordinatePairs)];
  return polygonToCells(coordinates, clampResolution(resolution), true);
}

/**
 * Roughly how many cells at `resolution` it takes to fill a rectangle.
 *
 * Cheap enough to call before generating anything, which is the point: it lets
 * a cover back off to a coarser resolution without first materialising a set
 * that could be millions of cells.
 */
export function estimateCellCount(
  rectangle: Rectangle,
  resolution: number,
  ellipsoid: Ellipsoid = Ellipsoid.WGS84,
): number {
  const area = rectangleAreaMeters(rectangle, ellipsoid);
  return Math.ceil(area / resolutionAreaMeters(clampResolution(resolution)));
}

/**
 * Covers a rectangle with cells, stepping to a coarser resolution rather than
 * exceeding the cell budget.
 */
export function coverRectangle(rectangle: Rectangle, options: CoverOptions): CoverResult {
  const {
    maxCells = DEFAULT_MAX_CELLS,
    minResolution = MIN_RESOLUTION,
    ellipsoid = Ellipsoid.WGS84,
  } = options;

  const requested = clampResolution(options.resolution);
  const floor = clampResolution(minResolution);
  let resolution = requested;

  while (resolution > floor && estimateCellCount(rectangle, resolution, ellipsoid) > maxCells) {
    resolution--;
  }

  return {
    cells: cellsInRectangle(rectangle, resolution),
    resolution,
    coarsened: resolution < requested,
  };
}

/** The four corners of a rectangle as a flat `[lng, lat, ...]` ring in degrees. */
export function rectangleToDegreeRing(rectangle: Rectangle): number[] {
  const west = CesiumMath.toDegrees(rectangle.west);
  const east = CesiumMath.toDegrees(rectangle.east);
  const south = clampLatitude(CesiumMath.toDegrees(rectangle.south));
  const north = clampLatitude(CesiumMath.toDegrees(rectangle.north));
  return [west, south, east, south, east, north, west, north];
}

function rectangleToRing(rectangle: Rectangle): number[][] {
  return toCoordinatePairs(rectangleToDegreeRing(rectangle));
}

function toCoordinatePairs(ring: number[]): number[][] {
  const pairs: number[][] = [];
  for (let i = 0; i < ring.length; i += 2) pairs.push([ring[i], ring[i + 1]]);
  return pairs;
}

/** H3 rejects latitudes outside the sphere; Cesium rectangles can graze them. */
function clampLatitude(latitude: number): number {
  return Math.min(89.999999, Math.max(-89.999999, latitude));
}
