/**
 * One cell under the cursor, with a resolution slider.
 *
 * Click the globe to get the cell containing that point, then drag the slider
 * to see the same point at every resolution from continent-sized down to
 * building-sized. This is the quickest way to build an intuition for what a
 * resolution number actually means.
 *
 * The point is that no picking is involved: the click is turned into a
 * longitude and latitude by Cesium, and the cell comes from that. You do not
 * need cells drawn to ask which cell a place falls in.
 */
import {
  Cartographic,
  Color,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
  type Cartesian2,
} from 'cesium';
import { H3CellLayer, cellAt, cellAreaMeters, resolutionEdgeMeters } from '@stevenpg/cesium-h3';

const viewer = new Viewer('cesiumContainer');
const slider = document.querySelector<HTMLInputElement>('#resolution')!;
const readout = document.querySelector<HTMLElement>('#readout')!;

// One layer, reused. Calling setCells again replaces its contents; there is no
// need to create a layer per selection.
const layer = new H3CellLayer(viewer.scene, {
  color: Color.ORANGE.withAlpha(0.5),
  outlines: true,
  outlineColor: Color.ORANGE,
});

/** Where the user last clicked, in degrees. */
let picked: { longitude: number; latitude: number } | undefined;

function draw() {
  if (!picked) return;
  const resolution = Number(slider.value);
  const cell = cellAt(picked.longitude, picked.latitude, resolution);

  layer.setCells([cell]);

  readout.textContent = [
    `index    ${cell}`,
    `res      ${resolution}`,
    `edge     ~${(resolutionEdgeMeters(resolution) / 1000).toFixed(2)} km`,
    `area     ${(cellAreaMeters(cell) / 1e6).toFixed(4)} km²`,
  ].join('\n');
}

const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
handler.setInputAction((movement: { position: Cartesian2 }) => {
  // Turn the screen position into a point on the globe. This returns undefined
  // when the click misses the globe, which happens past the horizon.
  const cartesian = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
  if (!cartesian) return;

  const carto = Cartographic.fromCartesian(cartesian);
  picked = {
    longitude: CesiumMath.toDegrees(carto.longitude),
    latitude: CesiumMath.toDegrees(carto.latitude),
  };
  draw();
}, ScreenSpaceEventType.LEFT_CLICK);

// Redrawing on every slider step is cheap here: one cell, one small rebuild.
slider.addEventListener('input', draw);

/*
The matching markup:

  <div id="cesiumContainer"></div>
  <input id="resolution" type="range" min="0" max="15" step="1" value="9" />
  <pre id="readout"></pre>
*/

export { viewer, layer, handler };
