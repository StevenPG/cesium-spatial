import { Cartographic, EllipsoidGeodesic, Math as CesiumMath, Rectangle, Ellipsoid } from 'cesium';

/**
 * Rewrites a ring's longitudes so consecutive vertices never jump more than
 * 180 degrees, pushing values past +/-180 where needed.
 *
 * Cells that straddle the antimeridian otherwise produce rings whose longitudes
 * flip between +179 and -179, which makes any naive min/max bounding box span
 * the entire globe. Cartesian conversion is unaffected by the unwrapping.
 */
export function unwrapLongitudes(ring: number[]): number[] {
  const out = ring.slice();
  for (let i = 2; i < out.length; i += 2) {
    const previous = out[i - 2];
    let lng = out[i];
    while (lng - previous > 180) lng -= 360;
    while (previous - lng > 180) lng += 360;
    out[i] = lng;
  }
  return out;
}

/** True when the ring's vertices span the antimeridian. */
export function crossesAntimeridian(ring: number[]): boolean {
  for (let i = 2; i < ring.length; i += 2) {
    if (Math.abs(ring[i] - ring[i - 2]) > 180) return true;
  }
  return false;
}

/** Normalizes a longitude in degrees into [-180, 180). */
function normalizeLongitudeDegrees(lng: number): number {
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  return wrapped;
}

/**
 * Bounding {@link Rectangle} (radians) for a ring, correct across the
 * antimeridian. The result may have `west > east`, which is Cesium's
 * convention for a rectangle that wraps.
 */
export function ringToRectangle(ring: number[], result?: Rectangle): Rectangle {
  const unwrapped = unwrapLongitudes(ring);
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;

  for (let i = 0; i < unwrapped.length; i += 2) {
    const lng = unwrapped[i];
    const lat = unwrapped[i + 1];
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }

  const target = result ?? new Rectangle();
  if (east - west >= 360) {
    target.west = -Math.PI;
    target.east = Math.PI;
  } else {
    target.west = CesiumMath.toRadians(normalizeLongitudeDegrees(west));
    target.east = CesiumMath.toRadians(normalizeLongitudeDegrees(east));
  }
  target.south = CesiumMath.toRadians(Math.max(south, -90));
  target.north = CesiumMath.toRadians(Math.min(north, 90));
  return target;
}

/**
 * Inserts vertices along each edge so no segment exceeds `maxEdgeMeters` of
 * surface distance.
 *
 * Large cells have edges long enough that a straight line between their corners
 * visibly cuts through the globe. Cesium's geodesic polygons handle the fill,
 * but outlines and any client-side geometry need the extra vertices.
 */
export function densifyRing(
  ring: number[],
  maxEdgeMeters: number,
  ellipsoid: Ellipsoid = Ellipsoid.WGS84,
): number[] {
  if (ring.length < 4 || maxEdgeMeters <= 0) return ring.slice();

  const unwrapped = unwrapLongitudes(ring);
  const out: number[] = [];
  const start = new Cartographic();
  const end = new Cartographic();
  const sample = new Cartographic();
  const geodesic = new EllipsoidGeodesic(undefined, undefined, ellipsoid);
  const vertexCount = unwrapped.length / 2;

  for (let i = 0; i < vertexCount; i++) {
    const next = (i + 1) % vertexCount;
    const lngA = unwrapped[i * 2];
    const latA = unwrapped[i * 2 + 1];
    const lngB = unwrapped[next * 2];
    const latB = unwrapped[next * 2 + 1];

    out.push(lngA, latA);

    Cartographic.fromDegrees(normalizeLongitudeDegrees(lngA), latA, 0, start);
    Cartographic.fromDegrees(normalizeLongitudeDegrees(lngB), latB, 0, end);
    // Coincident endpoints make EllipsoidGeodesic throw.
    if (Cartographic.equalsEpsilon(start, end, CesiumMath.EPSILON10)) continue;

    geodesic.setEndPoints(start, end);
    const steps = Math.ceil(geodesic.surfaceDistance / maxEdgeMeters);
    for (let s = 1; s < steps; s++) {
      geodesic.interpolateUsingFraction(s / steps, sample);
      out.push(CesiumMath.toDegrees(sample.longitude), CesiumMath.toDegrees(sample.latitude));
    }
  }

  // Interpolation returns normalized longitudes, so re-unwrap the result.
  return unwrapLongitudes(out);
}
