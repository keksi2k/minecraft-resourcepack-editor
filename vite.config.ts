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
  server: { proxy: mcresProxy },
  preview: { proxy: mcresProxy },
  test: { environment: 'node' },
});
