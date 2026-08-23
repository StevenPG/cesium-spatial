#!/usr/bin/env node
/**
 * Creates and pushes the release tag for whatever version is currently on the
 * branch, so the number never has to be typed twice.
 *
 * Pushing the tag is what triggers the release workflow; nothing is published
 * from a developer machine. The checks here are the ones that catch a tag
 * pointing somewhere unintended, which is unpleasant to undo once the workflow
 * has already run against it.
 *
 * Usage: pnpm release:tag [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const dryRun = process.argv.includes('--dry-run');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const { version } = JSON.parse(readFileSync('packages/core/package.json', 'utf8'));
const tag = `v${version}`;

const problems = [];

if (git('status', '--porcelain')) problems.push('working tree has uncommitted changes');

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'main') problems.push(`on branch ${branch}, expected main`);

try {
  execFileSync('git', ['fetch', 'origin', 'main', '--tags'], { stdio: 'ignore' });
  if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main')) {
    problems.push('HEAD does not match origin/main; push or pull first');
  }
} catch {
  problems.push('could not reach origin to compare against main');
}

const existing = git('tag', '--list', tag);
if (existing) problems.push(`tag ${tag} already exists; versions are released once`);

if (problems.length > 0) {
  console.error(`Cannot tag ${tag}:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

// The same gate the workflow runs, so a mismatch surfaces here rather than as
// a failed release run.
execFileSync('node', ['scripts/check-release.mjs', tag], { stdio: 'inherit' });

if (dryRun) {
  console.log(`\nDry run: would create and push ${tag} at ${git('rev-parse', '--short', 'HEAD')}.`);
  process.exit(0);
}

execFileSync('git', ['tag', '-a', tag, '-m', `Release ${version}`], { stdio: 'inherit' });
execFileSync('git', ['push', 'origin', tag], { stdio: 'inherit' });

console.log(`\nPushed ${tag}. Watch the release run for the publish.`);
