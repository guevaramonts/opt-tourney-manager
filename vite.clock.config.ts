import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Renderer config for the Big Screen Clock window
export default defineConfig({
  plugins: [react()],
  root: 'src/clock',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
