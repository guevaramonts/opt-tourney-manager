import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      // better-sqlite3 is a native Node module — keep it external
      external: ['better-sqlite3', 'electron'],
    },
  },
});
