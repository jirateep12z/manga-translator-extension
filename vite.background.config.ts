import path from 'path';
import { defineConfig } from 'vite';

// The service worker is built alone so that it never imports chunks shared
// with the popup or options page, which contain React and UI code.
export default defineConfig(({ mode }) => ({
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
      input: path.resolve(import.meta.dirname, 'src/background/index.ts'),
      output: {
        format: 'es',
        entryFileNames: 'background.js'
      }
    }
  }
}));
