import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // During development the Mini App talks to the local API server.
    proxy: { '/api': 'http://localhost:3000', '/install': 'http://localhost:3000' },
  },
});
