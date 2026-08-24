import type { Cartographic } from 'cesium';
import { s2 } from 's2js';
import { MAX_LEVEL, clampLevel } from './level.js';
import { EARTH_RADIUS_METERS, type S2Cell, type S2CellInput } from './types.js';

const { cellid, Cell, CellUnion, LatLng } = s2;

/** Resolves either form of cell reference to a raw 64-bit id. */
export function toCellId(cell: S2CellInput): bigint {
  return typeof cell === 'bigint' ? cell : cellid.fromToken(cell);
}

/** The canonical token for a raw 64-bit cell id. */
export function toToken(id: bigint): S2Cell {
  return cellid.toToken(id);
}

/** The cell containing a longitude/latitude in degrees. */
export function cellAt(longitude: number, latitude: number, level: number): S2Cell {
  const leaf = cellid.fromLatLng(LatLng.fromDegrees(latitude, longitude));
  return toToken(cellid.parent(leaf, clampLevel(level)));
}

/** The cell containing a Cesium `Cartographic` position. */
export function cellAtCartographic(position: Cartographic, level: number): S2Cell {
  const degrees = 180 / Math.PI;
  return cellAt(position.longitude * degrees, position.latitude * degrees, level);
}

/** Whether a token names a well-formed S2 cell. */
export function isValid(cell: S2CellInput): boolean {
  try {
    return cellid.valid(toCellId(cell));
  } catch {
    return false;
  }
}

/** The cell's level, 0 (a cube face) through 30 (roughly a centimeter). */
export function levelOf(cell: S2CellInput): number {
  return cellid.level(toCellId(cell));
}

/** Which of the six cube faces the cell belongs to, 0 through 5. */
export function faceOf(cell: S2CellInput): number {
  return cellid.face(toCellId(cell));
}

/**
 * The four cells sharing an edge with this one.
 *
 * Unlike H3, S2 has no exceptional cells: every cell has exactly four edge
 * neighbors, including across cube-face boundaries and at the poles.
 */
export function neighbors(cell: S2CellInput): S2Cell[] {
  return cellid.edgeNeighbors(toCellId(cell)).map(toToken);
}

/** The cells touching this one at any of its four corners, at the same level. */
export function vertexNeighbors(cell: S2CellInput): S2Cell[] {
  const id = toCellId(cell);
  return cellid.vertexNeighbors(id, cellid.level(id)).map(toToken);
}

/** Every cell touching this one, by edge or by corner, at the given level. */
export function allNeighbors(cell: S2CellInput, level?: number): S2Cell[] {
  const id = toCellId(cell);
  return cellid.allNeighbors(id, clampLevel(level ?? cellid.level(id))).map(toToken);
}

/** Whether `cell` contains `other` anywhere in its subtree. */
export function contains(cell: S2CellInput, other: S2CellInput): boolean {
  return cellid.contains(toCellId(cell), toCellId(other));
}

/** Whether two cells overlap at all. */
export function intersects(cell: S2CellInput, other: S2CellInput): boolean {
  return cellid.intersects(toCellId(cell), toCellId(other));
}

/** The containing cell one level coarser, or at `level` when given. */
export function parent(cell: S2CellInput, level?: number): S2Cell {
  const id = toCellId(cell);
  const target = level ?? cellid.level(id) - 1;
  return toToken(cellid.parent(id, clampLevel(target)));
}

/** Every ancestor from one level up to the cube face at level 0. */
export function ancestors(cell: S2CellInput): S2Cell[] {
  const id = toCellId(cell);
  const out: S2Cell[] = [];
  for (let level = cellid.level(id) - 1; level >= 0; level--) {
    out.push(toToken(cellid.parent(id, level)));
  }
  return out;
}

/** The four cells one level finer. Empty at the finest level. */
export function children(cell: S2CellInput): S2Cell[] {
  const id = toCellId(cell);
  if (cellid.level(id) >= MAX_LEVEL) return [];
  return cellid.children(id).map(toToken);
}

/**
 * Every descendant at `level`.
 *
 * The count is four to the power of the level difference, so this refuses
 * anything beyond `maxCells` rather than locking up the tab.
 */
export function childrenAtLevel(cell: S2CellInput, level: number, maxCells = 100_000): S2Cell[] {
  const id = toCellId(cell);
  const target = clampLevel(level);
  const depth = target - cellid.level(id);
  if (depth < 0) return [];
  if (depth === 0) return [toToken(id)];

  const count = 4 ** depth;
  if (count > maxCells) {
    throw new RangeError(
      `Expanding to level ${target} would produce ${count} cells, over the ${maxCells} limit`,
    );
  }

  const out: S2Cell[] = [];
  const end = cellid.childEndAtLevel(id, target);
  for (
    let child = cellid.childBeginAtLevel(id, target);
    child !== end;
    child = cellid.next(child)
  ) {
    out.push(toToken(child));
  }
  return out;
}

/**
 * Replaces complete groups of four siblings with their parent, repeatedly.
 *
 * This is S2's normalization, and the usual reason to reach for it is drawing:
 * a normalized union covers the same ground with far fewer polygons, at the
 * cost of mixed levels.
 */
export function compact(cells: readonly S2CellInput[]): S2Cell[] {
  const union = new CellUnion(...cells.map(toCellId));
  union.normalize();
  return [...union].map(toToken);
}

/** Expands a mixed-level set into uniform cells at `level`. */
export function uncompact(cells: readonly S2CellInput[], level: number): S2Cell[] {
  const target = clampLevel(level);
  const union = new CellUnion(...cells.map(toCellId));
  union.denormalize(target, 1);
  return [...union].map(toToken);
}

/** Exact area of a cell in square meters. */
export function cellAreaMeters(cell: S2CellInput): number {
  return Cell.fromCellID(toCellId(cell)).exactArea() * EARTH_RADIUS_METERS ** 2;
}
