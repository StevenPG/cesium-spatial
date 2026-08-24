import { defineConfig, devices } from '@playwright/test';

/**
 * Drives the demo in a real browser, which is the only place the rendering
 * paths are exercised: batched primitives, picking, and the geometry cases that
 * unit tests cannot reach without a WebGL context.
 *
 * SwiftShader stands in for a GPU. It is slow but deterministic, which matters
 * more than speed for a regression net.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173/cesium-spatial/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        launchOptions: {
          // Software rendering: CI runners have no GPU.
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--no-sandbox',
          ],
          // Lets a sandbox or image with a pre-installed browser point at it
          // instead of running `playwright install`. CI leaves this unset.
          ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
        },
      },
    },
  ],
  webServer: {
    command: 'pnpm --filter @cesium-spatial/demo preview --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173/cesium-spatial/demo.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
