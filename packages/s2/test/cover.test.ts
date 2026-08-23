import { Rectangle } from 'cesium';
import { describe, expect, it } from 'vitest';
import { cellAt, contains, levelOf } from '../src/cells.js';
import {
  adaptiveCover,
  cellsInRectangle,
  coverRectangle,
  estimateCellCount,
  toS2Rect,
} from '../src/cover.js';
import { S2_LEVELS, levelForMetersPerPixel } from '../src/level.js';

const rectangle = (w: number, s: number, e: number, n: number) => Rectangle.fromDegrees(w, s, e, n);

describe('cellsInRectangle', () => {
  it('covers an ordinary rectangle at exactly the requested level', () => {
    const cells = cellsInRectangle(rectangle(-122.5, 37.7, -122.4, 37.8), 12);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((cell) => levelOf(cell) === 12)).toBe(true);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('includes the cell at the center of the rectangle', () => {
    const cells = new Set(cellsInRectangle(rectangle(-122.5, 37.7, -122.4, 37.8), 12));
    expect(cells.has(cellAt(-122.45, 37.75, 12))).toBe(true);
  });

  it('handles a wrapping rectangle without splitting it', () => {
    // S2's longitude interval represents wrapping natively, so unlike H3 this
    // needs no segmenting to come out the short way round.
    const wrapping = rectangle(179, -1, -179, 1);
    expect(wrapping.west).toBeGreaterThan(wrapping.east);

    const cells = new Set(cellsInRectangle(wrapping, 8));
    expect(cells.size).toBeGreaterThan(0);
    expect(cells.has(cellAt(179.5, 0, 8))).toBe(true);
    expect(cells.has(cellAt(-179.5, 0, 8))).toBe(true);
    expect(cells.has(cellAt(0, 0, 8))).toBe(false);
  });

  it('covers the longitudes requested for a rectangle wider than 180 degrees', () => {
    const cells = new Set(cellsInRectangle(rectangle(-100, -1, 100, 1), 6));
    for (const longitude of [-99, -50, 0, 50, 99]) {
      expect(cells.has(cellAt(longitude, 0, 6))).toBe(true);
    }
    expect(cells.has(cellAt(179, 0, 6))).toBe(false);
  });

  it('covers every longitude and both poles for a whole-globe rectangle', () => {
    const cells = new Set(cellsInRectangle(Rectangle.MAX_VALUE, 3));
    for (const longitude of [-179, -90, 0, 90, 179]) {
      expect(cells.has(cellAt(longitude, 0, 3))).toBe(true);
    }
    expect(cells.has(cellAt(0, 89.9, 3))).toBe(true);
    expect(cells.has(cellAt(0, -89.9, 3))).toBe(true);
  });
});

describe('toS2Rect', () => {
  it('marks a wrapping rectangle as an inverted longitude interval', () => {
    expect(toS2Rect(rectangle(179, -1, -179, 1)).lng.isInverted()).toBe(true);
    expect(toS2Rect(rectangle(-10, -1, 10, 1)).lng.isInverted()).toBe(false);
  });
});

describe('estimateCellCount', () => {
  it('lands within a factor of two of the real cover', () => {
    const extent = rectangle(-1, -1, 1, 1);
    const actual = cellsInRectangle(extent, 8).length;
    const estimate = estimateCellCount(extent, 8);
    expect(estimate).toBeGreaterThan(actual / 2);
    expect(estimate).toBeLessThan(actual * 2);
  });
});

describe('coverRectangle', () => {
  it('honors the requested level when it fits the budget', () => {
    const result = coverRectangle(rectangle(-0.1, -0.1, 0.1, 0.1), { level: 12, maxCells: 20_000 });
    expect(result.level).toBe(12);
    expect(result.coarsened).toBe(false);
  });

  it('coarsens instead of blowing the budget on a global view', () => {
    // Without the budget this would ask S2 for billions of cells, since a
    // minimum level overrides maxCells rather than truncating.
    const result = coverRectangle(Rectangle.MAX_VALUE, { level: 14, maxCells: 5000 });
    expect(result.level).toBeLessThan(14);
    expect(result.coarsened).toBe(true);
    expect(result.cells.length).toBeLessThanOrEqual(10_000);
  });

  it('never goes coarser than minLevel', () => {
    const result = coverRectangle(Rectangle.MAX_VALUE, { level: 14, maxCells: 1, minLevel: 2 });
    expect(result.level).toBe(2);
  });
});

describe('adaptiveCover', () => {
  it('returns a mixed-level covering that respects the cell target', () => {
    const cells = adaptiveCover(rectangle(-122.6, 37.6, -122.3, 37.9), {
      maxCells: 32,
      maxLevel: 16,
    });
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThanOrEqual(40);
    expect(new Set(cells.map(levelOf)).size).toBeGreaterThan(1);
  });

  it('an interior covering stays inside the region', () => {
    const extent = rectangle(-10, -10, 10, 10);
    const interior = adaptiveCover(extent, { maxCells: 32, maxLevel: 12, interior: true });
    const outer = adaptiveCover(extent, { maxCells: 32, maxLevel: 12 });
    expect(interior.length).toBeGreaterThan(0);
    // Every interior cell is covered by the outer covering's tree.
    expect(interior.every((cell) => outer.some((o) => o === cell || contains(o, cell)))).toBe(true);
  });
});

describe('S2_LEVELS', () => {
  it('covers every level, monotonically decreasing in edge length', () => {
    expect(S2_LEVELS).toHaveLength(31);
    for (let i = 1; i < S2_LEVELS.length; i++) {
      expect(S2_LEVELS[i].edgeLengthMeters).toBeLessThan(S2_LEVELS[i - 1].edgeLengthMeters);
    }
  });

  it('halves the edge length each level, as S2 subdivision implies', () => {
    for (let i = 1; i < S2_LEVELS.length; i++) {
      const ratio = S2_LEVELS[i - 1].edgeLengthMeters / S2_LEVELS[i].edgeLengthMeters;
      expect(ratio).toBeCloseTo(2, 6);
    }
  });

  it('maps ground resolution onto a sensible level', () => {
    // ~1 m/px is roughly a city-block view.
    expect(levelForMetersPerPixel(1)).toBeGreaterThanOrEqual(16);
    // ~10 km/px is roughly a continental view.
    expect(levelForMetersPerPixel(10_000)).toBeLessThanOrEqual(6);
  });
});
