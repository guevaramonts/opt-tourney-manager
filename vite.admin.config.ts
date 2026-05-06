import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Renderer config for the Admin Dashboard window
export default defineConfig({
  plugins: [react()],
  root: 'src/admin',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
