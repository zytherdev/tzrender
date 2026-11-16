import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^\.\/dompurify\/dompurify\.js$/,
        replacement: resolve(root, 'node_modules/dompurify/dist/purify.es.mjs')
      }
    ]
  },
  build: {
    rolldownOptions: {
      input: {
        home: resolve(root, 'index.html'),
        editor: resolve(root, 'editor.html'),
        tools: resolve(root, 'tools.html')
      }
    }
  },
  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0' }
});
