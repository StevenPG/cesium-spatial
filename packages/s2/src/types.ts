/**
 * An S2 cell, in its canonical hexadecimal token form (for example `8085809c`).
 *
 * S2 cell ids are 64-bit integers. Tokens are the standard lossless string
 * encoding, and are what this library uses throughout: they compare, sort into
 * maps and survive JSON without the `bigint` caveats.
 */
export type S2Cell = string;

/** Anywhere a cell is accepted, either a token or a raw 64-bit id will do. */
export type S2CellInput = S2Cell | bigint;

/**
 * Radius used to convert S2's angular measures into meters.
 *
 * S2 is defined on a unit sphere, so lengths and areas only become metric once
 * a radius is chosen. This is the authalic mean radius the S2 reference
 * implementation uses, which keeps areas comparable with other S2 tooling.
 */
export const EARTH_RADIUS_METERS = 6_371_010;
