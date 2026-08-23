# @stevenpg/cesium-s2

[![npm](https://img.shields.io/npm/v/@stevenpg/cesium-s2?color=4ee1c1)](https://www.npmjs.com/package/@stevenpg/cesium-s2)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/StevenPG/cesium-spatial/blob/main/LICENSE)
[![CesiumJS](https://img.shields.io/badge/cesium-%E2%89%A5%201.95-6bafd6)](https://cesium.com/platform/cesiumjs/)

[S2 geometry](http://s2geometry.io/) cell helpers for [CesiumJS](https://cesium.com/platform/cesiumjs/).
Cover the current view with cells, render thousands of them as one batched primitive, and traverse
the grid — without touching an S2 library yourself.

![The six S2 cube faces drawn over a Cesium globe](https://raw.githubusercontent.com/StevenPG/cesium-spatial/main/docs/media/s2-globe.jpg)

**[Live demo](https://stevenpg.github.io/cesium-spatial/demo.html)** ·
**[API reference](https://stevenpg.github.io/cesium-spatial/api/modules/_stevenpg_cesium-s2.html)**

## A layer that follows the camera

```ts
import { Viewer } from 'cesium';
import { S2ViewLayer } from '@stevenpg/cesium-s2';

const viewer = new Viewer('cesiumContainer');

const layer = new S2ViewLayer(viewer.scene, {
  maxCells: 8000,        // budget; coarsens rather than overrunning
  targetEdgePixels: 72,  // how big a cell should look on screen
  outlines: true,
  onUpdate: ({ cells, level }) => console.log(cells.length, 'at level', level),
});
```

## Or drive it yourself

```ts
import { cellAt, neighbors, parent, S2CellLayer } from '@stevenpg/cesium-s2';
import { Color } from 'cesium';

const origin = cellAt(-122.4194, 37.7749, 13);   // longitude first, Cesium-style
const patch = [origin, ...neighbors(origin)];    // always exactly four neighbors

const layer = new S2CellLayer(viewer.scene, {
  style: (cell) => ({ color: cell === origin ? Color.ORANGE : Color.CYAN.withAlpha(0.3) }),
});

layer.setCells(patch);
layer.setCellStyle(parent(origin), { color: Color.MAGENTA });  // no rebuild
```

## Cells are tokens

S2 cell ids are 64-bit integers. This library addresses cells by their canonical **token** — the
standard lossless hex string, like `8085809c` — because tokens compare, sort into maps and survive
JSON without `bigint` caveats. A raw `bigint` is accepted anywhere a token is, and `toCellId` /
`toToken` convert between them.

## How this differs from the H3 package

Not a reskin. Three things behave differently because S2 does.

**No antimeridian splitting.** S2's longitude interval represents wrapping natively, so a Cesium
rectangle with `west > east` becomes an inverted interval and covers the short way round on its
own. Rectangles wider than 180° are fine too. The H3 package has to segment extents before its
library sees them; this one does not.

**The budget is load-bearing, not an optimization.** S2's coverer treats a minimum level as
non-negotiable and will return millions of cells rather than truncate to `maxCells`. So
`coverRectangle` estimates from area *before* generating anything and steps to a coarser level.
Call `cellsInRectangle` directly only when you already know the extent is small.

**Uniform and adaptive covers are both available.** `cellsInRectangle` and `coverRectangle` give
one level everywhere, matching the H3 mental model. `adaptiveCover` exposes S2's native
mixed-level covering — coarse cells inside, fine cells along the edges, to hit a cell count. That
has no H3 equivalent and is what S2 is genuinely good at.

Neighbor queries are also simpler: every S2 cell has exactly four edge neighbors, everywhere,
including at the poles and across cube-face seams. There is no pentagon case.

## Geometry notes

**Edges are geodesics.** A level 0 cell edge spans a quarter turn, so boundaries densify above
200 km by default (`DEFAULT_MAX_EDGE_METERS`). That threshold is a no-op from level 8 down. It
matters most for outlines, which are drawn as straight segments between vertices; Cesium's polygon
fill follows geodesics regardless.

**Bounds come from S2, not from the corners.** `cellToRectangle` uses S2's own `rectBound`, which
accounts for edges bulging past their endpoints. A level 0 face reaches 45° of latitude while its
corners sit at 35.26° — taking the extent of four corners would understate it by ten degrees.

**Poles.** `containsPoleInterior` flags the two polar cube faces at level 0, which enclose a pole
rather than touching it, so their four corners circle the globe. This is informational: Cesium
renders those polygons correctly, and it is verified in the demo. From level 1 down a pole is
always a shared corner of four cells. Reach for the predicate if you do your own projection or
bounding-box maths, where a ring that circles the globe needs care.

## API

### Cells

`cellAt(longitude, latitude, level)`, `cellAtCartographic`, `isValid`, `levelOf`, `faceOf`,
`cellAreaMeters`, `toCellId`, `toToken`.

`neighbors` (four, always), `vertexNeighbors`, `allNeighbors`, `contains`, `intersects`.

`parent`, `ancestors`, `children`, `childrenAtLevel`, `compact`, `uncompact`.

### Geometry

`cellToRing`, `cellToCellBoundary`, `cellsToBoundaries`, `cellToPositions`, `cellToCartographic`,
`cellToCartesian`, `cellToLngLat`, `cellToRectangle`, `cellsToRectangle`, `containsPoleInterior`.

`getCellBoundary` / `getCellBoundaries` memoize behind a bounded cache and are safe to call every
frame. `clearBoundaryCache` empties it.

### Cover

`cellsInRectangle`, `coverRectangle`, `adaptiveCover`, `estimateCellCount`, `cellsInView`,
`toS2Rect`.

### Levels

`S2_LEVELS` (0 through 30), `levelForMetersPerPixel`, `createLevelSelector` (adds hysteresis),
`levelEdgeMeters`, `levelAreaMeters`, `clampLevel`.

Edge length is taken as the square root of average cell area rather than from S2's average-edge
metric, which `s2js` does not export. The two agree to within one percent, and this way the figure
comes from the library rather than a copied constant.

## Cesium compatibility

Cesium is a peer dependency (`>= 1.95`), so this never bundles a second copy of the engine.
`@cesium/engine` is supported as an optional peer.

[`s2js`](https://github.com/missinglink/s2js) is a regular dependency — a TypeScript port of Go's
S2 that runs in the browser, unlike the native-binding alternatives.

Apache-2.0.
