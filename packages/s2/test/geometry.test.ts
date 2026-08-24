import { Math as CesiumMath, Rectangle } from 'cesium';
import { describe, expect, it } from 'vitest';
import { s2 } from 's2js';
import { crossesAntimeridian } from '@stevenpg/cesium-spatial-core';
import { cellAt, faceOf, toCellId, toToken } from '../src/cells.js';
import {
  cellToLngLat,
  cellToRectangle,
  cellToRing,
  clearBoundaryCache,
  containsPoleInterior,
  getCellBoundary,
} from '../src/geometry.js';

const face = (index: number) => toToken(s2.cellid.fromFace(index));

describe('cellToRing', () => {
  it('produces four corners when densifying is off', () => {
    const ring = cellToRing(cellAt(-122.4194, 37.7749, 13), { maxEdgeMeters: 0 });
    expect(ring).toHaveLength(8);
  });

  it('leaves the ring open, as polygon geometry expects', () => {
    const ring = cellToRing(cellAt(0, 0, 10), { maxEdgeMeters: 0 });
    expect(ring.slice(0, 2)).not.toEqual(ring.slice(-2));
  });

  it('densifies the quarter-turn edges of a face cell', () => {
    // A level 0 edge spans 90 degrees, so four corners would cut through the globe.
    const bare = cellToRing(face(0), { maxEdgeMeters: 0 });
    const dense = cellToRing(face(0));
    expect(bare).toHaveLength(8);
    expect(dense.length).toBeGreaterThan(200);
  });

  it('leaves fine cells untouched, since their edges are already short', () => {
    const cell = cellAt(-122.4194, 37.7749, 13);
    expect(cellToRing(cell)).toEqual(cellToRing(cell, { maxEdgeMeters: 0 }));
  });

  it('keeps longitudes continuous across the antimeridian', () => {
    const ring = cellToRing(cellAt(179.99, 0, 10));
    expect(crossesAntimeridian(ring)).toBe(false);
  });
});

describe('containsPoleInterior', () => {
  it('flags exactly the two polar cube faces', () => {
    const flagged = [0, 1, 2, 3, 4, 5].filter((index) => containsPoleInterior(face(index)));
    expect(flagged).toEqual([2, 5]);
  });

  it('is false from level 1 down, where a pole is a shared corner', () => {
    const polarChildren = s2.cellid.children(s2.cellid.fromFace(2)).map(toToken);
    expect(polarChildren.every((cell) => !containsPoleInterior(cell))).toBe(true);
    expect(containsPoleInterior(cellAt(0, 89.999, 20))).toBe(false);
  });
});

describe('cellToRectangle', () => {
  it("uses S2's own bound, which accounts for geodesic bulge", () => {
    const cell = face(0);
    const bound = cellToRectangle(cell);
    // The corners sit at +/-35.26 degrees but the edges bulge to +/-45.
    expect(CesiumMath.toDegrees(bound.north)).toBeCloseTo(45, 1);
    expect(CesiumMath.toDegrees(bound.south)).toBeCloseTo(-45, 1);
  });

  it('reaches the pole for a polar face', () => {
    expect(CesiumMath.toDegrees(cellToRectangle(face(2)).north)).toBeCloseTo(90, 3);
    expect(CesiumMath.toDegrees(cellToRectangle(face(5)).south)).toBeCloseTo(-90, 3);
  });

  it('bounds an ordinary cell tightly around its center', () => {
    const cell = cellAt(-122.4194, 37.7749, 13);
    const bound = cellToRectangle(cell);
    const [longitude, latitude] = cellToLngLat(cell);
    expect(Rectangle.contains(bound, Rectangle.center(bound))).toBe(true);
    expect(longitude).toBeCloseTo(-122.4194, 1);
    expect(latitude).toBeCloseTo(37.7749, 1);
  });
});

describe('getCellBoundary', () => {
  it('returns a stable, cached instance keyed by token', () => {
    clearBoundaryCache();
    const cell = cellAt(-0.12, 51.5, 14);
    const first = getCellBoundary(cell);
    expect(getCellBoundary(cell)).toBe(first);
    clearBoundaryCache();
    expect(getCellBoundary(cell)).not.toBe(first);
  });

  it('keys a bigint and its token to the same entry', () => {
    clearBoundaryCache();
    const cell = cellAt(0, 0, 12);
    const viaToken = getCellBoundary(cell);
    expect(getCellBoundary(toCellId(cell))).toBe(viaToken);
  });
});

describe('faces', () => {
  it('cover all six cube faces across the globe', () => {
    const seen = new Set([
      faceOf(cellAt(0, 0, 5)),
      faceOf(cellAt(90, 0, 5)),
      faceOf(cellAt(180, 0, 5)),
      faceOf(cellAt(-90, 0, 5)),
      faceOf(cellAt(0, 89, 5)),
      faceOf(cellAt(0, -89, 5)),
    ]);
    expect(seen.size).toBe(6);
  });
});
