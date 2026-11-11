import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode)
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    copyPublicDir: false,
    modulePreload: false,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, 'src/content/index.tsx'),
      output: {
        format: 'iife',
        entryFileNames: 'content.js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
}));
