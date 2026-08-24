/**
 * Cells as Cesium entities.
 *
 * The batched layer draws thousands of cells as one primitive, which is what
 * you want almost always. Entities cost far more per cell and are worth it when
 * you need each cell to be a real Cesium object: something the built-in
 * selection UI can highlight, something with a description panel, something a
 * `DataSource` or a timeline can drive.
 *
 * Rough guidance: hundreds of cells, entities are fine. Thousands, use the
 * batched layer.
 */
import { Color, Viewer } from 'cesium';
import { H3EntityLayer, cellAreaMeters, cellToLngLat, disk } from '@stevenpg/cesium-h3';

const viewer = new Viewer('cesiumContainer');

const layer = new H3EntityLayer(viewer.entities, {
  color: Color.CYAN.withAlpha(0.35),
  outlines: true,
  outlineColor: Color.CYAN,

  // The options bag covers most needs. When it does not, entityFactory hands
  // you what the layer would have built and lets you return something else
  // entirely — the boundary is already computed for you.
  entityFactory: (boundary, style, defaults) => {
    const [longitude, latitude] = cellToLngLat(boundary.id);
    return {
      ...defaults,
      name: `Cell ${boundary.id}`,
      // Fills the panel Cesium shows when the entity is selected.
      description: `
        <table>
          <tr><td>index</td><td>${boundary.id}</td></tr>
          <tr><td>center</td><td>${longitude.toFixed(4)}, ${latitude.toFixed(4)}</td></tr>
          <tr><td>area</td><td>${(cellAreaMeters(boundary.id) / 1e6).toFixed(3)} km²</td></tr>
        </table>`,
      polygon: { ...defaults.polygon, material: style?.color ?? Color.CYAN.withAlpha(0.35) },
    };
  },
});

layer.setCells(disk('8928308280fffff', 3));

// Reconciliation keeps entities that survive a change, so anything holding a
// reference to one — a selection, a tracked entity — stays valid.
const entity = layer.getEntity('8928308280fffff');
if (entity) viewer.selectedEntity = entity;

/*
Entity polygons clamp to terrain when no height is set, so `clampToGround: true`
simply leaves the heights off. Note that outlines wider than one pixel are not
supported on most platforms — if you need thick outlines, use the batched layer,
which draws them as polylines.
*/

export { viewer, layer };
