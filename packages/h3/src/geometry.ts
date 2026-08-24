import { Cartesian3, Cartographic, Rectangle } from 'cesium';
import { ringToRectangle, type CellBoundary } from '@stevenpg/cesium-spatial-core';
import { cellToBoundary, cellToLatLng } from 'h3-js';
import type { H3Cell } from './types.js';

/**
 * The cell's outline as a flat, open `[lng, lat, ...]` ring in degrees.
 *
 * h3-js reports boundaries as `[lat, lng]` pairs; this is the form Cesium's
 * `fromDegreesArray` helpers expect.
 */
export function cellToRing(cell: H3Cell): number[] {
  const boundary = cellToBoundary(cell);
  const ring = new Array<number>(boundary.length * 2);
  for (let i = 0; i < boundary.length; i++) {
    ring[i * 2] = boundary[i][1];
    ring[i * 2 + 1] = boundary[i][0];
  }
  return ring;
}

/** The cell's outline in the shape the rendering layers consume. */
export function cellToCellBoundary(cell: H3Cell): CellBoundary {
  return { id: cell, ring: cellToRing(cell) };
}

/** Boundaries for many cells, in input order. */
export function cellsToBoundaries(cells: readonly H3Cell[]): CellBoundary[] {
  return cells.map(cellToCellBoundary);
}

/** Cartesian positions for the cell's outline, ready for a Cesium geometry. */
export function cellToPositions(cell: H3Cell, height = 0): Cartesian3[] {
  const ring = cellToRing(cell);
  const withHeights = new Array<number>((ring.length / 2) * 3);
  for (let i = 0, j = 0; i < ring.length; i += 2, j += 3) {
    withHeights[j] = ring[i];
    withHeights[j + 1] = ring[i + 1];
    withHeights[j + 2] = height;
  }
  return Cartesian3.fromDegreesArrayHeights(withHeights);
}

/** The cell's center. */
export function cellToCartographic(cell: H3Cell, height = 0): Cartographic {
  const [lat, lng] = cellToLatLng(cell);
  return Cartographic.fromDegrees(lng, lat, height);
}

/** The cell's center as a Cartesian position. */
export function cellToCartesian(cell: H3Cell, height = 0): Cartesian3 {
  const [lat, lng] = cellToLatLng(cell);
  return Cartesian3.fromDegrees(lng, lat, height);
}

/** Bounding rectangle for the cell, correct across the antimeridian. */
export function cellToRectangle(cell: H3Cell, result?: Rectangle): Rectangle {
  return ringToRectangle(cellToRing(cell), result);
}

/** Bounding rectangle covering every given cell. */
export function cellsToRectangle(cells: readonly H3Cell[]): Rectangle | undefined {
  if (cells.length === 0) return undefined;
  const rectangles = cells.map((cell) => cellToRectangle(cell));
  return rectangles.reduce((accumulated, next) => Rectangle.union(accumulated, next));
}

/** The cell's center as `[longitude, latitude]` in degrees. */
export function cellToLngLat(cell: H3Cell): [number, number] {
  const [lat, lng] = cellToLatLng(cell);
  return [lng, lat];
}

/**
 * Cell boundaries are stable, so recomputing them while panning is wasted work.
 * The cache is bounded and cleared wholesale when full rather than tracking
 * recency, which costs a rare recompute and keeps lookups free.
 */
const MAX_CACHED_BOUNDARIES = 200_000;
const boundaryCache = new Map<H3Cell, CellBoundary>();

/** {@link cellToCellBoundary} with memoization. Safe to call every frame. */
export function getCellBoundary(cell: H3Cell): CellBoundary {
  const cached = boundaryCache.get(cell);
  if (cached) return cached;
  if (boundaryCache.size >= MAX_CACHED_BOUNDARIES) boundaryCache.clear();
  const boundary = cellToCellBoundary(cell);
  boundaryCache.set(cell, boundary);
  return boundary;
}

/** Cached boundaries for many cells, in input order. */
export function getCellBoundaries(cells: readonly H3Cell[]): CellBoundary[] {
  return cells.map(getCellBoundary);
}

/** Empties the boundary cache. */
export function clearBoundaryCache(): void {
  boundaryCache.clear();
}
