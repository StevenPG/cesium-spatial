import { Cartesian3, Cartographic, Rectangle } from 'cesium';
import { densifyRing, type CellBoundary } from '@stevenpg/cesium-spatial-core';
import { s2 } from 's2js';
import { toCellId } from './cells.js';
import type { S2Cell, S2CellInput } from './types.js';

const { cellid, Cell, LatLng } = s2;
const DEGREES = 180 / Math.PI;

/**
 * Longest cell edge drawn without extra vertices, in meters.
 *
 * S2 cell edges are geodesics spanning up to a quarter turn at level 0, so a
 * bare four-corner ring visibly cuts through the globe. Cells at level 8 and
 * finer are already shorter than this, making densification a no-op for the
 * levels a camera actually spends its time at.
 */
export const DEFAULT_MAX_EDGE_METERS = 200_000;

/** Options for boundary generation. */
export interface BoundaryOptions {
  /** Longest edge before extra vertices are inserted. Zero disables densifying. */
  maxEdgeMeters?: number;
}

/**
 * Whether the cell has a geographic pole strictly inside it, rather than on
 * its boundary.
 *
 * True only for the two polar cube faces at level 0. Their four corners all
 * sit at about 35.26 degrees latitude while the cell itself covers the pole,
 * so the ring circles the globe and any polygon built from it describes a band
 * rather than a cap. From level 1 down, a pole is always a shared corner of
 * four cells and needs no special treatment.
 */
export function containsPoleInterior(cell: S2CellInput): boolean {
  const id = toCellId(cell);
  if (cellid.level(id) !== 0) return false;
  const face = cellid.face(id);
  return face === 2 || face === 5;
}

/**
 * The cell's outline as a flat, open `[lng, lat, ...]` ring in degrees.
 *
 * Longitudes are made continuous, so a cell straddling the antimeridian yields
 * values past +/-180 rather than a ring that jumps the width of the globe.
 */
export function cellToRing(cell: S2CellInput, options: BoundaryOptions = {}): number[] {
  const geometry = Cell.fromCellID(toCellId(cell));
  const ring: number[] = [];
  for (let k = 0; k < 4; k++) {
    const vertex = LatLng.fromPoint(geometry.vertex(k));
    ring.push(vertex.lng * DEGREES, vertex.lat * DEGREES);
  }

  const maxEdge = options.maxEdgeMeters ?? DEFAULT_MAX_EDGE_METERS;
  return maxEdge > 0 ? densifyRing(ring, maxEdge) : ring;
}

/** The cell's outline in the shape the rendering layers consume. */
export function cellToCellBoundary(cell: S2CellInput, options?: BoundaryOptions): CellBoundary {
  const id = toCellId(cell);
  return { id: cellid.toToken(id), ring: cellToRing(id, options) };
}

/** Boundaries for many cells, in input order. */
export function cellsToBoundaries(
  cells: readonly S2CellInput[],
  options?: BoundaryOptions,
): CellBoundary[] {
  return cells.map((cell) => cellToCellBoundary(cell, options));
}

/** Cartesian positions for the cell's outline, ready for a Cesium geometry. */
export function cellToPositions(cell: S2CellInput, height = 0): Cartesian3[] {
  const ring = cellToRing(cell);
  const withHeights: number[] = [];
  for (let i = 0; i < ring.length; i += 2) withHeights.push(ring[i], ring[i + 1], height);
  return Cartesian3.fromDegreesArrayHeights(withHeights);
}

/** The cell's center. */
export function cellToCartographic(cell: S2CellInput, height = 0): Cartographic {
  const center = cellid.latLng(toCellId(cell));
  return Cartographic.fromDegrees(center.lng * DEGREES, center.lat * DEGREES, height);
}

/** The cell's center as a Cartesian position. */
export function cellToCartesian(cell: S2CellInput, height = 0): Cartesian3 {
  const center = cellid.latLng(toCellId(cell));
  return Cartesian3.fromDegrees(center.lng * DEGREES, center.lat * DEGREES, height);
}

/** The cell's center as `[longitude, latitude]` in degrees. */
export function cellToLngLat(cell: S2CellInput): [number, number] {
  const center = cellid.latLng(toCellId(cell));
  return [center.lng * DEGREES, center.lat * DEGREES];
}

/**
 * Bounding rectangle for the cell.
 *
 * Uses S2's own rectangle bound, which accounts for geodesic edges bulging
 * beyond the corners and for cells that contain a pole. Taking the extent of
 * the four corners alone would understate both.
 */
export function cellToRectangle(cell: S2CellInput, result?: Rectangle): Rectangle {
  const bound = Cell.fromCellID(toCellId(cell)).rectBound();
  const target = result ?? new Rectangle();
  target.west = bound.lng.lo;
  target.east = bound.lng.hi;
  target.south = bound.lat.lo;
  target.north = bound.lat.hi;
  return target;
}

/** Bounding rectangle covering every given cell. */
export function cellsToRectangle(cells: readonly S2CellInput[]): Rectangle | undefined {
  if (cells.length === 0) return undefined;
  return cells
    .map((cell) => cellToRectangle(cell))
    .reduce((accumulated, next) => Rectangle.union(accumulated, next));
}

/**
 * Cell boundaries are stable, so recomputing them while panning is wasted work.
 * The cache is bounded and cleared wholesale when full rather than tracking
 * recency, which costs a rare recompute and keeps lookups free.
 */
const MAX_CACHED_BOUNDARIES = 200_000;
const boundaryCache = new Map<S2Cell, CellBoundary>();

/** {@link cellToCellBoundary} with memoization. Safe to call every frame. */
export function getCellBoundary(cell: S2CellInput): CellBoundary {
  const token = typeof cell === 'string' ? cell : cellid.toToken(cell);
  const cached = boundaryCache.get(token);
  if (cached) return cached;
  if (boundaryCache.size >= MAX_CACHED_BOUNDARIES) boundaryCache.clear();
  const boundary = cellToCellBoundary(token);
  boundaryCache.set(token, boundary);
  return boundary;
}

/** Cached boundaries for many cells, in input order. */
export function getCellBoundaries(cells: readonly S2CellInput[]): CellBoundary[] {
  return cells.map(getCellBoundary);
}

/** Empties the boundary cache. */
export function clearBoundaryCache(): void {
  boundaryCache.clear();
}
