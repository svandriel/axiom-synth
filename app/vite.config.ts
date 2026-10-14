import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
const base = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [vue(), tailwindcss()],
  define: {
    self: 'globalThis',
  },
  server: {
    port: 4000,
  },
});
