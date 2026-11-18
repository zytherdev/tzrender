import { loadPyodide } from 'pyodide';

const MAX_OUTPUT_CHARS = 24_000;
const MAX_INPUT_CHARS = 100_000;
const MAX_FILES = 100;
const MAX_FILE_CHARS = 100_000;
const MAX_PROJECT_CHARS = 500_000;
const MAX_PACKAGES = 20;
const MAX_PACKAGE_SPEC_CHARS = 200;
let pyodide;
let outputLength = 0;
let activeRun = 0;
let inputQueue = [];

function send(message) { self.postMessage(message); }

function postOutput(runId, stream, value) {
  const text = String(value ?? '');
  const remaining = Math.max(0, MAX_OUTPUT_CHARS - outputLength);
  if (!remaining) return;
  const clipped = text.slice(0, remaining);
  outputLength += clipped.length;
  if (clipped) send({ type: 'output', runId, stream, text: clipped });
  if (clipped.length < text.length && outputLength >= MAX_OUTPUT_CHARS) send({ type: 'output-limit', runId, text: '\n[Output truncated at 24,000 characters.]' });
}

function disableNetwork() {
  self.fetch = () => Promise.reject(new TypeError('Network access is disabled in safe Python mode.'));
  for (const name of ['WebSocket', 'EventSource', 'WebTransport', 'XMLHttpRequest']) {
    try {
      Object.defineProperty(self, name, { configurable: false, writable: false, value: class NetworkAccessDisabled {
        constructor() { throw new TypeError('Network access is disabled in this local Python workspace.'); }
      } });
    } catch { /* fetch remains restricted if a browser global is immutable */ }
  }
}

function queueInput(value, replace = false) {
  if (typeof value !== 'string' || value.length > MAX_INPUT_CHARS) throw new TypeError(`Python input is limited to ${MAX_INPUT_CHARS.toLocaleString()} characters.`);
  if (replace) inputQueue = [];
  if (value) inputQueue.push(...(value.match(/[^\n]*(?:\n|$)/g)?.filter(Boolean) || []));
}
function readInput() { return inputQueue.length ? inputQueue.shift() : null; }

async function getRuntime(runId, mode) {
  if (pyodide) return pyodide;
  send({ type: 'loading', runId, text: 'Loading the local Python runtime (first run may take a moment)…' });
  pyodide = await loadPyodide({ indexURL: new URL('/pyodide/', self.location.origin).href });
  if (mode !== 'experimental') disableNetwork();
  pyodide.setStdout({ batched: (text) => postOutput(activeRun, 'stdout', text) });
  pyodide.setStderr({ batched: (text) => postOutput(activeRun, 'stderr', text) });
  pyodide.setStdin({ stdin: readInput, autoEOF: true });
  return pyodide;
}

function validateRun(message, runId) {
  if (!message || typeof message.source !== 'string' || !Number.isInteger(runId) || message.source.length > 100_000) throw new Error('The Python file is too large to run.');
  const entryName = typeof message.name === 'string' && message.name ? message.name.replaceAll('\\', '/') : 'main.py';
  if (entryName.startsWith('/') || entryName.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid Python entry file name: ${entryName}`);
  }
  if (message.input !== undefined && (typeof message.input !== 'string' || message.input.length > MAX_INPUT_CHARS)) throw new Error(`Python input is limited to ${MAX_INPUT_CHARS.toLocaleString()} characters.`);
  if (message.mode !== undefined && message.mode !== 'safe' && message.mode !== 'experimental') throw new Error("Python mode must be 'safe' or 'experimental'.");
  const files = message.files ?? [];
  if (!Array.isArray(files) || files.length > MAX_FILES) throw new Error(`Python project is limited to ${MAX_FILES} files.`);
  let total = 0;
  for (const file of files) {
    if (!file || typeof file.name !== 'string' || typeof file.content !== 'string') throw new Error('Python project files must have a name and string content.');
    const name = file.name.replaceAll('\\', '/');
    if (!name || name.startsWith('/') || name.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error(`Invalid Python project file name: ${file.name}`);
    if (file.content.length > MAX_FILE_CHARS) throw new Error(`Python project file '${name}' exceeds ${MAX_FILE_CHARS.toLocaleString()} characters.`);
    total += file.content.length;
  }
  if (total > MAX_PROJECT_CHARS) throw new Error(`Python project is limited to ${MAX_PROJECT_CHARS.toLocaleString()} characters.`);
  const packages = message.packages ?? [];
  if (!Array.isArray(packages) || packages.length > MAX_PACKAGES) throw new Error(`Python installs are limited to ${MAX_PACKAGES} packages.`);
  for (const spec of packages) {
    if (typeof spec !== 'string' || spec.length > MAX_PACKAGE_SPEC_CHARS || !/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\s*(?:===|==|~=|!=|<=|>=|<|>)\s*[A-Za-z0-9.*+!_-]+)?$/.test(spec)) throw new Error('Invalid pip package specification. Use a package name with an optional version constraint.');
  }
  if ((message.mode ?? 'safe') !== 'experimental' && packages.length) throw new Error('Package installation is available only in experimental mode.');
  return { mode: message.mode ?? 'safe', name: entryName, files, packages };
}

async function prepareProject(runtime, files, entryName) {
  const entryDirectory = entryName.includes('/') ? entryName.slice(0, entryName.lastIndexOf('/')) : '';
  runtime.runPython(`import os, shutil, sys\nproject_dir = '/project'\nshutil.rmtree(project_dir, ignore_errors=True)\nos.makedirs(project_dir, exist_ok=True)\nentry_dir = os.path.join(project_dir, ${JSON.stringify(entryDirectory)})\nos.makedirs(entry_dir, exist_ok=True)\nos.chdir(entry_dir)\nfor _path in (project_dir, entry_dir):\n    if _path not in sys.path: sys.path.insert(0, _path)`);
  for (const { name, content } of files) {
    const normalized = name.replaceAll('\\', '/');
    const path = `/project/${normalized}`;
    const parent = path.slice(0, path.lastIndexOf('/'));
    runtime.FS.mkdirTree(parent);
    runtime.FS.writeFile(path, content);
  }
  // Discard imported project modules so a repeated safe-mode run sees the supplied snapshot.
  runtime.runPython(`import sys\nfor _name in list(sys.modules):\n    _module = sys.modules.get(_name)\n    _file = getattr(_module, '__file__', '') if _module else ''\n    if _file and _file.startswith('/project/'): del sys.modules[_name]`);
}

async function execute(message, runId) {
  activeRun = runId;
  outputLength = 0;
  inputQueue = [];
  try {
    const options = validateRun(message, runId);
    if (message.input) queueInput(message.input);
    const runtime = await getRuntime(runId, options.mode);
    if (activeRun !== runId) return;
    if (options.mode === 'experimental' && options.packages.length) {
      await runtime.loadPackage('micropip');
      await runtime.runPythonAsync(`import micropip\nawait micropip.install(${JSON.stringify(options.packages)})`);
    }
    await prepareProject(runtime, options.files, options.name);
    send({ type: 'started', runId });
    const result = await runtime.runPythonAsync(message.source);
    if (activeRun !== runId) return;
    if (result !== undefined && result !== null) {
      try {
        const value = result.toString();
        if (value && value !== 'None') postOutput(runId, 'result', `=> ${value}\n`);
      } finally { result.destroy?.(); }
    }
    send({ type: 'complete', runId });
  } catch (error) {
    if (activeRun === runId) send({ type: 'error', runId, text: String(error?.stack || error?.message || error).slice(0, MAX_OUTPUT_CHARS) });
  } finally {
    if (activeRun === runId && pyodide) {
      try { pyodide.runPython("import shutil; shutil.rmtree('/project', ignore_errors=True)"); } catch { /* runtime may have failed during initialization */ }
    }
  }
}

self.addEventListener('message', async (event) => {
  const message = event.data;
  if (!message) return;
  if (message.type === 'stop') { activeRun = 0; inputQueue = []; return; }
  if (message.type === 'input') {
    if (Number(message.runId) === activeRun) {
      try { queueInput(message.input, message.replace === true); }
      catch (error) { send({ type: 'error', runId: activeRun, text: error.message }); }
    }
    return;
  }
  if (message.type === 'run' && typeof message.source === 'string') await execute(message, Number(message.runId));
});
