# @stevenpg/cesium-h3

[![npm](https://img.shields.io/npm/v/@stevenpg/cesium-h3?color=4ee1c1)](https://www.npmjs.com/package/@stevenpg/cesium-h3)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/StevenPG/cesium-spatial/blob/main/LICENSE)
[![CesiumJS](https://img.shields.io/badge/cesium-%E2%89%A5%201.95-6bafd6)](https://cesium.com/platform/cesiumjs/)

[H3](https://h3geo.org/) hexagonal grid helpers for [CesiumJS](https://cesium.com/platform/cesiumjs/).
Cover the current view with cells, render thousands of them as one batched primitive, and traverse
the grid — without touching `h3-js` yourself.

![H3 cells drawn over a Cesium globe](https://raw.githubusercontent.com/StevenPG/cesium-spatial/main/docs/media/hero.jpg)

**[Live demo](https://stevenpg.github.io/cesium-spatial/demo.html)** ·
**[API reference](https://stevenpg.github.io/cesium-spatial/api/modules/_stevenpg_cesium-h3.html)**

## A layer that follows the camera

```ts
import { Viewer } from 'cesium';
import { H3ViewLayer } from '@stevenpg/cesium-h3';

const viewer = new Viewer('cesiumContainer');

const layer = new H3ViewLayer(viewer.scene, {
  maxCells: 8000,        // budget; coarsens rather than overrunning
  targetEdgePixels: 72,  // how big a cell should look on screen
  outlines: true,
  onUpdate: ({ cells, resolution }) => console.log(cells.length, 'at res', resolution),
});
```

It watches the camera, derives a resolution from the view's ground resolution, covers the visible
extent, and rebuilds only when the set of cells actually changes.

## Or drive it yourself

```ts
import { cellAt, disk, parent, H3CellLayer } from '@stevenpg/cesium-h3';
import { Color } from 'cesium';

const origin = cellAt(-122.4194, 37.7749, 9);   // longitude first, Cesium-style
const patch = disk(origin, 12);                 // 469 cells

const layer = new H3CellLayer(viewer.scene, {
  style: (cell) => ({ color: cell === origin ? Color.ORANGE : Color.CYAN.withAlpha(0.3) }),
});

layer.setCells(patch);
layer.setCellStyle(parent(origin), { color: Color.MAGENTA });  // no rebuild
```

## Picking

Batched primitives report geometry instances rather than application objects, so resolving a click
back to a cell needs a hand:

```ts
import { CellPicker } from '@stevenpg/cesium-h3';

new CellPicker(viewer.scene, [layer], {
  onClick: ({ id }) => console.log('clicked', id),
  onHover: ({ id }) => layer.setCellStyle(id, { color: Color.WHITE }),
});
```

## API

### Cells

`cellAt(longitude, latitude, resolution)`, `cellAtCartographic`, `isValid`, `resolutionOf`,
`isPentagonCell`, `cellAreaMeters`.

`neighbors`, `disk`, `ring`, `diskByDistance`, `areNeighbors`, `distanceBetween`, `pathBetween`.

`parent`, `ancestors`, `children`, `centerChild`, `compact`, `uncompact`.

Neighbor and ring queries use H3's pentagon-safe traversals, so the twelve pentagons return five
neighbors rather than nothing.

### Geometry

`cellToRing` (flat `[lng, lat, ...]` degrees), `cellToCellBoundary`, `cellsToBoundaries`,
`cellToPositions`, `cellToCartographic`, `cellToCartesian`, `cellToLngLat`, `cellToRectangle`,
`cellsToRectangle`.

`getCellBoundary` / `getCellBoundaries` memoize behind a bounded cache and are safe to call every
frame. `clearBoundaryCache` empties it.

### Cover

`cellsInRectangle`, `cellsInPolygon`, `coverRectangle` (budget-aware), `estimateCellCount`,
`cellsInView`.

H3 treats any polygon whose consecutive longitudes jump more than 180° as crossing the
antimeridian, with no way to say otherwise — so asking for the 200° around Greenwich silently
returns the 160° around the dateline. `cellsInRectangle` splits wide extents into quarter-turn
segments first, which removes the ambiguity and handles Cesium's wrapping rectangles
(`west > east`) as a side effect.

`estimateCellCount` works from rectangle area rather than generating cells, so a budget can back
off to a coarser resolution without first materialising a set that could be millions of cells.

### Resolution

`H3_RESOLUTIONS` (read from h3-js, not hard-coded), `resolutionForMetersPerPixel`,
`createResolutionSelector` (adds hysteresis), `resolutionEdgeMeters`, `resolutionAreaMeters`,
`clampResolution`.

### Layers

`H3ViewLayer` — camera-driven, debounced, budget-aware.

`H3CellLayer` — batched primitives. Thousands of cells, one draw. Adding or removing cells rebuilds;
`setCellStyle` and `restyle` do not.

`H3EntityLayer` — one Cesium entity per cell. Far more expensive, but each cell becomes a real
entity you can select, describe or animate. Accepts an options bag or a full `entityFactory` hook.

All three support terrain clamping, extrusion into prisms, and optional outlines.

## Cesium compatibility

Cesium is a peer dependency (`>= 1.95`), so this never bundles a second copy of the engine.
`@cesium/engine` is supported as an optional peer; everything used lives in engine, so an
engine-only project can alias `cesium` to `@cesium/engine` in its bundler.

`h3-js` is a regular dependency. It is compiled C and around 500 KB, which is why H3 lives in its
own package rather than a combined one.

## See also

[`@stevenpg/cesium-s2`](https://www.npmjs.com/package/@stevenpg/cesium-s2) does the same job for the
S2 grid, on the same core.

Apache-2.0.
