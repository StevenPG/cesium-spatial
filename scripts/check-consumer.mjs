#!/usr/bin/env node
/**
 * Uses the packages the way a consumer does, end to end.
 *
 * Everything else in the pipeline tests the workspace, where the packages
 * resolve through pnpm links: the demo's bundler is aliased straight at
 * `src/index.ts`, and the examples are only typechecked. Neither of those
 * touches what actually ships.
 *
 * This one packs the real tarballs, installs them into a throwaway project
 * with plain npm, and then proves four separate things about the published
 * artifact:
 *
 *   1. the declarations typecheck under a consumer's own tsconfig
 *   2. the ESM output executes under Node
 *   3. every example in examples/ bundles against the built package
 *   4. tree-shaking still drops what a narrow import does not use
 *
 * Step three is the one that catches a broken `exports` map or a file missing
 * from `files`: those pass typecheck and only fail when a bundler tries to
 * resolve the runtime entry.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cesiumTree } from './cesium-tree.mjs';

const PACKAGES = ['packages/core', 'packages/h3', 'packages/s2'];
const CESIUM = process.env.CESIUM_VERSION ?? '1.144.0';
// The declarations are checked across a range of these in CI; 5.0 is the
// oldest that understands `moduleResolution: Bundler`, which the consumer
// tsconfig below uses.
const TYPESCRIPT = process.env.TYPESCRIPT_VERSION ?? '5';
// `cesium` alone would pull in the newest `@cesium/engine` inside its range, which
// need not be one it works with; see cesium-tree.mjs. `cesium` is left out of
// the overrides because npm rejects one for a direct dependency.
const { cesium: _, ...CESIUM_OVERRIDES } = cesiumTree(CESIUM);

const root = mkdtempSync(join(tmpdir(), 'consumer-'));
const tarballDir = join(root, 'tarballs');
const project = join(root, 'project');
mkdirSync(tarballDir);
mkdirSync(join(project, 'src'), { recursive: true });

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });

/** A program using only the public API, mirroring the README. */
const SMOKE = `
import { Color, Rectangle } from 'cesium';
import { cellAt, disk, neighbors, parent, cellToRing, coverRectangle } from '@stevenpg/cesium-h3';
import { cellAt as s2CellAt, neighbors as s2Neighbors, levelOf } from '@stevenpg/cesium-s2';
import { LevelSelector } from '@stevenpg/cesium-spatial-core';

const origin = cellAt(-122.4194, 37.7749, 9);
const s2Cell = s2CellAt(-122.4194, 37.7749, 13);
const cover = coverRectangle(Rectangle.fromDegrees(-1, -1, 1, 1), { resolution: 6, maxCells: 500 });

const checks = {
  h3Neighbors: neighbors(origin).length,
  h3Disk: disk(origin, 2).length,
  h3RingPoints: cellToRing(origin).length / 2,
  h3HasParent: parent(origin).length > 0,
  s2Level: levelOf(s2Cell),
  s2Neighbors: s2Neighbors(s2Cell).length,
  coverCells: cover.cells.length,
  // Reaching a core export through the grid package's re-export.
  selectorConstructs: new LevelSelector([{ level: 0, edgeLengthMeters: 1 }]) instanceof LevelSelector,
  colorAvailable: Color.CYAN !== undefined,
};

// Written verbatim as both .ts and .mjs, so this has to be valid JavaScript
// that also passes a strict typecheck: no annotations, no dynamic indexing.
const failures = [];
if (checks.h3Neighbors !== 6) failures.push('h3Neighbors=' + checks.h3Neighbors);
if (checks.h3Disk !== 19) failures.push('h3Disk=' + checks.h3Disk);
if (checks.h3RingPoints !== 6) failures.push('h3RingPoints=' + checks.h3RingPoints);
if (!checks.h3HasParent) failures.push('parent returned nothing');
if (checks.s2Level !== 13) failures.push('s2Level=' + checks.s2Level);
if (checks.s2Neighbors !== 4) failures.push('s2Neighbors=' + checks.s2Neighbors);
if (!checks.selectorConstructs) failures.push('core re-export is not constructible');
if (!checks.colorAvailable) failures.push('cesium peer not resolved');
if (checks.coverCells < 1) failures.push('cover produced no cells');

if (failures.length > 0) throw new Error(failures.join('; '));

console.log('  runtime checks passed', JSON.stringify(checks));
`;

try {
  console.log('Packing...');
  for (const dir of PACKAGES) run('pnpm', ['pack', '--pack-destination', tarballDir], dir);
  const tarballs = readdirSync(tarballDir).map((f) => join(tarballDir, f));

  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify({
      name: 'consumer-check',
      private: true,
      type: 'module',
      version: '1.0.0',
      overrides: CESIUM_OVERRIDES,
    }),
  );
  writeFileSync(
    join(project, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      },
      include: ['src'],
    }),
  );

  writeFileSync(join(project, 'src', 'smoke.ts'), SMOKE);
  writeFileSync(join(project, 'src', 'smoke.mjs'), SMOKE);

  // The real examples, compiled and bundled as a consumer's app would.
  cpSync('examples/src', join(project, 'src', 'examples'), { recursive: true });
  const examples = readdirSync(join(project, 'src', 'examples')).filter((f) => f.endsWith('.ts'));

  console.log(`Installing with npm (cesium@${CESIUM}, typescript@${TYPESCRIPT})...`);
  run(
    'npm',
    [
      'install',
      '--no-audit',
      '--no-fund',
      `cesium@${CESIUM}`,
      `typescript@${TYPESCRIPT}`,
      'esbuild@0.24',
      ...tarballs,
    ],
    project,
  );

  console.log('Typechecking the published declarations, including every example...');
  process.stdout.write(`  ${run('npx', ['tsc', '--version'], project)}`);
  run('npx', ['tsc', '--noEmit'], project);

  console.log('Running the built ESM output under Node...');
  process.stdout.write(run('node', ['src/smoke.mjs'], project));

  console.log(`Bundling ${examples.length} examples against the built package...`);
  for (const example of examples) {
    const outfile = join(project, 'out', example.replace(/\.ts$/, '.js'));
    // Cesium stays external, as it would in a real app that provides its own.
    // Our packages are deliberately NOT external: the point is to make the
    // bundler resolve and inline what actually shipped.
    run(
      'npx',
      [
        'esbuild',
        join('src', 'examples', example),
        '--bundle',
        '--format=esm',
        '--platform=browser',
        '--external:cesium',
        '--log-level=warning',
        `--outfile=${outfile}`,
      ],
      project,
    );
    console.log(`  bundled  ${example}  (${(statSync(outfile).size / 1024).toFixed(0)} kB)`);
  }

  console.log('Checking a narrow import still tree-shakes...');
  writeFileSync(
    join(project, 'src', 'narrow.ts'),
    "import { cellAt } from '@stevenpg/cesium-h3';\nconsole.log(cellAt(0, 0, 9));\n",
  );
  const narrow = join(project, 'out', 'narrow.js');
  const wide = join(project, 'out', 'wide.js');
  writeFileSync(
    join(project, 'src', 'wide.ts'),
    "import * as h3 from '@stevenpg/cesium-h3';\nconsole.log(Object.keys(h3).length);\n",
  );
  for (const [entry, outfile] of [
    ['src/narrow.ts', narrow],
    ['src/wide.ts', wide],
  ]) {
    run(
      'npx',
      [
        'esbuild',
        entry,
        '--bundle',
        '--format=esm',
        '--minify',
        '--external:cesium',
        '--log-level=warning',
        `--outfile=${outfile}`,
      ],
      project,
    );
  }
  const narrowSize = statSync(narrow).size;
  const wideSize = statSync(wide).size;
  console.log(
    `  one function ${(narrowSize / 1024).toFixed(0)} kB vs everything ${(wideSize / 1024).toFixed(0)} kB`,
  );
  if (narrowSize >= wideSize) {
    throw new Error('a single-function import bundles no smaller than the whole package');
  }

  console.log('\nConsumer check passed.');
} finally {
  rmSync(root, { recursive: true, force: true });
}
