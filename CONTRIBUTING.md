# Contributing

Thanks for taking an interest. Bug reports, questions and pull requests are all welcome.

## Getting set up

The repository is a pnpm workspace and expects Node 20 or newer.

```bash
pnpm install
pnpm verify
```

`pnpm verify` runs a formatting check, the linter, TypeScript across every package, the unit tests
and the package builds. If that passes locally, the main CI job should pass too.

Two further checks run in CI and are worth running before a release-shaped change: `pnpm check:pack`
inspects what would actually reach npm, and `pnpm check:consumer` installs the packed tarballs into
a throwaway project with plain npm and uses them through their public API.

CI runs all of this on your pull request. The consumer check is the one worth understanding: it
packs the tarballs, installs them with plain npm and bundles every example against the built
package, which is the only step that exercises what actually ships rather than the workspace.

To work on the demo, `pnpm dev` serves it at `http://localhost:5173/cesium-spatial/`. It resolves
the workspace packages through their sources rather than their build output, so changes to a library
show up without rebuilding anything.

## How the repository fits together

`packages/core` holds everything about drawing cells on a Cesium globe that does not depend on which
index produced them: the batched primitive and entity layers, picking, camera measurement and
level-of-detail. `packages/h3` and `packages/s2` are adapters onto that core, and each keeps its own
vocabulary rather than sharing an interface. `apps/demo` is the site published to GitHub Pages.

If you are adding behavior that both grids need, it belongs in core. If it only makes sense for one
index, it belongs in that package, even where the other has something roughly similar.

## Tests

Unit tests cover the geometry, cover and level-of-detail logic, none of which needs a WebGL context.
Anything that needs a camera, a pick or a real WebGL context lives in `e2e/` and runs through
Playwright against the built demo: `pnpm test:e2e`.

If a machine already has a Chromium that Playwright can use, point at it with `CHROMIUM_PATH` rather
than downloading another one.

Please add a test for any behavior you fix or add. The most valuable ones in this repository have
been the awkward cases rather than the happy paths: extents that wrap the antimeridian, cells at the
poles, H3's pentagons, and covers large enough to hit the cell budget.

## Examples

`examples/` is a workspace package that exists only to be typechecked. Adding a
worked example there is one of the more useful contributions, because each file
resolves the packages the way a consumer does — through their built declarations
rather than through workspace sources — so a broken example is a broken API.

## Changesets

Every change that affects a published package needs a changeset:

```bash
pnpm changeset
```

Pick the packages you touched and the bump type, then describe the change as a user of the package
would read it in a changelog. The three packages are versioned in lockstep. Changes confined to the
demo or to documentation do not need one.

You do not need to think about releasing beyond that. Changesets on `main` accumulate into a
`chore: version packages` pull request; a maintainer merges it to set the version and pushes a
matching `v*` tag when it should ship. The tag is what publishes.

## Style

Prettier and ESLint are configured; `pnpm format` and `pnpm lint:fix` will sort out most things.
Beyond that, the code favors comments that explain why something is the way it is over comments
that restate what the line does. Where a workaround exists because an underlying library behaves
surprisingly, say so and say what the surprise was.

## Pull requests

Keep pull requests focused on one thing. Describe what changed and why, and mention anything you
could not verify. If a change alters rendering, a screenshot helps more than a description.
