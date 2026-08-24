// The demo exposes these for console poking; the E2E tests use them to drive
// the camera directly instead of simulating drags.
import type { Viewer } from 'cesium';

declare global {
  interface Window {
    viewer: Viewer;
  }
}

export {};
