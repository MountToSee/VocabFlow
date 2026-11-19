import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiTarget = process.env.VOCABFLOW_SERVER_URL ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget },
      '/ws': { target: apiTarget.replace(/^http/, 'ws'), ws: true },
    },
  },
});
