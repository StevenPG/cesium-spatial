# @stevenpg/cesium-spatial-core

[![npm](https://img.shields.io/npm/v/@stevenpg/cesium-spatial-core?color=4ee1c1)](https://www.npmjs.com/package/@stevenpg/cesium-spatial-core)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/StevenPG/cesium-spatial/blob/main/LICENSE)

Shared machinery behind the [cesium-spatial](https://github.com/StevenPG/cesium-spatial) grid
libraries: everything about drawing cells on a Cesium globe that does not depend on which spatial
index produced them.

You usually do not install this directly — [`@stevenpg/cesium-h3`](https://www.npmjs.com/package/@stevenpg/cesium-h3)
depends on it and re-exports the parts you need. Reach for it if you are adapting another index
onto the same rendering and level-of-detail machinery.

```bash
npm install @stevenpg/cesium-spatial-core cesium
```

## What is here

**Rendering.** `CellPrimitiveLayer` batches many cells into one Cesium `Primitive`, separating set
changes (which rebuild geometry) from style changes (which write per-instance attributes and do
not). `CellEntityLayer` reconciles cells against an `EntityCollection`, keeping surviving entities
identical so selections and external references stay valid.

**Picking.** `CellPicker` resolves a batched geometry-instance pick back to a cell id by asking each
registered layer to claim it.

**Camera.** `computeViewInfo` reports the visible extent plus ground meters-per-pixel, derived from
the frustum rather than raw camera altitude, so oblique and horizon views stay honest.

**Level of detail.** `selectLevel` maps a ground resolution onto an index level by comparing in log
space; `LevelSelector` adds a deadband so a nudged camera does not thrash between levels.

**Geodesy.** `unwrapLongitudes` and `ringToRectangle` keep antimeridian-straddling cells from
producing globe-spanning bounding boxes. `densifyRing` subdivides along geodesics so long cell edges
do not visibly cut through the globe.

Cesium is a peer dependency (`>= 1.95`, or `@cesium/engine`).

Apache-2.0.
