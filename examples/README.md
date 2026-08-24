# Examples

Short, focused programs showing one thing each. They are typechecked against
the packages' published declarations as part of `pnpm verify`, so they cannot
drift out of date without CI noticing.

They are written to be read and copied rather than run: each assumes a page with
a `#cesiumContainer` element and, where a control is involved, says which markup
it expects. Nothing here needs a build step of its own.

## Start here

| Example | What it shows |
| --- | --- |
| [view-layer.ts](src/view-layer.ts) | A grid that follows the camera, in about ten lines. What the demo runs. |
| [cell-at-click.ts](src/cell-at-click.ts) | Click the globe for the cell containing that point; a slider moves it through every resolution. |

## Working with data

| Example | What it shows |
| --- | --- |
| [bin-points-into-cells.ts](src/bin-points-into-cells.ts) | Aggregating latitude/longitude points into per-cell counts, then coloring by them. The most common reason to use a grid at all. |
| [extruded-values.ts](src/extruded-values.ts) | Cells as 3D bars, and which property changes are cheap versus which rebuild geometry. |
| [cover-a-region.ts](src/cover-a-region.ts) | Filling a rectangle, an arbitrary polygon, or the current view — with a budget that coarsens rather than overrunning. |

## Interaction and rendering

| Example | What it shows |
| --- | --- |
| [select-and-traverse.ts](src/select-and-traverse.ts) | Picking a cell from a batched primitive, then walking to neighbors, parents and children. |
| [entity-layer.ts](src/entity-layer.ts) | One Cesium entity per cell, with a description panel and a full construction hook. When this is worth its cost. |
| [choose-resolution.ts](src/choose-resolution.ts) | Deriving a resolution from the camera yourself, with hysteresis, for when you want the decision without the layer. |

## S2

| Example | What it shows |
| --- | --- |
| [s2-basics.ts](src/s2-basics.ts) | The same jobs in S2, and the four places it genuinely differs from H3. |

## Things worth knowing before you copy

**Longitude comes first.** Every function here takes `(longitude, latitude)` in
degrees, matching Cesium rather than the underlying grid libraries, which take
latitude first. This is the single most common mistake when porting code that
called `h3-js` directly.

**Recoloring is cheap, resizing is not.** `setCellStyle` writes into the
primitive's per-instance attributes and does not rebuild geometry, so it is fine
every frame. Changing a cell's height or the set of cells rebuilds, so batch
those.

**Layers hold subscriptions.** `H3ViewLayer` and `S2ViewLayer` listen to the
camera and own a Cesium primitive. Call `destroy()` when the view goes away;
Cesium will not do it for you.

**A cell index is just a string.** Sets, maps, JSON and equality all work as you
would expect, which is why binning and joins need no special machinery.

For anything not covered here, the
[API reference](https://stevenpg.github.io/cesium-spatial/api/) documents every
exported symbol, and the [demo](https://stevenpg.github.io/cesium-spatial/demo.html)
exercises most of the surface in one page.
