import { Ellipsoid, Math as CesiumMath, Rectangle } from 'cesium';
import { describe, expect, it } from 'vitest';
import { getResolution } from 'h3-js';
import { cellAt } from '../src/cells.js';
import {
  cellsInPolygon,
  cellsInRectangle,
  coverRectangle,
  estimateCellCount,
} from '../src/cover.js';
import { resolutionForMetersPerPixel, H3_RESOLUTIONS } from '../src/resolution.js';

const rectangle = (w: number, s: number, e: number, n: number) => Rectangle.fromDegrees(w, s, e, n);

describe('cellsInRectangle', () => {
  it('covers an ordinary rectangle', () => {
    const cells = cellsInRectangle(rectangle(-122.5, 37.7, -122.4, 37.8), 8);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((cell) => getResolution(cell) === 8)).toBe(true);
  });

  it('splits a rectangle that wraps the antimeridian', () => {
    // Rectangle.fromDegrees builds west > east here, Cesium's wrapping form.
    const wrapping = rectangle(179, -1, -179, 1);
    expect(wrapping.west).toBeGreaterThan(wrapping.east);

    const cells = new Set(cellsInRectangle(wrapping, 5));
    expect(cells.size).toBeGreaterThan(0);
    expect(cells.has(cellAt(179.5, 0, 5))).toBe(true);
    expect(cells.has(cellAt(-179.5, 0, 5))).toBe(true);
    expect(cells.has(cellAt(0, 0, 5))).toBe(false);
  });

  it('covers the longitudes actually requested for a wide rectangle', () => {
    // H3 alone reads anything wider than 180 degrees as its own complement,
    // so this returns the dateline band instead without the segment split.
    const cells = new Set(cellsInRectangle(rectangle(-100, -1, 100, 1), 4));
    for (const longitude of [-99, -50, 0, 50, 99]) {
      expect(cells.has(cellAt(longitude, 0, 4))).toBe(true);
    }
    for (const longitude of [-150, 150, 179]) {
      expect(cells.has(cellAt(longitude, 0, 4))).toBe(false);
    }
  });

  it('covers every longitude for a whole-globe rectangle', () => {
    const cells = new Set(cellsInRectangle(Rectangle.MAX_VALUE, 2));
    for (const longitude of [-179, -90, 0, 90, 179]) {
      expect(cells.has(cellAt(longitude, 0, 2))).toBe(true);
    }
  });

  it('produces no duplicates across segment boundaries', () => {
    const cells = cellsInRectangle(rectangle(-100, -1, 100, 1), 4);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('does not choke on a rectangle touching the pole', () => {
    expect(cellsInRectangle(rectangle(-10, 88, 10, 90), 3).length).toBeGreaterThan(0);
  });
});

describe('cellsInPolygon', () => {
  it('covers a flat [lng, lat] ring', () => {
    const cells = cellsInPolygon([-122.5, 37.7, -122.4, 37.7, -122.4, 37.8, -122.5, 37.8], 8);
    expect(cells.length).toBeGreaterThan(0);
  });

  it('excludes cells falling in a hole', () => {
    const outer = [-1, -1, 1, -1, 1, 1, -1, 1];
    const hole = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5];
    const solid = cellsInPolygon(outer, 6);
    const withHole = cellsInPolygon(outer, 6, [hole]);
    expect(withHole.length).toBeLessThan(solid.length);
  });
});

describe('estimateCellCount', () => {
  it('lands within an order of magnitude of the real cover', () => {
    const extent = rectangle(-1, -1, 1, 1);
    const actual = cellsInRectangle(extent, 6).length;
    const estimate = estimateCellCount(extent, 6, Ellipsoid.WGS84);
    expect(estimate).toBeGreaterThan(actual / 2);
    expect(estimate).toBeLessThan(actual * 2);
  });
});

describe('coverRectangle', () => {
  it('honors the requested resolution when it fits the budget', () => {
    const result = coverRectangle(rectangle(-0.1, -0.1, 0.1, 0.1), {
      resolution: 8,
      maxCells: 20_000,
    });
    expect(result.resolution).toBe(8);
    expect(result.coarsened).toBe(false);
  });

  it('coarsens instead of blowing the budget on a global view', () => {
    const result = coverRectangle(Rectangle.MAX_VALUE, { resolution: 9, maxCells: 5000 });
    expect(result.resolution).toBeLessThan(9);
    expect(result.coarsened).toBe(true);
    expect(result.cells.length).toBeLessThanOrEqual(10_000);
  });

  it('never goes coarser than minResolution', () => {
    const result = coverRectangle(Rectangle.MAX_VALUE, {
      resolution: 9,
      maxCells: 1,
      minResolution: 2,
    });
    expect(result.resolution).toBe(2);
  });
});

describe('H3_RESOLUTIONS', () => {
  it('covers every resolution, monotonically decreasing in edge length', () => {
    expect(H3_RESOLUTIONS).toHaveLength(16);
    for (let i = 1; i < H3_RESOLUTIONS.length; i++) {
      expect(H3_RESOLUTIONS[i].edgeLengthMeters).toBeLessThan(
        H3_RESOLUTIONS[i - 1].edgeLengthMeters,
      );
    }
  });

  it('maps a street-level ground resolution to a fine resolution', () => {
    // ~1 m/px is roughly a city-block view.
    expect(resolutionForMetersPerPixel(1)).toBeGreaterThanOrEqual(9);
    // ~10 km/px is roughly a continental view.
    expect(resolutionForMetersPerPixel(10_000)).toBeLessThanOrEqual(3);
  });
});

describe('rectangle helpers', () => {
  it('treats a full-globe rectangle as the whole sphere', () => {
    expect(CesiumMath.toDegrees(Rectangle.MAX_VALUE.west)).toBeCloseTo(-180, 6);
  });
});
