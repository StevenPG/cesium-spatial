#!/usr/bin/env node
/**
 * Everything that has to be true before a tag turns into an npm release.
 *
 * The tag is the trigger, so the tag is also the thing most likely to be
 * wrong: pushed against the wrong commit, pushed before the version pull
 * request merged, or re-pushed for a version that already went out. npm's own
 * errors for those arrive late and half-published — the first package
 * succeeds, the second fails on 403, and the release is stuck between two
 * versions with no clean way back. Every check here runs before anything is
 * published.
 *
 * Usage: node scripts/check-release.mjs [vX.Y.Z]
 * Defaults to GITHUB_REF_NAME, which is the tag name in a tag-triggered run.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES = ['packages/core', 'packages/h3', 'packages/s2'];
const TAG_PATTERN = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$/;

const failures = [];
const fail = (message) => failures.push(message);

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
if (!tag) {
  console.error('No tag given. Pass one as an argument or set GITHUB_REF_NAME.');
  process.exit(1);
}

const match = TAG_PATTERN.exec(tag);
if (!match) {
  console.error(
    `Tag "${tag}" is not a release tag. Expected vX.Y.Z, optionally with a prerelease.`,
  );
  process.exit(1);
}
const version = match[1];
console.log(`Releasing ${version} from tag ${tag}\n`);

// --- The tag has to agree with the tree it points at -----------------------

// All three packages move in lockstep (see the `fixed` group in
// .changeset/config.json), so one mismatch means the tag was pushed against
// the wrong commit.
for (const dir of PACKAGES) {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  if (manifest.version === version) {
    console.log(`  ok    ${manifest.name} is at ${version}`);
  } else {
    fail(`${manifest.name} is at ${manifest.version}, but the tag says ${version}`);
  }
}

// --- Nothing may still be waiting to be versioned --------------------------

// A leftover changeset means the version pull request was never merged, so
// this version's changelog entry does not exist yet. Publishing anyway ships
// a release nobody can read the notes for.
const pending = existsSync('.changeset')
  ? readdirSync('.changeset').filter((f) => f.endsWith('.md') && f !== 'README.md')
  : [];
if (pending.length > 0) {
  fail(
    `${pending.length} changeset(s) not yet applied (${pending.join(', ')}). ` +
      'Merge the version pull request before tagging.',
  );
} else {
  console.log('  ok    no unapplied changesets');
}

// --- The version must not already be on the registry -----------------------

// npm refuses to overwrite a published version, and it refuses one package at
// a time. Finding out here keeps a partial release from happening at all.
for (const dir of PACKAGES) {
  const { name } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  let published;
  try {
    published = execFileSync('npm', ['view', `${name}@${version}`, 'version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    // A 404 is the good case: the version does not exist yet. Anything else
    // is a registry or network problem, and guessing past it risks the
    // half-published state this script exists to prevent.
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    if (output.includes('E404') || output.includes('404 Not Found')) {
      console.log(`  ok    ${name}@${version} is not published yet`);
      continue;
    }
    fail(`could not reach the registry for ${name}: ${output.trim().split('\n')[0]}`);
    continue;
  }
  if (published) fail(`${name}@${version} is already published; releases are immutable`);
}

if (failures.length > 0) {
  console.error('\nRelease check failed:');
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log('\nRelease check passed.');
