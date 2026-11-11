import path from 'path';
import { defineConfig } from 'vite';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

// Development-only parity harness (spec 0002 §15.2). It serves the models from
// public/ and isolates the page so the WASM backend can use threads.
export default defineConfig({
  root: import.meta.dirname,
  publicDir: path.resolve(ROOT_DIR, 'public'),
  resolve: {
    alias: {
      '@': path.resolve(ROOT_DIR, 'src')
    }
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web']
  },
  server: {
    port: 5174,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
    fs: {
      allow: [ROOT_DIR]
    }
  }
});
