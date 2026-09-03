import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  cacheDir: '../.vite-cache-front',
  server: {
    host: '0.0.0.0',
    allowedHosts: ['turret-dynasty-twine.ngrok-free.dev'],
    proxy: {
      '/sso-test': {
        target: 'http://127.0.0.1:80',
        changeOrigin: true
      },
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true
      }
    }
  }
});
