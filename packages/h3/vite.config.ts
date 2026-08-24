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
    // Cesium stays external as a peer dependency; core and h3-js are declared
    // dependencies and are resolved by the consumer's bundler, not inlined.
    rollupOptions: {
      external: [/^cesium$/, /^@cesium\/.*/, /^h3-js$/, /^@stevenpg\//],
    },
    sourcemap: true,
    target: 'es2020',
    minify: false,
  },
  plugins: [dts({ include: ['src'], entryRoot: 'src' })],
});
