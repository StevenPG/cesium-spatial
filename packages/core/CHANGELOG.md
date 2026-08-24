# @stevenpg/cesium-spatial-core

## 0.0.1

Initial release. The grid-independent half of the project: reading the visible
extent and ground meters-per-pixel from a Cesium camera, choosing a cell level
from that with hysteresis, batched primitive and entity layers that keep set
changes separate from style changes, picking a rendered geometry back to the
cell it came from, and the antimeridian handling the grid packages build on.
