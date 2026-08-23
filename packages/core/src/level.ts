import type { LevelInfo } from './types.js';

/** Tuning for {@link selectLevel} and {@link LevelSelector}. */
export interface LevelSelectionOptions {
  /**
   * Target on-screen size of one cell edge, in pixels. Larger values mean
   * fewer, bigger cells. Defaults to 64.
   */
  targetEdgePixels?: number;
  /** Clamp to at least this level. */
  minLevel?: number;
  /** Clamp to at most this level. */
  maxLevel?: number;
}

/**
 * Picks the level whose average cell edge is closest to `targetEdgePixels`
 * on screen.
 *
 * Comparison happens in log space so the choice is scale-invariant: a level
 * twice too coarse scores the same as one twice too fine.
 */
export function selectLevel(
  table: readonly LevelInfo[],
  metersPerPixel: number,
  options: LevelSelectionOptions = {},
): number {
  const { targetEdgePixels = 64, minLevel, maxLevel } = options;
  const candidates = clampTable(table, minLevel, maxLevel);
  if (candidates.length === 0) throw new Error('Level table is empty after clamping');

  const targetEdgeMeters = Math.max(metersPerPixel, Number.EPSILON) * targetEdgePixels;
  let best = candidates[0];
  let bestScore = Infinity;
  for (const entry of candidates) {
    const score = Math.abs(Math.log(entry.edgeLengthMeters / targetEdgeMeters));
    if (score < bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best.level;
}

/**
 * Stateful wrapper around {@link selectLevel} that resists flapping.
 *
 * A camera nudged near the boundary between two levels would otherwise swap
 * back and forth every frame, rebuilding the whole layer each time. The
 * selector keeps its current level until that level is off target by more than
 * `deadband` octaves.
 */
export class LevelSelector {
  private current: number | undefined;

  constructor(
    private readonly table: readonly LevelInfo[],
    private readonly options: LevelSelectionOptions & { deadband?: number } = {},
  ) {}

  /** The level currently in effect, or `undefined` before the first update. */
  get level(): number | undefined {
    return this.current;
  }

  /** Returns the level to use for the given ground resolution. */
  update(metersPerPixel: number): number {
    const { deadband = 0.5 } = this.options;
    const targetEdgePixels = this.options.targetEdgePixels ?? 64;
    const targetEdgeMeters = Math.max(metersPerPixel, Number.EPSILON) * targetEdgePixels;

    const currentEntry = this.table.find((entry) => entry.level === this.current);
    if (currentEntry) {
      const octavesOff = Math.abs(Math.log2(currentEntry.edgeLengthMeters / targetEdgeMeters));
      if (octavesOff <= deadband) return this.current as number;
    }

    this.current = selectLevel(this.table, metersPerPixel, this.options);
    return this.current;
  }

  /** Forgets the current level so the next update snaps straight to the best match. */
  reset(): void {
    this.current = undefined;
  }
}

function clampTable(
  table: readonly LevelInfo[],
  minLevel?: number,
  maxLevel?: number,
): readonly LevelInfo[] {
  if (minLevel === undefined && maxLevel === undefined) return table;
  return table.filter(
    (entry) =>
      (minLevel === undefined || entry.level >= minLevel) &&
      (maxLevel === undefined || entry.level <= maxLevel),
  );
}
