/**
 * The same jobs, in S2.
 *
 * Everything the H3 package does, this does too — the API shapes match closely
 * enough that porting is mostly renaming. What differs is worth knowing:
 *
 *   Cells are tokens.        S2 ids are 64-bit integers; this library addresses
 *                            cells by their canonical hex token so they survive
 *                            maps, sorting and JSON. A raw bigint works too.
 *
 *   Four neighbors, always.  There is no pentagon case, and no exception at the
 *                            poles or across cube-face seams.
 *
 *   Thirty-one levels.       Against H3's sixteen resolutions, and the numbers
 *                            do not line up. Compare by edge length instead:
 *                            S2 level 13 is about 1.1 km across, nearest H3
 *                            resolution 7 at 1.4 km. levelEdgeMeters and
 *                            resolutionEdgeMeters give the figures.
 *
 *   The budget matters more. S2's coverer treats a minimum level as
 *                            non-negotiable and will return millions of cells
 *                            rather than truncate, so estimating before
 *                            generating is load-bearing rather than an
 *                            optimization.
 */
import { Color, Rectangle, Viewer } from 'cesium';
import {
  S2CellLayer,
  S2ViewLayer,
  adaptiveCover,
  cellAt,
  coverRectangle,
  levelOf,
  neighbors,
  parent,
  toCellId,
  toToken,
} from '@stevenpg/cesium-s2';

const viewer = new Viewer('cesiumContainer');

// --- Identity and traversal ------------------------------------------------

const cell = cellAt(-122.4194, 37.7749, 13); // longitude first, as everywhere here
console.log(cell, `level ${levelOf(cell)}`, `${neighbors(cell).length} edge neighbors`);
console.log('parent:', parent(cell), 'children:', 4);

// Tokens and raw ids convert both ways, and either is accepted anywhere.
const asBigInt = toCellId(cell);
console.log('round trip holds:', toToken(asBigInt) === cell);

// --- Drawing ---------------------------------------------------------------

const layer = new S2CellLayer(viewer.scene, {
  color: Color.CYAN.withAlpha(0.3),
  outlines: true,
});
layer.setCells([cell, ...neighbors(cell)]);

// --- Covering a region -----------------------------------------------------

const extent = Rectangle.fromDegrees(-122.6, 37.6, -122.3, 37.9);

// Uniform level, budget-aware. The shape of the result matches the H3 package's
// coverRectangle, except it speaks of levels rather than resolutions.
const uniform = coverRectangle(extent, { level: 14, maxCells: 5000 });
console.log(`${uniform.cells.length} cells at level ${uniform.level}`);

// S2's own covering, which has no H3 equivalent: coarse cells in the interior,
// finer cells along the edges, aiming for a cell count rather than one level.
// This is what S2 is genuinely good at.
const adaptive = adaptiveCover(extent, { maxCells: 32, maxLevel: 18 });
console.log(
  `${adaptive.length} cells spanning levels`,
  [...new Set(adaptive.map(levelOf))].sort((a, b) => a - b).join(', '),
);

// --- A camera-driven grid --------------------------------------------------

const grid = new S2ViewLayer(viewer.scene, {
  targetEdgePixels: 72,
  maxCells: 8000,
  outlines: true,
  onUpdate: ({ cells, level }) => console.log(`${cells.length} cells at level ${level}`),
});

window.addEventListener('beforeunload', () => {
  grid.destroy();
  layer.destroy();
});

export { viewer, layer, grid, uniform, adaptive };
