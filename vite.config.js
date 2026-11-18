import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;
const pyodideDirectory = resolve(root, 'node_modules/pyodide');
const pyodideFiles = [
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json'
];
const pyodideMime = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.json': 'application/json; charset=utf-8'
};

const javaRuntimeDirectory = resolve(root, 'node_modules/@live-codes/java-wasm/dist');
const javaRuntimeFiles = [
  'worker-java.js',
  'teavm/compiler.wasm-runtime.js',
  'teavm/compiler.wasm-deobfuscator.wasm',
  'teavm/compiler.wasm',
  'teavm/compile-classlib-teavm.bin',
  'teavm/runtime-classlib-teavm.bin'
];

function javaRuntimeAssets() {
  return {
    name: 'tzrender-java-wasm-assets',
    configureServer(server) {
      server.middlewares.use('/java-wasm', (request, response, next) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') return next();
        const relative = decodeURIComponent(new URL(request.url || '/', 'http://vite.local').pathname).replace(/^\/+/, '');
        if (!javaRuntimeFiles.includes(relative)) return next();
        try {
          const bytes = readFileSync(resolve(javaRuntimeDirectory, relative));
          response.statusCode = 200;
          response.setHeader('Content-Type', relative.endsWith('.js') ? 'text/javascript; charset=utf-8' : relative.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
          response.setHeader('Cache-Control', 'public, max-age=3600');
          response.setHeader('Content-Length', bytes.byteLength);
          response.end(request.method === 'HEAD' ? undefined : bytes);
        } catch {
          response.statusCode = 404;
          response.end('Java runtime asset not found.');
        }
      });
    },
    generateBundle() {
      for (const relative of javaRuntimeFiles) {
        this.emitFile({ type: 'asset', fileName: `java-wasm/${relative}`, source: readFileSync(resolve(javaRuntimeDirectory, relative)) });
      }
    }
  };
}

function pyodideRuntimeAssets() {
  return {
    name: 'tzrender-local-pyodide-assets',
    configureServer(server) {
      server.middlewares.use('/pyodide', (request, response, next) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') return next();
        const name = basename(new URL(request.url || '/', 'http://vite.local').pathname);
        if (!pyodideFiles.includes(name)) return next();
        try {
          const bytes = readFileSync(resolve(pyodideDirectory, name));
          response.statusCode = 200;
          response.setHeader('Content-Type', pyodideMime[resolve('.', name).slice(resolve('.', name).lastIndexOf('.'))] || 'application/octet-stream');
          response.setHeader('Cache-Control', 'public, max-age=3600');
          response.setHeader('Content-Length', bytes.byteLength);
          response.end(request.method === 'HEAD' ? undefined : bytes);
        } catch {
          response.statusCode = 404;
          response.end('Pyodide runtime asset not found.');
        }
      });
    },
    generateBundle() {
      for (const name of pyodideFiles) {
        this.emitFile({
          type: 'asset',
          fileName: `pyodide/${name}`,
          source: readFileSync(resolve(pyodideDirectory, name))
        });
      }
    }
  };
}

export default defineConfig({
  plugins: [pyodideRuntimeAssets(), javaRuntimeAssets()],
  resolve: {
    alias: [
      {
        find: /^\.\/dompurify\/dompurify\.js$/,
        replacement: resolve(root, 'node_modules/dompurify/dist/purify.es.mjs')
      }
    ]
  },
  assetsInclude: [/\.wasm$/, /\.dat$/, /\.so$/, /\.la$/],
  optimizeDeps: { include: ['typescript', 'pyodide'], exclude: ['@php-wasm/web-8-5'] },
  worker: { format: 'es' },
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
