import {
  Cartesian2,
  Cartesian3,
  Math as CesiumMath,
  OrthographicFrustum,
  PerspectiveFrustum,
  Rectangle,
  type Ellipsoid,
  type Scene,
} from 'cesium';

/** A snapshot of what the camera can currently see, in terms useful for choosing cells. */
export interface ViewInfo {
  /** Approximate visible extent. Wraps the antimeridian when `west > east`. */
  rectangle: Rectangle;
  /** Ground resolution at the center of the screen, in meters per CSS pixel. */
  metersPerPixel: number;
  /** Distance from the camera to the point it is looking at, in meters. */
  distanceToTarget: number;
  /** Camera height above the ellipsoid, in meters. */
  cameraHeight: number;
  /**
   * True when the visible extent covers most of the globe, which is the case
   * where a cell cover is unbounded and callers should lean on a cell budget.
   */
  isGlobeView: boolean;
}

const scratchCenter = new Cartesian2();
const scratchPick = new Cartesian3();

/**
 * Measures the current view.
 *
 * Returns `undefined` only when the camera is looking away from the globe and
 * Cesium cannot produce a view rectangle at all.
 */
export function computeViewInfo(scene: Scene, result?: Rectangle): ViewInfo | undefined {
  const camera = scene.camera;
  const ellipsoid: Ellipsoid = scene.globe?.ellipsoid ?? scene.mapProjection.ellipsoid;

  const rectangle = camera.computeViewRectangle(ellipsoid, result ?? new Rectangle());
  if (!rectangle) return undefined;

  const cameraHeight = camera.positionCartographic.height;

  // Distance to what the camera is actually pointing at, falling back to raw
  // altitude when the center of the screen misses the globe (horizon views).
  scratchCenter.x = scene.drawingBufferWidth / 2;
  scratchCenter.y = scene.drawingBufferHeight / 2;
  const target = camera.pickEllipsoid(scratchCenter, ellipsoid, scratchPick);
  const distanceToTarget = target
    ? Cartesian3.distance(camera.positionWC, target)
    : Math.max(cameraHeight, 1);

  const width = Rectangle.computeWidth(rectangle);
  const height = Rectangle.computeHeight(rectangle);
  const isGlobeView = width >= CesiumMath.PI * 1.9 && height >= CesiumMath.PI * 0.9;

  return {
    rectangle,
    metersPerPixel: computeMetersPerPixel(scene, distanceToTarget),
    distanceToTarget,
    cameraHeight,
    isGlobeView,
  };
}

/**
 * Ground meters covered by one pixel at the given distance from the camera.
 *
 * Uses the drawing buffer rather than the CSS size so the value stays stable
 * on high-DPI displays where `resolutionScale` differs from 1.
 */
export function computeMetersPerPixel(scene: Scene, distance: number): number {
  const frustum = scene.camera.frustum;
  const pixels = Math.max(scene.drawingBufferHeight, 1);

  if (frustum instanceof PerspectiveFrustum && frustum.fovy !== undefined) {
    return (2 * distance * Math.tan(frustum.fovy / 2)) / pixels;
  }
  if (frustum instanceof OrthographicFrustum && frustum.width !== undefined) {
    return frustum.width / Math.max(scene.drawingBufferWidth, 1);
  }
  // Columbus/2D frustums and anything exotic: approximate from the view rectangle.
  return distance / pixels;
}

/** Approximate ground area of a rectangle in square meters. */
export function rectangleAreaMeters(rectangle: Rectangle, ellipsoid: Ellipsoid): number {
  const radius = ellipsoid.maximumRadius;
  const width = Rectangle.computeWidth(rectangle);
  // Integral of cos(lat) over the latitude span, which accounts for convergence
  // toward the poles far better than treating the rectangle as flat.
  const latitudeTerm = Math.sin(rectangle.north) - Math.sin(rectangle.south);
  return Math.abs(radius * radius * width * latitudeTerm);
}
