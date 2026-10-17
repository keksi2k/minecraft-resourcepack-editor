/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
  server: { proxy: mcresProxy },
  preview: { proxy: mcresProxy },
  test: { environment: 'node' },
});
