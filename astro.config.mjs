import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  devToolbar: { enabled: false },
  server: { port: 4321 },
  security: {
    checkOrigin: true,
    actionBodySizeLimit: 12 * 1024 * 1024,
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
