export type { H3Cell } from './types.js';

export {
  cellAt,
  cellAtCartographic,
  isValid,
  resolutionOf,
  isPentagonCell,
  neighbors,
  disk,
  ring,
  diskByDistance,
  areNeighbors,
  distanceBetween,
  pathBetween,
  parent,
  ancestors,
  children,
  centerChild,
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
  cellToRectangle,
  cellsToRectangle,
  cellToLngLat,
  getCellBoundary,
  getCellBoundaries,
  clearBoundaryCache,
} from './geometry.js';

export {
  H3_RESOLUTIONS,
  MIN_RESOLUTION,
  MAX_RESOLUTION,
  resolutionAreaMeters,
  resolutionEdgeMeters,
  resolutionForMetersPerPixel,
  createResolutionSelector,
  clampResolution,
} from './resolution.js';

export {
  cellsInRectangle,
  cellsInPolygon,
  estimateCellCount,
  coverRectangle,
  rectangleToDegreeRing,
  type CoverOptions,
  type CoverResult,
} from './cover.js';

export { cellsInView, type CellsInViewOptions, type CellsInViewResult } from './view.js';

export {
  H3CellLayer,
  H3EntityLayer,
  type H3CellLayerOptions,
  type H3EntityLayerOptions,
} from './layer.js';

export { H3ViewLayer, type H3ViewLayerOptions } from './view-layer.js';

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
