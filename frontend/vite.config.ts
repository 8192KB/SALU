import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', 'SALU_');
  const port = process.env.SALU_SERVER_PORT ?? env.SALU_SERVER_PORT ?? '8081';
  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_SALU_AUTH_MODE': JSON.stringify(
        mode === 'prototype' ? 'prototype' : (process.env.VITE_SALU_AUTH_MODE ?? 'server'),
      ),
    },
    server: {
      host: '0.0.0.0',
      port: Number(process.env.SALU_FRONTEND_PORT ?? env.SALU_FRONTEND_PORT ?? '5174'),
      strictPort: true,
      proxy: { '/api': { target: `http://127.0.0.1:${port}`, ws: true } },
    },
    preview: {
      host: '0.0.0.0',
      port: 5174,
      strictPort: true,
      proxy: { '/api': { target: `http://127.0.0.1:${port}`, ws: true } },
    },
  };
});
