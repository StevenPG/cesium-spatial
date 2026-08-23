#!/usr/bin/env node
/**
 * Verifies what is actually on npm, as opposed to what a build produces.
 *
 * check-consumer.mjs packs the working tree and installs that. This one
 * installs the released packages from the public registry with nothing local
 * involved, which is the only way to catch a publish that went out wrong: a
 * file the tarball turned out not to contain, a half-finished release where
 * one package landed and two did not, provenance that silently stopped being
 * attached.
 *
 * Before the first release there is nothing to check, so a package the
 * registry does not know about is a skip rather than a failure. That keeps the
 * job green on a repository that has never published, and it starts doing real
 * work the moment a release exists.
 *
 * The program it compiles is deliberately small and deliberately frozen. It
 * only uses API that shipped in the first release, so it stays valid against
 * whatever version is live even while the working tree moves ahead of it.
 * Growing it to cover a newer export would make this job fail against the
 * previous release, which is the opposite of what it is for.
 *
 * Usage: node scripts/check-published.mjs [--tag latest]
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const NAMES = ['@stevenpg/cesium-spatial-core', '@stevenpg/cesium-h3', '@stevenpg/cesium-s2'];
const CESIUM = process.env.CESIUM_VERSION ?? '1.144.0';
const TYPESCRIPT = process.env.TYPESCRIPT_VERSION ?? '5';

const tagIndex = process.argv.indexOf('--tag');
const TAG =
  tagIndex === -1 ? (process.env.RELEASE_DIST_TAG ?? 'latest') : process.argv[tagIndex + 1];

const failures = [];
const fail = (message) => failures.push(message);

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });

/** `npm view`, returning undefined for a package or version the registry has never seen. */
function view(spec, field) {
  try {
    return execFileSync('npm', ['view', spec, field], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    if (output.includes('E404') || output.includes('404 Not Found')) return undefined;
    throw new Error(`registry lookup failed for ${spec}: ${output.trim().split('\n')[0]}`, {
      cause: error,
    });
  }
}

// --- Is there anything published to check? --------------------------------

const resolved = NAMES.map((name) => ({ name, version: view(`${name}@${TAG}`, 'version') }));
const missing = resolved.filter((p) => !p.version);

if (missing.length === NAMES.length) {
  console.log(`Nothing published under "${TAG}" yet. Skipping.`);
  console.log('This job starts verifying the real thing as soon as a release exists.');
  process.exit(0);
}

if (missing.length > 0) {
  console.error('Release is incomplete on the registry:');
  for (const p of missing) console.error(`  - ${p.name} has no "${TAG}" version`);
  for (const p of resolved.filter((p) => p.version))
    console.error(`  - ${p.name} is at ${p.version}`);
  process.exit(1);
}

// All three move in lockstep, so a disagreement means a publish stopped part
// of the way through and the registry is holding a mix of two releases.
const versions = [...new Set(resolved.map((p) => p.version))];
if (versions.length > 1) {
  console.error('Published versions disagree, which should be impossible for a lockstep release:');
  for (const p of resolved) console.error(`  - ${p.name}@${p.version}`);
  process.exit(1);
}

const version = versions[0];
console.log(`Checking ${version} as published under "${TAG}"\n`);

// --- Install it the way anyone else would ---------------------------------

const root = mkdtempSync(join(tmpdir(), 'published-'));
const project = join(root, 'project');
mkdirSync(join(project, 'src'), { recursive: true });

/** Frozen: uses only API from the first release. See the note at the top. */
const SMOKE = `
import { Rectangle } from 'cesium';
import { cellAt, neighbors, parent, cellToRing, coverRectangle } from '@stevenpg/cesium-h3';
import { cellAt as s2CellAt, neighbors as s2Neighbors, levelOf } from '@stevenpg/cesium-s2';
import { LevelSelector } from '@stevenpg/cesium-spatial-core';

const cell = cellAt(-122.4194, 37.7749, 9);
const s2Cell = s2CellAt(-122.4194, 37.7749, 13);
const cover = coverRectangle(Rectangle.fromDegrees(-1, -1, 1, 1), { resolution: 6, maxCells: 500 });

const failures = [];
if (neighbors(cell).length !== 6) failures.push('neighbors');
if (cellToRing(cell).length / 2 !== 6) failures.push('cellToRing');
if (parent(cell).length === 0) failures.push('parent');
if (levelOf(s2Cell) !== 13) failures.push('levelOf');
if (s2Neighbors(s2Cell).length !== 4) failures.push('s2 neighbors');
if (cover.cells.length < 1) failures.push('coverRectangle');
if (!(new LevelSelector([{ level: 0, edgeLengthMeters: 1 }]) instanceof LevelSelector)) {
  failures.push('core re-export');
}

if (failures.length > 0) throw new Error('published API is wrong: ' + failures.join(', '));

console.log('  runtime checks passed against ' + '${version}');
`;

try {
  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify({ name: 'published-check', private: true, type: 'module', version: '1.0.0' }),
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

  console.log(`Installing from the registry (cesium@${CESIUM}, typescript@${TYPESCRIPT})...`);
  run(
    'npm',
    [
      'install',
      '--no-audit',
      '--no-fund',
      `cesium@${CESIUM}`,
      `typescript@${TYPESCRIPT}`,
      'esbuild@0.24',
      ...NAMES.map((name) => `${name}@${version}`),
    ],
    project,
  );

  // --- What the tarball turned out to contain ------------------------------

  console.log('\nChecking what each published tarball actually contains...');
  for (const name of NAMES) {
    const installed = join(project, 'node_modules', ...name.split('/'));
    const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));

    // Plain paths only: `files` also accepts globs and negations, which say
    // nothing about a single path existing.
    for (const entry of manifest.files ?? []) {
      if (/[!*?[\]]/.test(entry)) continue;
      if (!existsSync(join(installed, entry)))
        fail(`${name} declares "${entry}" but did not ship it`);
    }

    // Every export target has to exist, which is the failure `files` and
    // `exports` disagreeing produces and typechecking never sees.
    for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
      const targets = typeof target === 'string' ? [target] : Object.values(target);
      for (const relative of targets) {
        if (typeof relative !== 'string') continue;
        if (!existsSync(join(installed, relative))) {
          fail(`${name} exports "${subpath}" pointing at ${relative}, which is not in the package`);
        }
      }
    }

    // Source maps that resolve to nothing are worse than no source maps: an
    // editor follows them and lands on a file that was never shipped.
    const dist = join(installed, 'dist');
    let dangling = 0;
    if (existsSync(dist)) {
      for (const file of execFileSync('ls', [dist], { encoding: 'utf8' }).split('\n')) {
        if (!file.endsWith('.map')) continue;
        const map = JSON.parse(readFileSync(join(dist, file), 'utf8'));
        const embedded = Array.isArray(map.sourcesContent) && map.sourcesContent.every(Boolean);
        if (embedded) continue;
        for (const source of map.sources ?? []) {
          if (!existsSync(resolve(dist, source))) dangling++;
        }
      }
    }
    if (dangling > 0)
      fail(`${name} ships ${dangling} source map reference(s) to files it did not publish`);

    const size = statSync(join(installed, 'package.json')).size;
    console.log(
      `  ok    ${name}@${manifest.version}  (${manifest.files?.length ?? 0} declared entries, manifest ${size} B)`,
    );
  }

  // --- Supply chain --------------------------------------------------------

  console.log('\nVerifying registry signatures...');
  process.stdout.write(run('npm', ['audit', 'signatures'], project));

  console.log('\nChecking provenance attestations...');
  for (const name of NAMES) {
    const attestations = view(`${name}@${version}`, 'dist.attestations');
    if (attestations) {
      console.log(`  ok    ${name} is published with provenance`);
    } else {
      fail(`${name}@${version} has no provenance attestation; the publish path degraded`);
    }
  }

  // --- Does it work? -------------------------------------------------------

  console.log('\nTypechecking against the published declarations...');
  process.stdout.write(`  ${run('npx', ['tsc', '--version'], project)}`);
  run('npx', ['tsc', '--noEmit'], project);

  console.log('Running the published ESM output under Node...');
  process.stdout.write(run('node', ['src/smoke.mjs'], project));

  console.log('Bundling against the published package...');
  const outfile = join(project, 'out', 'smoke.js');
  mkdirSync(dirname(outfile), { recursive: true });
  run(
    'npx',
    [
      'esbuild',
      'src/smoke.ts',
      '--bundle',
      '--format=esm',
      '--platform=browser',
      '--external:cesium',
      '--log-level=warning',
      `--outfile=${outfile}`,
    ],
    project,
  );
  console.log(`  bundled  (${(statSync(outfile).size / 1024).toFixed(0)} kB)`);

  if (failures.length > 0) {
    console.error('\nPublished package check failed:');
    for (const message of failures) console.error(`  - ${message}`);
    process.exit(1);
  }

  console.log(`\nPublished check passed for ${version}.`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
