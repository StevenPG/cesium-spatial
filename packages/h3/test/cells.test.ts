import { describe, expect, it } from 'vitest';
import { getPentagons, getResolution, latLngToCell } from 'h3-js';
import {
  ancestors,
  areNeighbors,
  cellAt,
  centerChild,
  children,
  compact,
  disk,
  distanceBetween,
  isPentagonCell,
  neighbors,
  parent,
  pathBetween,
  ring,
  uncompact,
} from '../src/cells.js';

const SAN_FRANCISCO = latLngToCell(37.7749, -122.4194, 9);

describe('cellAt', () => {
  it('takes longitude first, unlike h3-js', () => {
    expect(cellAt(-122.4194, 37.7749, 9)).toBe(SAN_FRANCISCO);
  });

  it('clamps out-of-range resolutions instead of throwing', () => {
    expect(getResolution(cellAt(0, 0, 99))).toBe(15);
    expect(getResolution(cellAt(0, 0, -5))).toBe(0);
  });
});

describe('neighbors', () => {
  it('returns six edge-sharing cells and excludes the origin', () => {
    const result = neighbors(SAN_FRANCISCO);
    expect(result).toHaveLength(6);
    expect(result).not.toContain(SAN_FRANCISCO);
    expect(result.every((cell) => areNeighbors(SAN_FRANCISCO, cell))).toBe(true);
  });

  it('returns five neighbors for a pentagon', () => {
    const pentagon = getPentagons(9)[0];
    expect(isPentagonCell(pentagon)).toBe(true);
    expect(neighbors(pentagon)).toHaveLength(5);
  });
});

describe('disk and ring', () => {
  it('disk includes the origin and grows as 3k(k+1)+1', () => {
    expect(disk(SAN_FRANCISCO, 0)).toEqual([SAN_FRANCISCO]);
    expect(disk(SAN_FRANCISCO, 2)).toHaveLength(19);
  });

  it('ring excludes the interior', () => {
    const result = ring(SAN_FRANCISCO, 2);
    expect(result).toHaveLength(12);
    expect(result).not.toContain(SAN_FRANCISCO);
    expect(result.every((cell) => distanceBetween(SAN_FRANCISCO, cell) === 2)).toBe(true);
  });

  it('ring survives a pentagon, where the fast H3 path returns nothing', () => {
    const pentagon = getPentagons(5)[0];
    expect(ring(pentagon, 1)).toHaveLength(5);
    expect(ring(pentagon, 2).length).toBeGreaterThan(0);
  });
});

describe('hierarchy', () => {
  it('parent defaults to one resolution coarser', () => {
    expect(getResolution(parent(SAN_FRANCISCO))).toBe(8);
    expect(getResolution(parent(SAN_FRANCISCO, 4))).toBe(4);
  });

  it('ancestors runs from one step up to resolution 0', () => {
    const result = ancestors(SAN_FRANCISCO);
    expect(result).toHaveLength(9);
    expect(getResolution(result[0])).toBe(8);
    expect(getResolution(result[result.length - 1])).toBe(0);
  });

  it('children of a hexagon number seven, and contain the center child', () => {
    const result = children(SAN_FRANCISCO);
    expect(result).toHaveLength(7);
    expect(result).toContain(centerChild(SAN_FRANCISCO));
  });

  it('children of the finest resolution is empty rather than an error', () => {
    expect(children(cellAt(0, 0, 15))).toEqual([]);
  });
});

describe('compact', () => {
  it('collapses a full set of children back to the parent', () => {
    const cell = latLngToCell(10, 10, 5);
    expect(compact(children(cell))).toEqual([cell]);
  });

  it('round-trips through uncompact', () => {
    const cell = latLngToCell(10, 10, 5);
    const expanded = uncompact([cell], 7);
    expect(expanded.length).toBeGreaterThan(7);
    expect(compact(expanded)).toEqual([cell]);
  });
});

describe('pathBetween', () => {
  it('returns an inclusive chain of adjacent cells', () => {
    const target = disk(SAN_FRANCISCO, 3)[10];
    const path = pathBetween(SAN_FRANCISCO, target);
    expect(path[0]).toBe(SAN_FRANCISCO);
    expect(path[path.length - 1]).toBe(target);
    expect(path).toHaveLength(distanceBetween(SAN_FRANCISCO, target) + 1);
  });
});
