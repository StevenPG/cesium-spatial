# @stevenpg/cesium-s2

## 0.0.1

Initial release. S2 cells on a CesiumJS globe: `S2ViewLayer` for a grid that
follows the camera, cell lookup by token or id, geometry, traversal, and both
uniform-level and native mixed-level covers.

Cell counts are estimated from a level's average area before a cover is
generated, because `RegionCoverer` ignores its cell budget when a minimum level
is fixed and will return millions of cells rather than truncate.
