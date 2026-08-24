import {
  areNeighborCells,
  cellArea,
  cellToCenterChild,
  cellToChildren,
  cellToParent,
  compactCells,
  getResolution,
  gridDisk,
  gridDiskDistances,
  gridDistance,
  gridPathCells,
  isPentagon,
  isValidCell,
  latLngToCell,
  uncompactCells,
  UNITS,
} from 'h3-js';
import type { Cartographic } from 'cesium';
import { MAX_RESOLUTION, clampResolution } from './resolution.js';
import type { H3Cell } from './types.js';

/** The cell containing a longitude/latitude in degrees. */
export function cellAt(longitude: number, latitude: number, resolution: number): H3Cell {
  return latLngToCell(latitude, longitude, clampResolution(resolution));
}

/** The cell containing a Cesium `Cartographic` position. */
export function cellAtCartographic(position: Cartographic, resolution: number): H3Cell {
  const degrees = 180 / Math.PI;
  return cellAt(position.longitude * degrees, position.latitude * degrees, resolution);
}

/** Whether a string is a well-formed H3 cell index. */
export function isValid(cell: string): boolean {
  return isValidCell(cell);
}

/** The cell's resolution, 0 (coarsest) through 15 (finest). */
export function resolutionOf(cell: H3Cell): number {
  return getResolution(cell);
}

/**
 * Whether the cell is one of H3's twelve pentagons.
 *
 * Pentagons have five neighbors instead of six and break the assumptions
 * behind several fast-path traversals, so anything drawing directional
 * geometry should check.
 */
export function isPentagonCell(cell: H3Cell): boolean {
  return isPentagon(cell);
}

/**
 * The cells sharing an edge with this one: six of them, or five for a pentagon.
 *
 * Uses the pentagon-safe traversal, so this is correct everywhere on the globe.
 */
export function neighbors(cell: H3Cell): H3Cell[] {
  return gridDisk(cell, 1).filter((candidate) => candidate !== cell);
}

/** Every cell within `k` steps of this one, including the cell itself. */
export function disk(cell: H3Cell, k: number): H3Cell[] {
  return gridDisk(cell, Math.max(0, Math.trunc(k)));
}

/**
 * Only the cells exactly `k` steps away, forming a hollow ring.
 *
 * Derived from the distance-annotated disk rather than the fast ring routine,
 * which returns nothing when the ring touches a pentagon.
 */
export function ring(cell: H3Cell, k: number): H3Cell[] {
  const steps = Math.max(0, Math.trunc(k));
  const rings = gridDiskDistances(cell, steps);
  return rings[steps] ?? [];
}

/** The disk around a cell, grouped by distance: index 0 is the cell itself. */
export function diskByDistance(cell: H3Cell, k: number): H3Cell[][] {
  return gridDiskDistances(cell, Math.max(0, Math.trunc(k)));
}

/** Whether two cells share an edge. */
export function areNeighbors(a: H3Cell, b: H3Cell): boolean {
  return areNeighborCells(a, b);
}

/**
 * Grid distance in cells between two cells of the same resolution.
 *
 * Throws for cells that are far apart or on opposite sides of an icosahedron
 * edge, which is a property of the H3 grid rather than a bug.
 */
export function distanceBetween(a: H3Cell, b: H3Cell): number {
  return gridDistance(a, b);
}

/** The chain of cells forming a line from `a` to `b`, inclusive. */
export function pathBetween(a: H3Cell, b: H3Cell): H3Cell[] {
  return gridPathCells(a, b);
}

/** The containing cell one resolution coarser, or at `resolution` when given. */
export function parent(cell: H3Cell, resolution?: number): H3Cell {
  const target = resolution ?? getResolution(cell) - 1;
  return cellToParent(cell, clampResolution(target));
}

/** Every ancestor from one step coarser up to resolution 0. */
export function ancestors(cell: H3Cell): H3Cell[] {
  const out: H3Cell[] = [];
  for (let resolution = getResolution(cell) - 1; resolution >= 0; resolution--) {
    out.push(cellToParent(cell, resolution));
  }
  return out;
}

/** The contained cells one resolution finer, or at `resolution` when given. */
export function children(cell: H3Cell, resolution?: number): H3Cell[] {
  const target = resolution ?? getResolution(cell) + 1;
  if (target > MAX_RESOLUTION) return [];
  return cellToChildren(cell, clampResolution(target));
}

/** The single child at the center of this cell. */
export function centerChild(cell: H3Cell, resolution?: number): H3Cell {
  const target = resolution ?? getResolution(cell) + 1;
  return cellToCenterChild(cell, clampResolution(target));
}

/**
 * Replaces complete groups of children with their parent, repeatedly.
 *
 * The usual reason to reach for this is drawing: a compacted set covers the
 * same ground with far fewer polygons, at the cost of mixed resolutions.
 */
export function compact(cells: readonly H3Cell[]): H3Cell[] {
  return compactCells([...cells]);
}

/** Expands a mixed-resolution set back to uniform cells at `resolution`. */
export function uncompact(cells: readonly H3Cell[], resolution: number): H3Cell[] {
  return uncompactCells([...cells], clampResolution(resolution));
}

/** Exact area of a cell in square meters. */
export function cellAreaMeters(cell: H3Cell): number {
  return cellArea(cell, UNITS.m2);
}
