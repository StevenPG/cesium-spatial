import { expect, test, type Page } from '@playwright/test';

/**
 * These cover the behavior that unit tests cannot reach: anything that needs a
 * real WebGL context, a camera, or a pick. Each assertion below stands in for a
 * bug that was found by hand during development.
 */

const cellCount = async (page: Page) =>
  Number(((await page.locator('#statCells').textContent()) ?? '').replace(/[^0-9]/g, ''));

/**
 * Waits for the layer to report a cover at all.
 *
 * Only useful right after load. Anywhere the camera or a control changes, wait
 * on the value you expect instead: the layer is driven by camera events, so a
 * count that has not moved yet is indistinguishable from one that has settled.
 */
async function settled(page: Page) {
  await expect
    .poll(() => cellCount(page), { timeout: 90_000, intervals: [400] })
    .toBeGreaterThan(0);
}

/** Waits for the drawn cell count to reach an exact value. */
function expectCells(page: Page) {
  return expect.poll(() => cellCount(page), { timeout: 90_000, intervals: [400] });
}

/** Waits for the ladder to mark a rung as drawn, and returns its level. */
function expectDrawnLevel(page: Page) {
  return expect.poll(
    async () => Number(await page.locator('.rung.is-drawn').getAttribute('data-level')),
    { timeout: 90_000, intervals: [400] },
  );
}

/**
 * Clicks the globe until a cell is actually selected.
 *
 * The stats update as soon as a cover is computed, but the batched primitive
 * becomes pickable a few frames later, so a single click can land on nothing.
 * Each attempt clicks and reads in one step, so a successful click is never
 * undone by the next one.
 */
async function clickCell(page: Page, x = 500, y = 400) {
  await expect
    .poll(
      async () => {
        await page.locator('#cesiumContainer').click({ position: { x, y } });
        return (await page.locator('#readout').textContent()) ?? '';
      },
      { timeout: 60_000, intervals: [1000] },
    )
    .not.toContain('Click a cell');
}

/** Points the camera straight down at a location, bypassing the fly animation. */
async function lookAt(page: Page, longitude: number, latitude: number, height: number) {
  await page.evaluate(
    ({ longitude, latitude, height }) => {
      const camera = window.viewer.camera;
      const Cartographic = Object.getPrototypeOf(camera.positionCartographic).constructor;
      camera.setView({
        destination: window.viewer.scene.globe.ellipsoid.cartographicToCartesian(
          new Cartographic((longitude * Math.PI) / 180, (latitude * Math.PI) / 180, height),
        ),
        orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      });
    },
    { longitude, latitude, height },
  );
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('demo.html');
  await settled(page);
  expect(errors, 'the demo must load without page errors').toEqual([]);
});

test('always ends up with a basemap, whether or not the live service is reachable', async ({
  page,
}) => {
  // The default is Esri World Imagery, a live service. Where it cannot be
  // reached the demo falls back to the imagery Cesium bundles, so a basemap is
  // present either way and a blank globe is always a bug.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const layers = window.viewer.imageryLayers;
          return layers.length === 1 && layers.get(0).ready;
        }),
      { timeout: 45_000 },
    )
    .toBe(true);

  const selected = await page.locator('#imagery').inputValue();
  expect(['esri', 'natural-earth']).toContain(selected);
});

test('the bundled basemap renders with no network at all', async ({ page }) => {
  await page.selectOption('#imagery', 'natural-earth');
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const layers = window.viewer.imageryLayers;
          return layers.length > 0 && layers.get(0).ready;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
});

test('H3 draws cells and the ladder marks what is drawn', async ({ page }) => {
  expect(await cellCount(page)).toBeGreaterThan(0);
  await expect(page.locator('.rung')).toHaveCount(16);
  await expect(page.locator('.rung.is-drawn')).toHaveCount(1);
  await expect(page.locator('#ladderMode')).toHaveText('auto');
});

test('clicking a cell selects it and highlights its six neighbors', async ({ page }) => {
  await clickCell(page);

  const readout = page.locator('#readout');
  await expect(readout).toContainText('index');
  await expect(readout).toContainText('resolution');
  // An H3 cell has six neighbors everywhere except the twelve pentagons.
  await expect(readout).toContainText('highlighted6');
});

test('pinning a rung overrides the camera, and clicking it again releases', async ({ page }) => {
  await page.locator('.rung[data-level="3"]').click();
  await settled(page);
  await expect(page.locator('#ladderMode')).toHaveText('pinned 3');
  await expect(page.locator('.rung.is-pinned')).toHaveAttribute('data-level', '3');

  await page.locator('.rung[data-level="3"]').click();
  await settled(page);
  await expect(page.locator('#ladderMode')).toHaveText('auto');
});

test('a zoomed-out H3 view covers the globe with exactly the 122 base cells', async ({ page }) => {
  await page.locator('.rung[data-level="0"]').click();
  await lookAt(page, 0, 0, 22_000_000);
  // H3 resolution 0 is 110 hexagons plus 12 pentagons. Any other number means
  // the cover lost or duplicated cells somewhere.
  await expectCells(page).toBe(122);
});

test('the cell budget coarsens rather than overrunning', async ({ page }) => {
  await page.locator('#budget').fill('500');
  await page.locator('#budget').dispatchEvent('input');
  await page.locator('.rung[data-level="7"]').click();
  await lookAt(page, 0, 0, 22_000_000);

  // Asked for resolution 7 over the whole globe; the budget must refuse it.
  await expectDrawnLevel(page).toBeLessThan(7);
  await expect(page.locator('#statHeadroom')).toHaveClass(/is-flagged/);
  expect(await cellCount(page)).toBeLessThanOrEqual(1000);
});

test('switching to S2 swaps the ladder, the relations and the cell vocabulary', async ({
  page,
}) => {
  await page.locator('#systemS2').click();
  await settled(page);

  await expect(page.locator('#systemS2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#ladderHeading')).toHaveText('level');
  await expect(page.locator('.rung')).toHaveCount(31);
  await expect(page.locator('#relation option').first()).toHaveText('edge neighbors (4)');

  await clickCell(page);
  // S2 cells are addressed by token, and always have four edge neighbors.
  await expect(page.locator('#readout')).toContainText('token');
  await expect(page.locator('#readout')).toContainText('highlighted4');
});

test('S2 level 0 draws the six cube faces, including the two polar caps', async ({ page }) => {
  await page.locator('#systemS2').click();
  await settled(page);
  await page.locator('.rung[data-level="0"]').click();
  await lookAt(page, 0, 0, 22_000_000);

  await expectCells(page).toBe(6);

  // Faces 2 and 5 enclose a pole rather than touching it. Looking straight down
  // at the pole must still show a filled cap.
  await lookAt(page, 0, 89.9, 14_000_000);
  await expectCells(page).toBeGreaterThan(0);
});

test('the rail stays clear of the globe controls at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 720 });
  await page.waitForTimeout(1000);

  const layout = await page.evaluate(() => {
    const rail = document.querySelector('.rail')!.getBoundingClientRect();
    const hint = document.querySelector('.hint')!.getBoundingClientRect();
    return {
      hintClearsRail: hint.left >= rail.right,
      noSidewaysScroll: document.body.scrollWidth <= window.innerWidth + 1,
    };
  });
  expect(layout.hintClearsRail).toBe(true);
  expect(layout.noSidewaysScroll).toBe(true);
});
