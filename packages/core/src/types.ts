import type { Color } from 'cesium';

/** Identifier for a single cell, as produced by the underlying index (H3 hex string, S2 token, ...). */
export type CellId = string;

/**
 * A cell boundary ready for rendering.
 *
 * `ring` is a flat, open (first vertex not repeated) list of `[lng, lat, ...]`
 * pairs in **degrees**, wound in any direction. Longitudes may be "unwrapped"
 * past +/-180 by `unwrapLongitudes`; consumers that build Cartesian positions
 * are unaffected by this, since 190 and -170 map to the same point.
 */
export interface CellBoundary {
  id: CellId;
  ring: number[];
}

/** Per-cell visual overrides. Anything omitted falls back to the layer default. */
export interface CellStyle {
  /** Fill color. Translucent colors require the layer's `translucent` option. */
  color?: Color;
  /** Outline color. Only used when the layer was created with `outlines: true`. */
  outlineColor?: Color;
  /** Base height above the ellipsoid, in meters. Ignored when clamped to ground. */
  height?: number;
  /** Top height for extruded (prism) cells, in meters. Ignored when clamped to ground. */
  extrudedHeight?: number;
  /** Set false to hide the cell without rebuilding the layer. */
  show?: boolean;
}

/** Resolves the style for a cell. Called once per cell whenever the layer restyles. */
export type CellStyleFunction = (id: CellId) => CellStyle | undefined;

/** One entry of a spatial index's level table, used to map screen scale to a level. */
export interface LevelInfo {
  /** The index's own level/resolution number. */
  level: number;
  /** Average edge length of a cell at this level, in meters. */
  edgeLengthMeters: number;
}
