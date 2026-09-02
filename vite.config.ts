import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    host: '::'
  },
  build: {
    outDir: 'dist',
    target: 'es2020'
  }
});
