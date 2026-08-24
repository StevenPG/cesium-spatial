import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    // Cesium is a peer dependency: never inline it, or consumers end up with
    // two copies of the engine and instanceof checks start failing.
    rollupOptions: { external: [/^cesium$/, /^@cesium\/.*/] },
    sourcemap: true,
    target: 'es2020',
    minify: false,
  },
  plugins: [dts({ include: ['src'], entryRoot: 'src' })],
});
