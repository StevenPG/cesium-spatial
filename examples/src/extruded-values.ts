/**
 * Cells as 3D bars.
 *
 * The usual data-on-a-globe treatment: each cell rises in proportion to a
 * value. Worth knowing that height is a geometry property, not a style one —
 * changing a cell's `extrudedHeight` rebuilds the primitive, while changing its
 * colour does not. So animate colour freely, and change heights in batches.
 *
 * Scaling the height against the cell's own edge length keeps bars looking
 * proportionate as the resolution changes; a fixed metre height that reads well
 * at resolution 9 becomes a forest of needles at resolution 4.
 */
import { Color, Viewer } from 'cesium';
import { H3CellLayer, resolutionEdgeMeters, resolutionOf } from '@stevenpg/cesium-h3';

const viewer = new Viewer('cesiumContainer');

/** Whatever you are plotting, keyed by cell index. */
const values = new Map<string, number>([
  ['8928308280fffff', 0.9],
  ['8928308280bffff', 0.6],
  ['89283082873ffff', 0.35],
  ['89283082877ffff', 0.15],
]);
const peak = Math.max(...values.values());

const layer = new H3CellLayer(viewer.scene, {
  style: (cell) => {
    const value = values.get(cell) ?? 0;
    const fraction = peak > 0 ? value / peak : 0;

    return {
      color: Color.fromHsl(0.6 - fraction * 0.55, 0.8, 0.55, 0.85),
      // Tallest bar reaches about three cell-widths, whatever the resolution.
      extrudedHeight: fraction * resolutionEdgeMeters(resolutionOf(cell)) * 3,
    };
  },

  // Prisms are solid, so they want lighting and no translucency to read as
  // volumes rather than as coloured fog.
  translucent: false,
});

layer.setCells([...values.keys()]);

/*
Recolouring without rebuilding — safe every frame:

  layer.setCellStyle('8928308280fffff', { color: Color.RED });

Changing a height — rebuilds geometry, so batch it:

  values.set('8928308280fffff', 0.4);
  layer.setCells([...values.keys()]);
*/

export { viewer, layer, values };
