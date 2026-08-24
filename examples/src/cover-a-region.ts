/**
 * Filling a region with cells.
 *
 * Three ways in, depending on what you have: a rectangle, an arbitrary polygon,
 * or whatever the camera is currently looking at.
 *
 * The budget-aware `coverRectangle` is the one to reach for when the extent
 * comes from somewhere you do not control. It estimates the cost from area
 * before generating anything, and steps to a coarser resolution rather than
 * building a set that could be millions of cells.
 */
import { Color, Rectangle, Viewer } from 'cesium';
import {
  H3CellLayer,
  cellsInPolygon,
  cellsInRectangle,
  cellsInView,
  coverRectangle,
  estimateCellCount,
} from '@stevenpg/cesium-h3';

const viewer = new Viewer('cesiumContainer');
const layer = new H3CellLayer(viewer.scene, { color: Color.CYAN.withAlpha(0.3), outlines: true });

// --- A rectangle, at a resolution you choose -------------------------------

const bayArea = Rectangle.fromDegrees(-122.6, 37.6, -122.3, 37.9);
layer.setCells(cellsInRectangle(bayArea, 9));

// Rectangles that wrap the antimeridian (west > east) work as you would hope,
// as do rectangles wider than 180 degrees. H3 alone reads either as its own
// complement, so this splits the extent before handing it over.
const dateline = Rectangle.fromDegrees(179, -1, -179, 1);
console.log(`${cellsInRectangle(dateline, 6).length} cells across the dateline`);

// --- A rectangle, letting a budget pick the resolution ---------------------

// Ask what a resolution would cost before committing to it.
console.log(`resolution 12 over the Bay Area: ~${estimateCellCount(bayArea, 12)} cells`);

const covered = coverRectangle(bayArea, {
  resolution: 12,
  maxCells: 5000,
  // Never coarser than this, even if the budget would prefer it.
  minResolution: 6,
});
console.log(
  `drew ${covered.cells.length} cells at resolution ${covered.resolution}` +
    (covered.coarsened ? ' — the budget stepped in' : ''),
);

// --- An arbitrary polygon --------------------------------------------------

// A flat [lng, lat, lng, lat, ...] ring in degrees. Holes are optional extra
// rings in the same form.
const triangle = [-122.5, 37.7, -122.35, 37.7, -122.42, 37.82];
const hole = [-122.45, 37.73, -122.4, 37.73, -122.42, 37.77];
console.log(`${cellsInPolygon(triangle, 10, [hole]).length} cells inside the polygon`);

// --- Whatever the camera can see -------------------------------------------

// The same thing H3ViewLayer does internally, if you want the cells without
// the layer — to fetch data for them, say, rather than to draw them.
const inView = cellsInView(viewer.scene, { targetEdgePixels: 64, maxCells: 4000 });
if (inView) {
  console.log(`${inView.cells.length} cells in view at resolution ${inView.resolution}`);
  console.log(`ground scale: ${inView.view.metersPerPixel.toFixed(1)} m/px`);
}

export { viewer, layer, bayArea, covered };
