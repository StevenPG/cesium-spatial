import type { EntityCollection, Scene } from 'cesium';
import {
  CellEntityLayer,
  CellPrimitiveLayer,
  type CellEntityLayerOptions,
  type CellId,
  type CellPrimitiveLayerOptions,
  type CellStyle,
} from '@stevenpg/cesium-spatial-core';
import { toCellId, toToken } from './cells.js';
import { getCellBoundaries } from './geometry.js';
import type { S2Cell, S2CellInput } from './types.js';

/** Normalizes either cell form to the token the layers key on. */
function asToken(cell: S2CellInput): S2Cell {
  return typeof cell === 'string' ? cell : toToken(toCellId(cell));
}

/** Options for {@link S2CellLayer}. */
export type S2CellLayerOptions = CellPrimitiveLayerOptions;

/**
 * A batched layer of S2 cells, addressed by token rather than geometry.
 *
 * This is the layer to reach for by default: thousands of cells render as a
 * single primitive, and recoloring does not rebuild it.
 */
export class S2CellLayer {
  private readonly layer: CellPrimitiveLayer;
  private current: S2Cell[] = [];

  constructor(scene: Scene, options: S2CellLayerOptions = {}) {
    this.layer = new CellPrimitiveLayer(scene, options);
  }

  /** The cells currently drawn, as tokens, in the order they were last set. */
  get cells(): readonly S2Cell[] {
    return this.current;
  }

  get size(): number {
    return this.layer.size;
  }

  get show(): boolean {
    return this.layer.show;
  }

  set show(value: boolean) {
    this.layer.show = value;
  }

  /** Replaces the layer's contents with these cells. */
  setCells(cells: readonly S2CellInput[]): void {
    const boundaries = getCellBoundaries(cells);
    this.current = boundaries.map((boundary) => boundary.id);
    this.layer.setCells(boundaries);
  }

  /** Removes every cell. */
  clear(): void {
    this.setCells([]);
  }

  /** Recolors or hides one cell without rebuilding the layer. */
  setCellStyle(cell: S2CellInput, style: CellStyle): void {
    this.layer.setCellStyle(asToken(cell), style);
  }

  /** Re-runs the style function over every cell. */
  restyle(): void {
    this.layer.restyle();
  }

  /** Maps a Cesium pick result back to a cell token, or `undefined`. */
  resolvePick(picked: unknown): CellId | undefined {
    return this.layer.resolvePick(picked);
  }

  destroy(): void {
    this.layer.destroy();
    this.current = [];
  }
}

/** Options for {@link S2EntityLayer}. */
export type S2EntityLayerOptions = CellEntityLayerOptions;

/**
 * S2 cells as individual Cesium entities.
 *
 * Costs much more per cell than {@link S2CellLayer}, in exchange for giving
 * every cell its own entity to select, describe, animate or hand to the rest
 * of a Cesium application.
 */
export class S2EntityLayer {
  private readonly layer: CellEntityLayer;
  private current: S2Cell[] = [];

  constructor(collection: EntityCollection, options: S2EntityLayerOptions = {}) {
    this.layer = new CellEntityLayer(collection, options);
  }

  get cells(): readonly S2Cell[] {
    return this.current;
  }

  get size(): number {
    return this.layer.size;
  }

  get show(): boolean {
    return this.layer.show;
  }

  set show(value: boolean) {
    this.layer.show = value;
  }

  /** Reconciles the layer against these cells, keeping surviving entities. */
  setCells(cells: readonly S2CellInput[]): void {
    const boundaries = getCellBoundaries(cells);
    this.current = boundaries.map((boundary) => boundary.id);
    this.layer.setCells(boundaries);
  }

  clear(): void {
    this.setCells([]);
  }

  /** The entity backing a cell, if it is currently drawn. */
  getEntity(cell: S2CellInput) {
    return this.layer.getEntity(asToken(cell));
  }

  restyle(): void {
    this.layer.restyle();
  }

  resolvePick(picked: unknown): CellId | undefined {
    return this.layer.resolvePick(picked);
  }

  destroy(): void {
    this.layer.destroy();
    this.current = [];
  }
}
