#!/usr/bin/env node
/**
 * Collects the changelog entries for one version into GitHub Release notes.
 *
 * Changesets writes a per-package CHANGELOG.md, which is the right place for
 * them to live but the wrong shape for a release page: three files, each
 * opening with a heading for the package and then a section per version. This
 * pulls out just the requested version from each and stacks them under one
 * heading per package, skipping packages that only moved because a sibling
 * did.
 *
 * Usage: node scripts/release-notes.mjs <version>
 * Writes to stdout.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES = ['packages/core', 'packages/h3', 'packages/s2'];

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/release-notes.mjs <version>');
  process.exit(1);
}

/** The body of the `## <version>` section, or undefined if there is none. */
function sectionFor(changelog, wanted) {
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${wanted}`);
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

const sections = [];
for (const dir of PACKAGES) {
  const { name } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const path = join(dir, 'CHANGELOG.md');
  if (!existsSync(path)) continue;

  const body = sectionFor(readFileSync(path, 'utf8'), version);
  if (!body) continue;

  // Lockstep versioning drags every package to the same number, so a package
  // with nothing but the dependency bump has no news in it.
  const onlyDependencyBump = body
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('#'))
    .every((line) => /^\s*-\s*(Updated dependencies|@stevenpg\/)/.test(line));
  if (onlyDependencyBump) continue;

  sections.push(`## ${name}\n\n${body}`);
}

if (sections.length === 0) {
  sections.push('No changelog entries recorded for this version.');
}

console.log(
  [
    sections.join('\n\n'),
    '',
    '---',
    '',
    `Published to npm with provenance. See the [API reference](https://stevenpg.github.io/cesium-spatial/api/) and the [live demo](https://stevenpg.github.io/cesium-spatial/demo.html).`,
  ].join('\n'),
);
