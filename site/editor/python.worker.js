import { loadPyodide } from 'pyodide';

const MAX_OUTPUT_CHARS = 24_000;
let pyodide;
let outputLength = 0;
let activeRun = 0;

function send(message) {
  self.postMessage(message);
}

function postOutput(runId, stream, value) {
  const text = String(value ?? '');
  const remaining = Math.max(0, MAX_OUTPUT_CHARS - outputLength);
  if (!remaining) return;
  const clipped = text.slice(0, remaining);
  outputLength += clipped.length;
  if (clipped) send({ type: 'output', runId, stream, text: clipped });
  if (clipped.length < text.length && outputLength >= MAX_OUTPUT_CHARS) {
    send({ type: 'output-limit', runId, text: '\n[Output truncated at 24,000 characters.]' });
  }
}

function disableNetwork() {
  const nativeFetch = self.fetch.bind(self);
  self.fetch = (resource, options) => {
    let url;
    try {
      const source = typeof resource === 'string' || resource instanceof URL ? resource : resource.url;
      url = new URL(source, self.location.href);
    } catch {
      return Promise.reject(new TypeError('Invalid URL.'));
    }
    if (url.origin !== self.location.origin) {
      return Promise.reject(new TypeError('Network access is disabled in this local Python workspace.'));
    }
    return nativeFetch(resource, options);
  };

  for (const name of ['WebSocket', 'EventSource', 'WebTransport', 'XMLHttpRequest']) {
    try {
      Object.defineProperty(self, name, {
        configurable: false,
        writable: false,
        value: class NetworkAccessDisabled {
          constructor() {
            throw new TypeError('Network access is disabled in this local Python workspace.');
          }
        }
      });
    } catch {
      // Some browser globals are immutable; fetch remains restricted above.
    }
  }
}

async function getRuntime(runId) {
  if (pyodide) return pyodide;
  send({ type: 'loading', runId, text: 'Loading the local Python runtime (first run may take a moment)…' });
  const indexURL = new URL('/pyodide/', self.location.origin).href;
  pyodide = await loadPyodide({ indexURL });
  disableNetwork();
  pyodide.setStdout({ batched: (text) => postOutput(activeRun, 'stdout', text) });
  pyodide.setStderr({ batched: (text) => postOutput(activeRun, 'stderr', text) });
  return pyodide;
}

self.addEventListener('message', async (event) => {
  const message = event.data;
  if (!message || message.type !== 'run' || typeof message.source !== 'string') return;
  const runId = Number(message.runId);
  if (!Number.isInteger(runId) || message.source.length > 100_000) {
    send({ type: 'error', runId, text: 'The Python file is too large to run.' });
    return;
  }
  activeRun = runId;
  outputLength = 0;
  try {
    const runtime = await getRuntime(runId);
    if (activeRun !== runId) return;
    send({ type: 'started', runId });
    const result = await runtime.runPythonAsync(message.source);
    if (activeRun !== runId) return;
    if (result !== undefined && result !== null) {
      try {
        const value = result.toString();
        if (value && value !== 'None') postOutput(runId, 'result', `=> ${value}\n`);
      } finally {
        result.destroy?.();
      }
    }
    send({ type: 'complete', runId });
  } catch (error) {
    if (activeRun === runId) send({ type: 'error', runId, text: error?.stack || error?.message || String(error) });
  }
});
