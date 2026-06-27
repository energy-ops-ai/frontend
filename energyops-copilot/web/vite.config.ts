import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const SERVER = 'http://localhost:3460';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Single source of truth for the widget/event protocol lives in the server.
      '@shared': fileURLToPath(new URL('../server/src', import.meta.url))
    }
  },
  server: {
    proxy: {
      '/events': { target: SERVER, changeOrigin: true },
      '/message': SERVER,
      '/permission': SERVER,
      '/interrupt': SERVER,
      '/health': SERVER
    }
  }
});
