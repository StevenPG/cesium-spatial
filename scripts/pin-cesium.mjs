#!/usr/bin/env node
/**
 * Pins a CesiumJS version for the compatibility matrix, along with the
 * dependency tree that version was released against.
 *
 * Pinning `cesium` alone is not enough, and the reason is worth writing down.
 * CesiumJS is split across `cesium`, `@cesium/engine` and `@cesium/widgets`,
 * and they depend on each other through caret ranges. Installing an old
 * `cesium` today re-resolves those ranges to whatever is newest inside them,
 * so `cesium@1.110.0` arrives paired with `@cesium/widgets@4.5.0`, which wants
 * `@cesium/engine@7`, while `cesium` itself wants `@cesium/engine@5`. The
 * result is an install no released version of CesiumJS ever shipped.
 *
 * The same drift reaches one level further down. `@cesium/engine@10` asks for
 * `@zip.js/zip.js@^2.7.34`, and 2.8 dropped a subpath from its `exports`, so
 * importing anything from `cesium` dies inside KmlDataSource — code this
 * library never touches, loaded only because the `cesium` entry point re-
 * exports everything.
 *
 * So: take each range the release declares and pin it to the lowest version
 * that satisfies it, which is what shipped alongside. That reconstructs a
 * coherent install and makes the matrix a test of this library against
 * CesiumJS, rather than a test of whether a years-old dependency tree can
 * still be resolved from scratch.
 *
 * Usage: node scripts/pin-cesium.mjs <version|latest>
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const requested = process.argv[2];
if (!requested) {
  console.error('Usage: node scripts/pin-cesium.mjs <version|latest>');
  process.exit(1);
}

const npmView = (spec, field) => {
  try {
    const out = execFileSync('npm', ['view', spec, field, '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return out ? JSON.parse(out) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The lowest version satisfying a range. Cesium's manifests use carets and
 * tilde ranges almost exclusively, where the answer is just the floor; the
 * registry lookup is the fallback for anything else.
 */
function lowestSatisfying(name, range) {
  const simple = /^[~^]?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(range);
  if (simple) return simple[1];

  const wildcard = /^(\d+)\.(\d+)\.[xX*]$/.exec(range);
  if (wildcard) {
    const versions = npmView(name, 'versions') ?? [];
    const prefix = `${wildcard[1]}.${wildcard[2]}.`;
    const match = versions.find((v) => v.startsWith(prefix) && !v.includes('-'));
    if (match) return match;
  }

  const atLeast = /^>=\s*(\d+\.\d+\.\d+)$/.exec(range);
  if (atLeast) return atLeast[1];

  return undefined;
}

const overrides = {};

if (requested === 'latest') {
  // The current release and its tree are consistent by construction; pinning
  // anything here would only manufacture a combination nobody ships.
  console.log('Testing the current release with no pins.');
} else {
  overrides.cesium = requested;

  const cesiumDeps = npmView(`cesium@${requested}`, 'dependencies') ?? {};
  for (const [name, range] of Object.entries(cesiumDeps)) {
    if (!name.startsWith('@cesium/')) continue;
    const pinned = lowestSatisfying(name, range);
    if (pinned) overrides[name] = pinned;
  }

  // One level further: the split packages' own dependencies drift too.
  for (const name of Object.keys(overrides)) {
    if (name === 'cesium') continue;
    const deps = npmView(`${name}@${overrides[name]}`, 'dependencies') ?? {};
    for (const [dep, range] of Object.entries(deps)) {
      if (overrides[dep]) continue;
      const pinned = lowestSatisfying(dep, range);
      if (pinned) overrides[dep] = pinned;
    }
  }
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
manifest.pnpm = { ...manifest.pnpm, overrides: { ...manifest.pnpm?.overrides, ...overrides } };
writeFileSync('package.json', `${JSON.stringify(manifest, null, 2)}\n`);

for (const [name, version] of Object.entries(overrides)) console.log(`  ${name} -> ${version}`);
console.log(`\nPinned ${Object.keys(overrides).length} package(s).`);
