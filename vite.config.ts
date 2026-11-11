import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    }
  },
  build: {
    modulePreload: false,
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        options: path.resolve(import.meta.dirname, 'options.html'),
        offscreen: path.resolve(import.meta.dirname, 'offscreen.html')
      },
      output: {
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
        entryFileNames: 'assets/[name].js'
      }
    }
  }
});
