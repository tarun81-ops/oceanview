import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Deployment base path.
 * Local dev and root-domain hosts (Vercel, Netlify) use "/".
 * GitHub Pages serves from /<repo>/, so CI sets VITE_BASE_PATH=/<repo>/.
 */
const base = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    // three.js alone is ~850 kB minified (~230 kB gzipped) and is already split
    // into its own cached chunk, so the default 500 kB warning is not actionable.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        /**
         * three.js and React are an order of magnitude larger than app code and
         * change far less often, so they get their own long-lived chunks instead
         * of one oversized bundle.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@react-three') || id.includes('three-stdlib') || id.includes('/three/')) {
            return 'three';
          }
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) {
            return 'react';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: true, // listen on 0.0.0.0 so a sandbox/container preview can reach it
    port: 5173,
    strictPort: true,
    allowedHosts: true, // the dev server is proxied through a host we don't control
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
});
