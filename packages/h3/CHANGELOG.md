# @stevenpg/cesium-h3

## 0.0.1

Initial release. H3 cells on a CesiumJS globe: `H3ViewLayer` for a grid that
follows the camera, cell lookup and geometry, traversal across neighbors, disks,
rings, parents, children and compaction, and covers from a rectangle, a polygon
or the current view.

Rectangles are split into quarter-turn segments before they reach
`polygonToCells`, which reads any longitude jump wider than 180 degrees as an
antimeridian crossing and otherwise returns the complement of a wide extent.
