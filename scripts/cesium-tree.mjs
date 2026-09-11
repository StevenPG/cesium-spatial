/**
 * Resolves a CesiumJS release to the dependency tree it shipped with.
 *
 * `cesium`, `@cesium/engine` and `@cesium/widgets` depend on each other through
 * caret ranges, so installing an old `cesium` today pairs it with whatever
 * split packages are newest inside those ranges — a combination no release
 * ever shipped. pin-cesium.mjs explains the failures that produces. This takes
 * each range the release declares, one level down as well, and pins it to its
 * floor, which is what shipped alongside.
 *
 * Shared by pin-cesium.mjs (pnpm overrides for the compatibility matrix) and
 * the consumer checks (npm overrides in their throwaway projects).
 */
import { execFileSync } from 'node:child_process';

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

/**
 * Exact versions for `cesium` and the tree it was released against, keyed by
 * package name. Empty for `latest`: the current release and its tree are
 * consistent by construction, and pinning anything there would only
 * manufacture a combination nobody ships.
 */
export function cesiumTree(version) {
  if (version === 'latest') return {};

  const pins = { cesium: version };

  const cesiumDeps = npmView(`cesium@${version}`, 'dependencies') ?? {};
  for (const [name, range] of Object.entries(cesiumDeps)) {
    if (!name.startsWith('@cesium/')) continue;
    const pinned = lowestSatisfying(name, range);
    if (pinned) pins[name] = pinned;
  }

  // One level further: the split packages' own dependencies drift too.
  for (const name of Object.keys(pins)) {
    if (name === 'cesium') continue;
    const deps = npmView(`${name}@${pins[name]}`, 'dependencies') ?? {};
    for (const [dep, range] of Object.entries(deps)) {
      if (pins[dep]) continue;
      const pinned = lowestSatisfying(dep, range);
      if (pinned) pins[dep] = pinned;
    }
  }

  return pins;
}
