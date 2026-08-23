/**
 * Picking a resolution yourself.
 *
 * `H3ViewLayer` does this internally, but the pieces are exported for when you
 * want the decision without the layer — driving a legend, fetching tiles from
 * your own API, or building a layer of your own on top.
 *
 * Cesium has no zoom levels, so there is no number to read off the camera. The
 * measurement that matters is how much ground one pixel covers, which comes
 * from the frustum rather than from altitude: a camera at 400 km looking
 * straight down and one looking at the horizon cover very different ground per
 * pixel at the same height.
 */
import { Viewer } from 'cesium';
import { computeViewInfo } from '@stevenpg/cesium-spatial-core';
import {
  H3_RESOLUTIONS,
  createResolutionSelector,
  resolutionForMetersPerPixel,
} from '@stevenpg/cesium-h3';

const viewer = new Viewer('cesiumContainer');

// --- A one-off answer ------------------------------------------------------

const view = computeViewInfo(viewer.scene);
if (view) {
  console.log(`${view.metersPerPixel.toFixed(1)} m/px`);
  console.log('visible extent:', view.rectangle);
  console.log('whole globe in frame:', view.isGlobeView);

  // targetEdgePixels is the only tuning knob: how large a cell edge should
  // appear on screen. Everything else follows from the measurement.
  console.log(
    'suggested resolution:',
    resolutionForMetersPerPixel(view.metersPerPixel, {
      targetEdgePixels: 72,
    }),
  );
}

// --- Following a moving camera ---------------------------------------------

// Asking for the best resolution every frame makes it flicker between two
// values whenever the camera sits near a boundary, and each change rebuilds
// whatever you are drawing. The selector holds its answer until the current
// resolution is off target by more than the deadband, in octaves.
const selector = createResolutionSelector({ targetEdgePixels: 72, deadband: 0.5 });

viewer.scene.camera.percentageChanged = 0.1;
viewer.scene.camera.changed.addEventListener(() => {
  const current = computeViewInfo(viewer.scene);
  if (!current) return;

  const resolution = selector.update(current.metersPerPixel);
  console.log(`resolution ${resolution} at ${current.metersPerPixel.toFixed(1)} m/px`);
});

// --- The table behind it ---------------------------------------------------

// Read from h3-js rather than hard-coded, and useful for a legend or a scale
// readout of your own.
for (const { level, edgeLengthMeters } of H3_RESOLUTIONS.slice(0, 6)) {
  console.log(`resolution ${level}: ~${(edgeLengthMeters / 1000).toFixed(1)} km per edge`);
}

export { viewer, selector };
