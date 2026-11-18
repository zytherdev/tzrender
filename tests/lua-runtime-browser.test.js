// @vitest-environment node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createServer } from 'vite';

const chromium = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const harness = `<!doctype html>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; connect-src 'self' ws: wss:; object-src 'none'">
<pre id="result">pending</pre>
<script type="module">
  import { createLuaRuntime } from '/site/editor/lua-runtime.js';
  const result = document.getElementById('result');
  const runtime = createLuaRuntime();
  try {
    const run = await runtime.run('main.lua', 'print("Hello from Lua!")\\nprint(io.read())', { input: 'Ada\\n' });
    result.textContent = JSON.stringify(run);
    result.dataset.status = 'success';
  } catch (error) {
    result.textContent = error.message || String(error);
    result.dataset.status = 'error';
  } finally {
    runtime.dispose();
  }
</script>`;

function runBrowser(url) {
  return new Promise((resolve, reject) => {
    const browser = spawn(chromium, [
      '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
      '--disable-background-networking', '--virtual-time-budget=10000', '--dump-dom', url
    ]);
    let stdout = '';
    let stderr = '';
    browser.stdout.on('data', (chunk) => { stdout += chunk; });
    browser.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      browser.kill('SIGKILL');
      reject(new Error('Chromium timed out while loading the Lua runtime.'));
    }, 20_000);
    browser.on('error', (error) => { clearTimeout(timer); reject(error); });
    browser.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`Chromium exited with code ${code}: ${stderr}`));
      else resolve(stdout);
    });
  });
}

describe('Lua runtime in a browser', () => {
  it.skipIf(!existsSync(chromium))('runs with the editor same-origin CSP and a locally served WASM file', async () => {
    const server = await createServer({
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [{
        name: 'lua-browser-test-harness',
        configureServer(vite) {
          vite.middlewares.use('/__lua_runtime_test', (_request, response) => {
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(harness);
          });
        }
      }]
    });
    try {
      await server.listen();
      const { port } = server.httpServer.address();
      const html = await runBrowser(`http://127.0.0.1:${port}/__lua_runtime_test`);
      expect(html).toContain('data-status="success"');
      expect(html).toContain('Hello from Lua!\\nAda\\n');
      expect(html).toContain('"exitCode":0');
    } finally {
      await server.close();
    }
  }, 30_000);
});
