import type { EntityCollection, Scene } from 'cesium';
import {
  CellEntityLayer,
  CellPrimitiveLayer,
  type CellEntityLayerOptions,
  type CellId,
  type CellPrimitiveLayerOptions,
  type CellStyle,
} from '@stevenpg/cesium-spatial-core';
import { getCellBoundaries } from './geometry.js';
import type { H3Cell } from './types.js';

/** Options for {@link H3CellLayer}. */
export type H3CellLayerOptions = CellPrimitiveLayerOptions;

/**
 * A batched layer of H3 cells, addressed by cell index rather than geometry.
 *
 * This is the layer to reach for by default: thousands of cells render as a
 * single primitive, and recoloring does not rebuild it.
 */
export class H3CellLayer {
  private readonly layer: CellPrimitiveLayer;
  private current: H3Cell[] = [];

  constructor(scene: Scene, options: H3CellLayerOptions = {}) {
    this.layer = new CellPrimitiveLayer(scene, options);
  }

  /** The cells currently drawn, in the order they were last set. */
  get cells(): readonly H3Cell[] {
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
  setCells(cells: readonly H3Cell[]): void {
    this.current = [...cells];
    this.layer.setCells(getCellBoundaries(this.current));
  }

  /** Removes every cell. */
  clear(): void {
    this.setCells([]);
  }

  /** Recolors or hides one cell without rebuilding the layer. */
  setCellStyle(cell: H3Cell, style: CellStyle): void {
    this.layer.setCellStyle(cell, style);
  }

  /** Re-runs the style function over every cell. */
  restyle(): void {
    this.layer.restyle();
  }

  /** Maps a Cesium pick result back to a cell, or `undefined`. */
  resolvePick(picked: unknown): CellId | undefined {
    return this.layer.resolvePick(picked);
  }

  destroy(): void {
    this.layer.destroy();
    this.current = [];
  }
}

/** Options for {@link H3EntityLayer}. */
export type H3EntityLayerOptions = CellEntityLayerOptions;

/**
 * H3 cells as individual Cesium entities.
 *
 * Costs much more per cell than {@link H3CellLayer}, in exchange for giving
 * every cell its own entity to select, describe, animate or hand to the rest
 * of a Cesium application.
 */
export class H3EntityLayer {
  private readonly layer: CellEntityLayer;
  private current: H3Cell[] = [];

  constructor(collection: EntityCollection, options: H3EntityLayerOptions = {}) {
    this.layer = new CellEntityLayer(collection, options);
  }

  get cells(): readonly H3Cell[] {
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
  setCells(cells: readonly H3Cell[]): void {
    this.current = [...cells];
    this.layer.setCells(getCellBoundaries(this.current));
  }

  clear(): void {
    this.setCells([]);
  }

  /** The entity backing a cell, if it is currently drawn. */
  getEntity(cell: H3Cell) {
    return this.layer.getEntity(cell);
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
