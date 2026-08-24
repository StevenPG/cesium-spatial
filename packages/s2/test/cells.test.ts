import { describe, expect, it } from 'vitest';
import { s2 } from 's2js';
import {
  allNeighbors,
  ancestors,
  cellAreaMeters,
  cellAt,
  children,
  childrenAtLevel,
  compact,
  contains,
  faceOf,
  isValid,
  levelOf,
  neighbors,
  parent,
  toCellId,
  toToken,
  uncompact,
  vertexNeighbors,
} from '../src/cells.js';

const SAN_FRANCISCO = cellAt(-122.4194, 37.7749, 13);

describe('cellAt', () => {
  it('takes longitude first, unlike the S2 library', () => {
    const viaLibrary = s2.cellid.toToken(
      s2.cellid.parent(s2.cellid.fromLatLng(s2.LatLng.fromDegrees(37.7749, -122.4194)), 13),
    );
    expect(SAN_FRANCISCO).toBe(viaLibrary);
  });

  it('clamps out-of-range levels instead of throwing', () => {
    expect(levelOf(cellAt(0, 0, 99))).toBe(30);
    expect(levelOf(cellAt(0, 0, -5))).toBe(0);
  });
});

describe('tokens', () => {
  it('round-trip through raw ids without loss', () => {
    expect(toToken(toCellId(SAN_FRANCISCO))).toBe(SAN_FRANCISCO);
  });

  it('accept a bigint anywhere a token is accepted', () => {
    const id = toCellId(SAN_FRANCISCO);
    expect(levelOf(id)).toBe(levelOf(SAN_FRANCISCO));
    expect(faceOf(id)).toBe(faceOf(SAN_FRANCISCO));
  });

  it('reject malformed input rather than throwing', () => {
    expect(isValid(SAN_FRANCISCO)).toBe(true);
    expect(isValid('not-a-token')).toBe(false);
    expect(isValid('')).toBe(false);
  });
});

describe('neighbors', () => {
  it('are always exactly four, unlike H3 pentagons', () => {
    expect(neighbors(SAN_FRANCISCO)).toHaveLength(4);
    // A cube-face corner cell is the worst case, and still has four.
    expect(neighbors(cellAt(0, 90, 5))).toHaveLength(4);
    expect(neighbors(toToken(s2.cellid.fromFace(2)))).toHaveLength(4);
  });

  it('exclude the cell itself and share its level', () => {
    const result = neighbors(SAN_FRANCISCO);
    expect(result).not.toContain(SAN_FRANCISCO);
    expect(result.every((cell) => levelOf(cell) === 13)).toBe(true);
  });

  it('vertex neighbors touch at corners', () => {
    expect(vertexNeighbors(SAN_FRANCISCO).length).toBeGreaterThan(0);
    expect(allNeighbors(SAN_FRANCISCO).length).toBeGreaterThanOrEqual(4);
  });
});

describe('hierarchy', () => {
  it('parent defaults to one level coarser', () => {
    expect(levelOf(parent(SAN_FRANCISCO))).toBe(12);
    expect(levelOf(parent(SAN_FRANCISCO, 4))).toBe(4);
  });

  it('ancestors run from one level up to the cube face', () => {
    const result = ancestors(SAN_FRANCISCO);
    expect(result).toHaveLength(13);
    expect(levelOf(result[0])).toBe(12);
    expect(levelOf(result[result.length - 1])).toBe(0);
    expect(result[result.length - 1]).toBe(toToken(s2.cellid.fromFace(faceOf(SAN_FRANCISCO))));
  });

  it('children are always four, and contained by their parent', () => {
    const result = children(SAN_FRANCISCO);
    expect(result).toHaveLength(4);
    expect(result.every((child) => contains(SAN_FRANCISCO, child))).toBe(true);
    expect(result.every((child) => levelOf(child) === 14)).toBe(true);
  });

  it('children of the finest level is empty rather than an error', () => {
    expect(children(cellAt(0, 0, 30))).toEqual([]);
  });

  it('childrenAtLevel expands by a factor of four per level', () => {
    expect(childrenAtLevel(SAN_FRANCISCO, 15)).toHaveLength(16);
    expect(childrenAtLevel(SAN_FRANCISCO, 13)).toEqual([SAN_FRANCISCO]);
  });

  it('childrenAtLevel refuses to materialise an absurd expansion', () => {
    expect(() => childrenAtLevel(SAN_FRANCISCO, 30)).toThrow(/limit/i);
  });
});

describe('compact', () => {
  it('collapses four siblings back into their parent', () => {
    expect(compact(children(SAN_FRANCISCO))).toEqual([SAN_FRANCISCO]);
  });

  it('round-trips through uncompact', () => {
    const expanded = uncompact([SAN_FRANCISCO], 16);
    expect(expanded).toHaveLength(64);
    expect(compact(expanded)).toEqual([SAN_FRANCISCO]);
  });
});

describe('cellAreaMeters', () => {
  it('sums to the sphere across the six faces', () => {
    const faces = [0, 1, 2, 3, 4, 5].map((face) => toToken(s2.cellid.fromFace(face)));
    const total = faces.reduce((sum, face) => sum + cellAreaMeters(face), 0);
    // 4 pi R^2 with S2's earth radius, about 5.10e14 square meters.
    expect(total).toBeGreaterThan(5.0e14);
    expect(total).toBeLessThan(5.2e14);
  });

  it('shrinks by roughly four per level', () => {
    const coarse = cellAreaMeters(parent(SAN_FRANCISCO));
    const fine = cellAreaMeters(SAN_FRANCISCO);
    expect(coarse / fine).toBeGreaterThan(3.5);
    expect(coarse / fine).toBeLessThan(4.5);
  });
});
