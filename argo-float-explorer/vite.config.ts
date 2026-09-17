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
  build: { outDir: 'dist', sourcemap: false },
  server: { port: 5173, open: true },
  preview: { port: 4173 },
});
