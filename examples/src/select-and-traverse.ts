/**
 * Selecting a cell and walking the grid from it.
 *
 * Two things worth knowing here.
 *
 * Batched primitives do not report an object you handed Cesium — a pick comes
 * back as a geometry instance — so `CellPicker` is what turns a click or hover
 * back into a cell index. This is the part most people hand-roll incorrectly.
 *
 * And recoloring goes through `setCellStyle`, which writes into the primitive's
 * per-instance attributes. It does not rebuild geometry, so it is cheap enough
 * to run on every mouse move.
 */
import { Color, Viewer } from 'cesium';
import {
  CellPicker,
  H3CellLayer,
  children,
  disk,
  neighbors,
  parent,
  type CellStyle,
} from '@stevenpg/cesium-h3';

const viewer = new Viewer('cesiumContainer');

const BASE = Color.CYAN.withAlpha(0.2);
const HOVER = Color.WHITE.withAlpha(0.5);
const RELATED = Color.fromCssColorString('#7aa2ff').withAlpha(0.7);
const SELECTED = Color.ORANGE;

let selected: string | undefined;
let hovered: string | undefined;
let related = new Set<string>();

function styleFor(cell: string): CellStyle {
  if (cell === selected) return { color: SELECTED };
  if (related.has(cell)) return { color: RELATED };
  if (cell === hovered) return { color: HOVER };
  return { color: BASE };
}

const layer = new H3CellLayer(viewer.scene, { style: styleFor, outlines: true });
layer.setCells(disk('8928308280fffff', 6));

new CellPicker(viewer.scene, [layer], {
  onClick: ({ id }) => {
    // Clicking the selected cell again clears the selection.
    selected = selected === id ? undefined : id;

    // Every traversal returns plain cell indices, so combining them is just
    // set arithmetic. Swap `neighbors` for any of these:
    //
    //   neighbors(id)        six cells sharing an edge (five at a pentagon)
    //   disk(id, 2)          everything within two steps, including id
    //   ring(id, 3)          only the cells exactly three steps away
    //   children(id)         the seven cells one resolution finer
    //   parent(id)           the containing cell one resolution coarser
    //   pathBetween(a, b)    a line of cells from one to another
    related = new Set(selected ? neighbors(selected) : []);

    // Restyle re-runs the style function over every cell without rebuilding.
    layer.restyle();
  },

  onHover: ({ id }) => {
    const previous = hovered;
    hovered = id;
    // Touch only the two cells that changed rather than restyling everything.
    if (previous) layer.setCellStyle(previous, styleFor(previous));
    layer.setCellStyle(id, styleFor(id));
  },

  onHoverOut: (id) => {
    hovered = undefined;
    layer.setCellStyle(id, styleFor(id));
  },
});

/*
Traversals that need a different resolution work the same way. To show what a
selected cell contains, draw its children instead of its neighbors:

  related = new Set(children(selected));
  layer.setCells([...layer.cells, ...related]);   // children are finer, so they need drawing
*/

export { viewer, layer, styleFor, children, parent };
