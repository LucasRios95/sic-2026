import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Quando rodando no Docker, o Vite precisa escutar em 0.0.0.0 para a porta
    // exposta funcionar. HMR via polling como fallback caso o file watcher do
    // host não propague para o container (Docker Desktop no Windows/Mac).
    host: true,
    watch: {
      usePolling: true,
      interval: 500,
    },
  },
});
