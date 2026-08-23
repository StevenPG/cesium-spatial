import { Rectangle } from 'cesium';
import { describe, expect, it } from 'vitest';
import { cellToBoundary, getPentagons, latLngToCell } from 'h3-js';
import {
  cellToLngLat,
  cellToRectangle,
  cellToRing,
  clearBoundaryCache,
  getCellBoundary,
} from '../src/geometry.js';

describe('cellToRing', () => {
  it('flattens h3 [lat, lng] pairs into a [lng, lat] ring', () => {
    const cell = latLngToCell(37.77, -122.42, 9);
    const boundary = cellToBoundary(cell);
    const ring = cellToRing(cell);

    expect(ring).toHaveLength(boundary.length * 2);
    expect(ring[0]).toBeCloseTo(boundary[0][1], 12);
    expect(ring[1]).toBeCloseTo(boundary[0][0], 12);
  });

  it('leaves the ring open, as polygon geometry expects', () => {
    const ring = cellToRing(latLngToCell(0, 0, 5));
    expect(ring.slice(0, 2)).not.toEqual(ring.slice(-2));
  });

  it('handles pentagons, which carry extra distortion vertices', () => {
    // A pentagon has five neighbors but H3 reports ten boundary vertices at
    // Class III resolutions, so the ring must not assume six.
    const pentagon = getPentagons(5)[0];
    const ring = cellToRing(pentagon);
    expect(ring).toHaveLength(cellToBoundary(pentagon).length * 2);
    expect(ring.length).toBeGreaterThanOrEqual(10);
  });
});

describe('cellToRectangle', () => {
  it('bounds an ordinary cell tightly', () => {
    const cell = latLngToCell(37.77, -122.42, 7);
    const rectangle = cellToRectangle(cell);
    const [lng, lat] = cellToLngLat(cell);
    expect(Rectangle.contains(rectangle, Rectangle.center(rectangle))).toBe(true);
    expect(rectangle.west).toBeLessThan(rectangle.east);
    expect(lat).toBeCloseTo(37.77, 1);
    expect(lng).toBeCloseTo(-122.42, 1);
  });

  it('wraps rather than spanning the globe for a cell on the antimeridian', () => {
    const cell = latLngToCell(0, 179.999, 3);
    const rectangle = cellToRectangle(cell);
    expect(Rectangle.computeWidth(rectangle)).toBeLessThan(0.1);
  });
});

describe('getCellBoundary', () => {
  it('returns a stable, cached instance', () => {
    clearBoundaryCache();
    const cell = latLngToCell(51.5, -0.12, 8);
    const first = getCellBoundary(cell);
    expect(getCellBoundary(cell)).toBe(first);
    clearBoundaryCache();
    expect(getCellBoundary(cell)).not.toBe(first);
  });
});
