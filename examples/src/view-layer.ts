/**
 * A grid that follows the camera.
 *
 * The shortest useful thing you can do with either package: one object that
 * watches the camera, picks a resolution from how much ground a pixel covers,
 * covers the visible extent, and rebuilds only when the set of cells changes.
 *
 * This is what the demo runs.
 */
import { Color, Viewer } from 'cesium';
import { H3ViewLayer } from '@stevenpg/cesium-h3';

const viewer = new Viewer('cesiumContainer');

const grid = new H3ViewLayer(viewer.scene, {
  // Roughly how large a cell edge should appear on screen. Larger means
  // fewer, coarser cells.
  targetEdgePixels: 72,

  // A ceiling on how many cells may be drawn. When the visible extent would
  // need more than this, the layer steps to a coarser resolution instead of
  // trying to build them. A zoomed-out view has no natural bound, so without
  // this the globe would ask for millions.
  maxCells: 8000,

  outlines: true,
  outlineColor: Color.WHITE.withAlpha(0.35),
  color: Color.CYAN.withAlpha(0.25),

  // Fires after every recompute, which is the hook for a readout or a legend.
  onUpdate: ({ cells, resolution, coarsened }) => {
    console.log(
      `${cells.length} cells at resolution ${resolution}` +
        (coarsened ? ' (the budget forced this coarser than the camera asked for)' : ''),
    );
  },
});

// Tear down when the view goes away. The layer holds a camera subscription and
// a Cesium primitive, neither of which the viewer cleans up for you.
window.addEventListener('beforeunload', () => grid.destroy());

export { viewer, grid };
