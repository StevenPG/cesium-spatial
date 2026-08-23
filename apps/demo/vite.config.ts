import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'node:path';

const cesiumBuild = 'node_modules/cesium/Build/Cesium';

// Served from a project page on GitHub Pages, so everything is under a subpath.
const base = process.env.DEMO_BASE ?? '/cesium-spatial/';

export default defineConfig({
  base,
  resolve: {
    // Point at package sources rather than their dist output. The demo then
    // always exercises current code, and cannot silently run a stale build.
    alias: {
      '@stevenpg/cesium-spatial-core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@stevenpg/cesium-h3': resolve(__dirname, '../../packages/h3/src/index.ts'),
      '@stevenpg/cesium-s2': resolve(__dirname, '../../packages/s2/src/index.ts'),
    },
  },
  define: {
    // Cesium loads its workers and assets at runtime rather than through the
    // bundler, so it needs to know where they were copied to.
    CESIUM_BASE_URL: JSON.stringify(`${base}cesium/`),
  },
  plugins: [
    viteStaticCopy({
      targets: ['Workers', 'ThirdParty', 'Assets', 'Widgets'].map((dir) => ({
        src: `${cesiumBuild}/${dir}`,
        dest: 'cesium',
      })),
    }),
  ],
  build: {
    // The whole GitHub Pages tree is assembled here. The API reference is not
    // written here directly: TypeDoc puts it in public/api, which Vite serves
    // in development and copies on build, so it survives this directory being
    // cleared and is reachable at the same URL either way.
    outDir: resolve(__dirname, '../../docs-dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        demo: resolve(__dirname, 'demo.html'),
      },
    },
  },
});
