import type { Color, Scene } from 'cesium';
import type { CellStyleFunction, ViewInfo } from '@stevenpg/cesium-spatial-core';
import * as h3 from '@stevenpg/cesium-h3';
import * as s2 from '@stevenpg/cesium-s2';

/**
 * The demo speaks to both libraries through this adapter.
 *
 * The two packages deliberately expose their own idiom rather than a shared
 * interface — H3 talks about resolutions and disks, S2 about levels and cube
 * faces — so anything wanting to swap between them at runtime writes a small
 * shim like this one. It is about thirty lines, which is roughly the cost of
 * that design decision.
 */
export type SystemId = 'h3' | 's2';

/** A normalized view-layer result, whichever library produced it. */
export interface GridResult {
  cells: string[];
  level: number;
  coarsened: boolean;
  view: ViewInfo;
}

/** Options the demo passes when building a view layer. */
export interface GridLayerOptions {
  style: CellStyleFunction;
  maxCells: number;
  targetEdgePixels: number;
  outlines: boolean;
  outlineColor: Color;
  clampToGround: boolean;
  translucent: boolean;
  level?: number;
  onUpdate: (result: GridResult) => void;
}

/** The subset of a view layer the demo drives. */
export interface GridLayer {
  readonly cellLayer: {
    restyle(): void;
    setCellStyle(cell: string, style: ReturnType<CellStyleFunction>): void;
    resolvePick(picked: unknown): string | undefined;
  };
  level: number | undefined;
  destroy(): void;
}

/** One spatial index, as the demo needs it. */
export interface GridSystem {
  id: SystemId;
  label: string;
  /** What this system calls a level, for labels. */
  levelNoun: string;
  minLevel: number;
  maxLevel: number;
  /** Row height for the ladder, so 31 S2 levels still fit the rail. */
  rungHeight: number;
  edgeMeters(level: number): number;
  levelFor(metersPerPixel: number, targetEdgePixels: number): number;
  estimate(rectangle: ViewInfo['rectangle'], level: number): number;
  levelOf(cell: string): number;
  center(cell: string): [number, number];
  areaMeters(cell: string): number;
  /** Relations offered for the selection highlight, in this system's own terms. */
  relations: { value: string; label: string }[];
  related(cell: string, relation: string): string[];
  createLayer(scene: Scene, options: GridLayerOptions): GridLayer;
}

export const H3_SYSTEM: GridSystem = {
  id: 'h3',
  label: 'H3',
  levelNoun: 'resolution',
  minLevel: h3.MIN_RESOLUTION,
  maxLevel: h3.MAX_RESOLUTION,
  rungHeight: 16,
  edgeMeters: h3.resolutionEdgeMeters,
  levelFor: (metersPerPixel, targetEdgePixels) =>
    h3.resolutionForMetersPerPixel(metersPerPixel, { targetEdgePixels }),
  estimate: (rectangle, level) => h3.estimateCellCount(rectangle, level),
  levelOf: h3.resolutionOf,
  center: h3.cellToLngLat,
  areaMeters: h3.cellAreaMeters,
  relations: [
    { value: 'neighbors', label: 'neighbors (6)' },
    { value: 'disk2', label: 'disk k=2' },
    { value: 'ring3', label: 'ring k=3' },
    { value: 'children', label: 'children (7)' },
    { value: 'parent', label: 'parent' },
    { value: 'none', label: 'nothing' },
  ],
  related(cell, relation) {
    switch (relation) {
      case 'neighbors':
        return h3.neighbors(cell);
      case 'disk2':
        return h3.disk(cell, 2);
      case 'ring3':
        return h3.ring(cell, 3);
      case 'children':
        return h3.children(cell);
      case 'parent':
        return [h3.parent(cell)];
      default:
        return [];
    }
  },
  createLayer(scene, options) {
    const layer = new h3.H3ViewLayer(scene, {
      ...options,
      ...(options.level !== undefined ? { resolution: options.level } : {}),
      onUpdate: (result) =>
        options.onUpdate({
          cells: result.cells,
          level: result.resolution,
          coarsened: result.coarsened,
          view: result.view,
        }),
    });
    return {
      cellLayer: layer.layer,
      get level() {
        return layer.resolution;
      },
      destroy: () => layer.destroy(),
    };
  },
};

export const S2_SYSTEM: GridSystem = {
  id: 's2',
  label: 'S2',
  levelNoun: 'level',
  minLevel: s2.MIN_LEVEL,
  maxLevel: s2.MAX_LEVEL,
  // Thirty-one levels against H3's sixteen, so the rungs run tighter.
  rungHeight: 12,
  edgeMeters: s2.levelEdgeMeters,
  levelFor: (metersPerPixel, targetEdgePixels) =>
    s2.levelForMetersPerPixel(metersPerPixel, { targetEdgePixels }),
  estimate: (rectangle, level) => s2.estimateCellCount(rectangle, level),
  levelOf: s2.levelOf,
  center: s2.cellToLngLat,
  areaMeters: s2.cellAreaMeters,
  relations: [
    { value: 'neighbors', label: 'edge neighbors (4)' },
    { value: 'vertex', label: 'vertex neighbors' },
    { value: 'all', label: 'all neighbors' },
    { value: 'children', label: 'children (4)' },
    { value: 'parent', label: 'parent' },
    { value: 'none', label: 'nothing' },
  ],
  related(cell, relation) {
    switch (relation) {
      case 'neighbors':
        return s2.neighbors(cell);
      case 'vertex':
        return s2.vertexNeighbors(cell);
      case 'all':
        return s2.allNeighbors(cell);
      case 'children':
        return s2.children(cell);
      case 'parent':
        return [s2.parent(cell)];
      default:
        return [];
    }
  },
  createLayer(scene, options) {
    const layer = new s2.S2ViewLayer(scene, {
      ...options,
      ...(options.level !== undefined ? { level: options.level } : {}),
      onUpdate: (result) =>
        options.onUpdate({
          cells: result.cells,
          level: result.level,
          coarsened: result.coarsened,
          view: result.view,
        }),
    });
    return {
      cellLayer: layer.layer,
      get level() {
        return layer.level;
      },
      destroy: () => layer.destroy(),
    };
  },
};

export const SYSTEMS: Record<SystemId, GridSystem> = { h3: H3_SYSTEM, s2: S2_SYSTEM };
