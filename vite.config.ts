import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    crx({ manifest }),
  ],
  build: {
    // Produce readable output for an "open source" product
    minify: false,
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        // Keep content scripts as separate files — CRXJS handles this,
        // but we also enforce it explicitly to avoid accidental bundling.
        manualChunks: undefined,
      },
    },
  },
  resolve: {
    alias: {
      '@lib': '/src/lib',
    },
  },
  // Vitest config (co-located for simplicity)
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
