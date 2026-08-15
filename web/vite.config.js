import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API is a separate process on 5178; proxying keeps the browser on one
// origin so EventSource and downloads need no CORS handling.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5178',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
