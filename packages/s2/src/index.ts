export type { S2Cell, S2CellInput } from './types.js';
export { EARTH_RADIUS_METERS } from './types.js';

export {
  toCellId,
  toToken,
  cellAt,
  cellAtCartographic,
  isValid,
  levelOf,
  faceOf,
  neighbors,
  vertexNeighbors,
  allNeighbors,
  contains,
  intersects,
  parent,
  ancestors,
  children,
  childrenAtLevel,
  compact,
  uncompact,
  cellAreaMeters,
} from './cells.js';

export {
  cellToRing,
  cellToCellBoundary,
  cellsToBoundaries,
  cellToPositions,
  cellToCartographic,
  cellToCartesian,
  cellToLngLat,
  cellToRectangle,
  cellsToRectangle,
  containsPoleInterior,
  getCellBoundary,
  getCellBoundaries,
  clearBoundaryCache,
  DEFAULT_MAX_EDGE_METERS,
  type BoundaryOptions,
} from './geometry.js';

export {
  S2_LEVELS,
  MIN_LEVEL,
  MAX_LEVEL,
  levelAreaMeters,
  levelEdgeMeters,
  levelForMetersPerPixel,
  createLevelSelector,
  clampLevel,
} from './level.js';

export {
  cellsInRectangle,
  adaptiveCover,
  coverRectangle,
  estimateCellCount,
  toS2Rect,
  type CoverOptions,
  type CoverResult,
  type AdaptiveCoverOptions,
} from './cover.js';

export { cellsInView, type CellsInViewOptions, type CellsInViewResult } from './view.js';

export {
  S2CellLayer,
  S2EntityLayer,
  type S2CellLayerOptions,
  type S2EntityLayerOptions,
} from './layer.js';

export { S2ViewLayer, type S2ViewLayerOptions } from './view-layer.js';

// Re-exported so consumers can style, pick and measure without also taking a
// direct dependency on the core package.
export {
  CellPicker,
  computeViewInfo,
  LevelSelector,
  type CellBoundary,
  type CellId,
  type CellPickEvent,
  type CellPickerOptions,
  type CellStyle,
  type CellStyleFunction,
  type LevelInfo,
  type LevelSelectionOptions,
  type ViewInfo,
} from '@stevenpg/cesium-spatial-core';
