// @vitest-environment node
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createServer as createViteServer } from 'vite';

const chromium = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const harness = `<!doctype html>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; connect-src 'self' ws: wss:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'">
<pre id="result">pending</pre>
<script type="module">
  import { createRubyRuntime } from '/site/editor/ruby-runtime.js';
  import { createRRuntime } from '/site/editor/r-runtime.js';
  import { createPerlRuntime } from '/site/editor/perl-runtime.js';
  const output = { ruby: [], r: [], perl: [] };
  const runtimes = [];
  const result = document.getElementById('result');
  try {
    const ruby = createRubyRuntime({ onOutput: (stream, text) => output.ruby.push(stream + ':' + text) });
    runtimes.push(ruby);
    await ruby.run('main.rb', 'require_relative "lib/greetings"; puts Greetings.say("browser")', {
      files: [{ name: 'lib/greetings.rb', content: 'module Greetings; def self.say(name); "Hello, #{name}!"; end; end' }]
    });

    const r = createRRuntime({ onOutput: (stream, text) => output.r.push(stream + ':' + text) });
    runtimes.push(r);
    await r.run('main.R', 'source("R/summary.R"); scores <- read.csv("data/scores.csv"); print(summarise_scores(scores$score))', {
      files: [
        { name: 'R/summary.R', content: 'summarise_scores <- function(values) c(count=length(values), mean=mean(values))' },
        { name: 'data/scores.csv', content: 'student,score\\nAda,96\\nGrace,91\\n' }
      ]
    });

    const perl = createPerlRuntime({ onOutput: (stream, text) => output.perl.push(stream + ':' + text) });
    runtimes.push(perl);
    await perl.run('main.pl', 'use lib "/workspace/lib"; use Greetings; print Greetings::say("browser"), "\\n";', {
      files: [{ name: 'lib/Greetings.pm', content: 'package Greetings; sub say { return "Hello, $_[0]!"; } 1;' }]
    });
    result.textContent = JSON.stringify(output);
    result.dataset.status = 'success';
  } catch (error) {
    result.textContent = JSON.stringify({ output, error: error?.stack || error?.message || String(error) });
    result.dataset.status = 'error';
  } finally {
    for (const runtime of runtimes) runtime.dispose?.();
  }
</script>`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function createCdpClient(socket) {
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message || 'Chrome DevTools command failed.'));
    else request.resolve(message.result);
  });
  return {
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
  };
}

async function runBrowser(url) {
  const debugPort = await findFreePort();
  const profile = await mkdtemp(join(tmpdir(), 'tzrender-multilang-'));
  const browser = spawn(chromium, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
    '--remote-allow-origins=*', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`, url
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  browser.stderr.on('data', (chunk) => { stderr += chunk; });
  let socket;
  try {
    const startupDeadline = Date.now() + 15_000;
    let target;
    while (!target && Date.now() < startupDeadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
        if (response.ok) {
          const targets = await response.json();
          target = targets.find((item) => item.type === 'page' && item.url === url && item.webSocketDebuggerUrl);
        }
      } catch { /* Chrome is still starting. */ }
      if (!target) await delay(100);
    }
    if (!target) throw new Error(`Could not connect to Chromium DevTools: ${stderr.slice(-3000)}`);

    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('Could not open Chromium DevTools WebSocket.')), { once: true });
    });
    const cdp = createCdpClient(socket);
    await cdp.send('Runtime.enable');
    const deadline = Date.now() + 120_000;
    let status = 'pending';
    while (status === 'pending' && Date.now() < deadline) {
      const response = await cdp.send('Runtime.evaluate', {
        expression: 'document.getElementById("result")?.dataset.status || "pending"',
        returnByValue: true
      });
      status = response.result?.value || 'pending';
      if (status === 'pending') await delay(250);
    }
    if (status === 'pending') throw new Error('Timed out waiting for the browser runtimes to finish.');
    const result = await cdp.send('Runtime.evaluate', {
      expression: 'document.getElementById("result").textContent',
      returnByValue: true
    });
    return { status, payload: JSON.parse(result.result?.value || 'null') };
  } finally {
    socket?.close();
    browser.kill('SIGKILL');
    await new Promise((resolve) => browser.once('close', resolve));
    await rm(profile, { recursive: true, force: true });
  }
}

describe('Ruby, R and Perl runtimes in a browser', () => {
  // Run this high-memory WASM browser check separately from the other Chromium/Vite suites.
  it.skipIf(!existsSync(chromium) || typeof WebSocket === 'undefined' || process.env.TZRENDER_RUN_MULTILANG_BROWSER !== '1')('runs local project imports with external network blocked', async () => {
    const server = await createViteServer({
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [{
        name: 'multilang-browser-test-harness',
        configureServer(vite) {
          vite.middlewares.use('/__multilang_runtime_test', (_request, response) => {
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(harness);
          });
        }
      }]
    });
    try {
      await server.listen();
      const { port } = server.httpServer.address();
      const result = await runBrowser(`http://127.0.0.1:${port}/__multilang_runtime_test`);
      expect(result.status, JSON.stringify(result.payload)).toBe('success');
      expect(result.payload.ruby.join(' ')).toContain('Hello, browser!');
      expect(result.payload.r.join(' ')).toContain('93.5');
      expect(result.payload.perl.join(' ')).toContain('Hello, browser!');
    } finally {
      await server.close();
    }
  }, 135_000);
});
