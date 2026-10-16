import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em desenvolvimento, /api é encaminhado para a API local (mesma origem, como no Cloudflare Pages).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': { target: process.env.API_PROXY_TARGET || 'http://localhost:3000' } },
  },
});
