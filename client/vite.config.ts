import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Proxy to wrangler dev server for local development
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Ensure assets go to assets/ subdirectory
    assetsDir: 'assets',
    // Generate manifest for Workers integration
    manifest: true,
  },
});
