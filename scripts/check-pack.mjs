#!/usr/bin/env node
/**
 * Packs every publishable package and inspects what would actually reach npm.
 *
 * The check that matters: pnpm rewrites `workspace:^` into a real semver range
 * when it packs, and npm does not. A tarball built by the wrong tool installs
 * nowhere — npm rejects it with EUNSUPPORTEDPROTOCOL — and nothing else in the
 * pipeline notices. This makes that failure loud and local.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PACKAGES = ['packages/core', 'packages/h3', 'packages/s2'];
const problems = [];

for (const dir of PACKAGES) {
  const out = mkdtempSync(join(tmpdir(), 'pack-'));
  try {
    execFileSync('pnpm', ['pack', '--pack-destination', out], { cwd: dir, stdio: 'pipe' });
    const tarball = join(
      out,
      readdirSync(out).find((f) => f.endsWith('.tgz')),
    );

    const manifest = JSON.parse(
      execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], { encoding: 'utf8' }),
    );

    const ranges = Object.entries({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
      ...manifest.optionalDependencies,
    });

    for (const [name, range] of ranges) {
      if (typeof range === 'string' && range.startsWith('workspace:')) {
        problems.push(`${manifest.name}: dependency "${name}" would publish as "${range}"`);
      }
    }

    const files = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).split('\n');
    for (const required of ['package/README.md', 'package/LICENSE', 'package/dist/index.js']) {
      if (!files.includes(required)) problems.push(`${manifest.name}: missing ${required}`);
    }
    if (!manifest.types && !manifest.exports?.['.']?.types) {
      problems.push(`${manifest.name}: publishes no type entry point`);
    }

    console.log(
      `  ok  ${manifest.name}  (${ranges.length} declared ranges, ${files.length} files)`,
    );
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

if (problems.length > 0) {
  console.error('\nPack check failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('\nPack check passed.');
