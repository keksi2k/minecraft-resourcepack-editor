/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// resources.download.minecraft.net (vanilla sounds + sounds.json) sends no CORS headers,
// so dev/preview route it through a local proxy at /mcres.
const mcresProxy = {
  '/mcres': {
    target: 'https://resources.download.minecraft.net',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/mcres/, ''),
  },
};

export default defineConfig({
  plugins: [react()],
  // the running version and where its releases live, for the update check
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_REPO__: JSON.stringify(pkg.repository.url.replace(/\.git$/, '')),
  },
  build: {
    // three.js and the mob models rarely change: their own files stay cached across releases
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('entityModels.json')) return 'entity-models';
          if (/node_modules[\/](three|@react-three)[\/]/.test(id)) return 'three';
          return undefined;
        },
      },
    },
  },
  // the PNG optimiser finds its WebAssembly next to its own module, so it must not be pre-bundled;
  // the worker that runs it loads the codec on demand, which needs module workers
  optimizeDeps: { exclude: ['@jsquash/oxipng'] },
  worker: { format: 'es' },
  server: { proxy: mcresProxy },
  preview: { proxy: mcresProxy },
  // e2e/ holds the Playwright tests, which run in a browser instead
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
