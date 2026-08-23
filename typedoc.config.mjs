/**
 * Output goes into the demo's public directory rather than straight into the
 * built site. Vite serves that directory in development and copies it on
 * build, so the API reference exists at the same URL either way — and the
 * build order stops mattering.
 *
 * TypeDoc emits navigation links verbatim at every page depth, so they have to
 * be rooted at the site base rather than relative — otherwise they 404 from
 * anything below api/. The base is read from the same variable the demo's Vite
 * config uses, so the two cannot drift apart.
 */
const base = process.env.DEMO_BASE ?? '/cesium-spatial/';

/** @type {import('typedoc').TypeDocOptions} */
export default {
  entryPointStrategy: 'packages',
  entryPoints: ['packages/core', 'packages/h3', 'packages/s2'],
  out: 'apps/demo/public/api',
  name: 'cesium-spatial',
  readme: 'README.md',
  excludePrivate: true,
  excludeInternal: true,
  includeVersion: false,
  customCss: './typedoc.css',
  titleLink: base,
  navigationLinks: {
    Overview: base,
    Demo: `${base}demo.html`,
    GitHub: 'https://github.com/StevenPG/cesium-spatial',
  },
  sortEntryPoints: false,
  categorizeByGroup: true,
  githubPages: true,
  darkHighlightTheme: 'github-dark',
  lightHighlightTheme: 'github-light',
  customFooterHtml: 'cesium-spatial &middot; Apache-2.0',
  navigation: { includeCategories: true, includeGroups: true },
  externalSymbolLinkMappings: {
    cesium: { '*': 'https://cesium.com/learn/cesiumjs/ref-doc/' },
  },
};
