/**
 * Aggregating points into cells.
 *
 * The most common reason to reach for a discrete global grid: you have a pile
 * of latitude/longitude points and you want counts per area without inventing
 * an arbitrary square grid.
 *
 * Because a cell index is just a string, binning is a plain Map — no spatial
 * index, no geometry, no library call per point beyond finding the cell.
 */
import { Color, Viewer } from 'cesium';
import { H3CellLayer, cellAt } from '@stevenpg/cesium-h3';

interface Observation {
  longitude: number;
  latitude: number;
  /** Whatever you are measuring. Omit and count instead. */
  value?: number;
}

/**
 * Sums observations per cell.
 *
 * Resolution is the whole decision here. Too fine and every point gets its own
 * cell; too coarse and everything lands in one. Somewhere around "a few dozen
 * points per populated cell" usually reads well.
 */
function binByCell(points: readonly Observation[], resolution: number): Map<string, number> {
  const totals = new Map<string, number>();
  for (const point of points) {
    const cell = cellAt(point.longitude, point.latitude, resolution);
    totals.set(cell, (totals.get(cell) ?? 0) + (point.value ?? 1));
  }
  return totals;
}

/** Yellow through red, on a square-root scale so a few hot cells do not flatten the rest. */
function rampColor(value: number, max: number): Color {
  const t = max > 0 ? Math.sqrt(value / max) : 0;
  return Color.fromHsl((1 - t) * 0.16, 0.85, 0.55, 0.25 + t * 0.55);
}

const viewer = new Viewer('cesiumContainer');

// Stand-in for whatever you actually load.
const observations: Observation[] = Array.from({ length: 5000 }, () => ({
  longitude: -122.45 + (Math.random() - 0.5) * 0.35,
  latitude: 37.76 + (Math.random() - 0.5) * 0.25,
}));

const counts = binByCell(observations, 9);
const busiest = Math.max(...counts.values());

const layer = new H3CellLayer(viewer.scene, {
  // The style function is consulted per cell on every build and restyle, so
  // read from the Map rather than recomputing anything expensive here.
  style: (cell) => ({ color: rampColor(counts.get(cell) ?? 0, busiest) }),
  translucent: true,
});

layer.setCells([...counts.keys()]);

/*
Rebinning at a different resolution is the same three lines, and the layer
diffs the result rather than tearing everything down:

  const finer = binByCell(observations, 10);
  layer.setCells([...finer.keys()]);
*/

export { binByCell, rampColor, viewer, layer };
