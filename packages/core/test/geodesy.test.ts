import { Math as CesiumMath } from 'cesium';
import { describe, expect, it } from 'vitest';
import {
  crossesAntimeridian,
  densifyRing,
  ringToRectangle,
  unwrapLongitudes,
} from '../src/geodesy.js';

describe('unwrapLongitudes', () => {
  it('leaves an ordinary ring untouched', () => {
    const ring = [-10, 0, -9, 0, -9, 1, -10, 1];
    expect(unwrapLongitudes(ring)).toEqual(ring);
  });

  it('pushes longitudes past 180 to keep the ring continuous', () => {
    const ring = [179, 0, -179, 0, -179, 1, 179, 1];
    expect(unwrapLongitudes(ring)).toEqual([179, 0, 181, 0, 181, 1, 179, 1]);
  });

  it('pushes longitudes below -180 when the ring runs the other way', () => {
    const ring = [-179, 0, 179, 0, 179, 1];
    expect(unwrapLongitudes(ring)).toEqual([-179, 0, -181, 0, -181, 1]);
  });

  it('does not mutate its input', () => {
    const ring = [179, 0, -179, 0];
    const copy = ring.slice();
    unwrapLongitudes(ring);
    expect(ring).toEqual(copy);
  });
});

describe('crossesAntimeridian', () => {
  it('detects a straddling ring', () => {
    expect(crossesAntimeridian([179, 0, -179, 0, -179, 1])).toBe(true);
  });

  it('ignores an ordinary ring', () => {
    expect(crossesAntimeridian([10, 0, 11, 0, 11, 1])).toBe(false);
  });
});

describe('ringToRectangle', () => {
  it('bounds an ordinary ring', () => {
    const rectangle = ringToRectangle([10, 0, 12, 0, 12, 3, 10, 3]);
    expect(CesiumMath.toDegrees(rectangle.west)).toBeCloseTo(10, 9);
    expect(CesiumMath.toDegrees(rectangle.east)).toBeCloseTo(12, 9);
    expect(CesiumMath.toDegrees(rectangle.south)).toBeCloseTo(0, 9);
    expect(CesiumMath.toDegrees(rectangle.north)).toBeCloseTo(3, 9);
  });

  it('produces a wrapping rectangle across the antimeridian instead of a global one', () => {
    const rectangle = ringToRectangle([179, 0, -179, 0, -179, 1, 179, 1]);
    expect(CesiumMath.toDegrees(rectangle.west)).toBeCloseTo(179, 9);
    expect(CesiumMath.toDegrees(rectangle.east)).toBeCloseTo(-179, 9);
    // Cesium's convention for a wrapping rectangle.
    expect(rectangle.west).toBeGreaterThan(rectangle.east);
  });
});

describe('densifyRing', () => {
  it('adds vertices to edges longer than the limit', () => {
    // Roughly 1100 km per edge at the equator.
    const ring = [0, 0, 10, 0, 10, 10, 0, 10];
    const densified = densifyRing(ring, 100_000);
    expect(densified.length).toBeGreaterThan(ring.length * 5);
    expect(densified.length % 2).toBe(0);
  });

  it('leaves short edges alone', () => {
    const ring = [0, 0, 0.001, 0, 0.001, 0.001, 0, 0.001];
    expect(densifyRing(ring, 100_000)).toEqual(ring);
  });

  it('keeps longitudes continuous across the antimeridian', () => {
    const densified = densifyRing([179, 0, -179, 0, -179, 2, 179, 2], 50_000);
    expect(crossesAntimeridian(densified)).toBe(false);
  });

  it('returns the ring unchanged when densification is disabled', () => {
    const ring = [0, 0, 10, 0, 10, 10];
    expect(densifyRing(ring, 0)).toEqual(ring);
  });
});
