import { describe, expect, it } from 'vitest';
import { LevelSelector, selectLevel } from '../src/level.js';
import type { LevelInfo } from '../src/types.js';

const TABLE: LevelInfo[] = [
  { level: 0, edgeLengthMeters: 1000 },
  { level: 1, edgeLengthMeters: 500 },
  { level: 2, edgeLengthMeters: 250 },
  { level: 3, edgeLengthMeters: 125 },
];

/** Ground resolution that puts a cell of `edgeMeters` at the target pixel size. */
const mppFor = (edgeMeters: number, targetEdgePixels = 64) => edgeMeters / targetEdgePixels;

describe('selectLevel', () => {
  it('picks the level closest to the target on-screen edge size', () => {
    expect(selectLevel(TABLE, mppFor(500))).toBe(1);
    expect(selectLevel(TABLE, mppFor(125))).toBe(3);
  });

  it('scores in log space, so it is symmetric about the target', () => {
    // 350 sits between 250 and 500 but is nearer 500 geometrically.
    expect(selectLevel(TABLE, mppFor(354))).toBe(1);
    expect(selectLevel(TABLE, mppFor(352))).toBe(2);
  });

  it('clamps to the requested level range', () => {
    expect(selectLevel(TABLE, mppFor(125), { maxLevel: 1 })).toBe(1);
    expect(selectLevel(TABLE, mppFor(1000), { minLevel: 2 })).toBe(2);
  });

  it('honors a custom target edge size', () => {
    expect(selectLevel(TABLE, mppFor(500, 64), { targetEdgePixels: 128 })).toBe(0);
  });

  it('throws when clamping leaves no candidates', () => {
    expect(() => selectLevel(TABLE, 1, { minLevel: 99 })).toThrow(/empty/i);
  });
});

describe('LevelSelector', () => {
  it('snaps to the best level on first use', () => {
    const selector = new LevelSelector(TABLE);
    expect(selector.level).toBeUndefined();
    expect(selector.update(mppFor(250))).toBe(2);
    expect(selector.level).toBe(2);
  });

  it('holds its level through small camera changes', () => {
    const selector = new LevelSelector(TABLE, { deadband: 0.5 });
    selector.update(mppFor(500));
    // 380m is within half an octave of the current level's 500m edge.
    expect(selector.update(mppFor(380))).toBe(1);
  });

  it('switches once the current level is clearly wrong', () => {
    const selector = new LevelSelector(TABLE, { deadband: 0.5 });
    selector.update(mppFor(500));
    expect(selector.update(mppFor(200))).toBe(2);
  });

  it('snaps again after a reset', () => {
    const selector = new LevelSelector(TABLE, { deadband: 5 });
    selector.update(mppFor(500));
    expect(selector.update(mppFor(125))).toBe(1);
    selector.reset();
    expect(selector.update(mppFor(125))).toBe(3);
  });
});
