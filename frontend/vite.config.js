import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/',
  root: '.',
  publicDir: 'public',
  server: {
    port: 8080,
    strictPort: true,
    allowedHosts: [
      'elizian.in',
      'www.elizian.in'
    ]
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
