import RubyWorker from './ruby.worker.js?worker';

export const MAX_SOURCE_CHARS = 100_000;
export const MAX_OUTPUT_CHARS = 100_000;
const MAX_FILES = 100;
const MAX_FILE_CHARS = 100_000;
const MAX_PROJECT_CHARS = 500_000;
const MAX_PATH_CHARS = 256;
const MAX_INPUT_CHARS = 100_000;
const MAX_STACK_CHARS = 12_000;
const LOAD_TIMEOUT = 90_000;
const RUN_TIMEOUT = 15_000;

function safePath(path, label = 'Ruby project path') {
  if (typeof path !== 'string' || !path || path.length > MAX_PATH_CHARS || path.startsWith('/') || path.includes('\\') || /[\x00-\x1f\x7f]/.test(path)) {
    throw new Error(`Invalid ${label}: ${String(path)}.`);
  }
  const parts = path.split('/');
  if (parts.some((part) => !part || part.length > 255 || part === '.' || part === '..'
    || /[<>:"|?*]/.test(part) || part.endsWith('.') || part.endsWith(' ')
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part))) {
    throw new Error(`Invalid ${label}: ${path}.`);
  }
  return parts.join('/');
}

function validate(name, source, { files = [], mode = 'safe', packages = [], input = '' } = {}) {
  if (typeof source !== 'string' || source.length > MAX_SOURCE_CHARS) throw new Error(`Ruby source is limited to ${MAX_SOURCE_CHARS.toLocaleString()} characters.`);
  if (mode !== 'safe' && mode !== 'experimental') throw new Error("Ruby mode must be 'safe' or 'experimental'.");
  if (typeof input !== 'string' || input.length > MAX_INPUT_CHARS) throw new Error(`Ruby input is limited to ${MAX_INPUT_CHARS.toLocaleString()} characters.`);
  const entry = safePath(name || 'main.rb', 'Ruby entry path');
  if (!Array.isArray(files) || files.length > MAX_FILES) throw new Error(`Ruby project is limited to ${MAX_FILES} files.`);
  let total = 0;
  const paths = new Set();
  const snapshot = files.map((file) => {
    if (!file || typeof file.content !== 'string') throw new Error('Ruby project files must have a name and string content.');
    const path = safePath(file.name);
    if (paths.has(path)) throw new Error(`Duplicate Ruby project path: ${path}.`);
    paths.add(path);
    if (file.content.length > MAX_FILE_CHARS) throw new Error(`Ruby project file '${path}' exceeds ${MAX_FILE_CHARS.toLocaleString()} characters.`);
    total += file.content.length;
    return { name: path, content: file.content };
  });
  for (const path of paths) {
    const parts = path.split('/');
    for (let index = 1; index < parts.length; index += 1) {
      if (paths.has(parts.slice(0, index).join('/'))) throw new Error(`Ruby project path conflicts with a file: ${path}.`);
    }
  }
  if (total > MAX_PROJECT_CHARS) throw new Error(`Ruby project is limited to ${MAX_PROJECT_CHARS.toLocaleString()} characters.`);
  if (!Array.isArray(packages)) throw new Error('Ruby packages must be an array of package names.');
  if (packages.length) throw new Error('Ruby package installation is unavailable in this offline ruby.wasm runtime; packages were not installed.');
  return { name: entry, source, files: snapshot, mode, packages: [], input };
}

export function createRubyRuntime({ onOutput = () => {}, onStatus = () => {} } = {}) {
  let worker = null;
  let active = null;
  let sequence = 0;

  function clearTimers(task) {
    clearTimeout(task?.loadTimer);
    clearTimeout(task?.runTimer);
  }
  function finish(task, error) {
    if (!task || active !== task) return;
    clearTimers(task);
    active = null;
    if (task.mode === 'experimental' && worker) {
      worker.terminate();
      worker = null;
    }
    onStatus(error ? 'error' : 'ready', error?.message || (error ? '' : 'Ruby 3.4 run finished.'));
    error ? task.reject(error) : task.resolve();
  }
  function terminate(reason) {
    const task = active;
    if (worker) {
      worker.postMessage({ type: 'stop', runId: task?.id ?? 0 });
      worker.terminate();
      worker = null;
    }
    if (task) finish(task, new Error(reason));
  }
  function ensureWorker() {
    if (worker) return worker;
    worker = new RubyWorker();
    worker.addEventListener('message', ({ data: message }) => {
      if (!message || !active || message.runId !== active.id) return;
      if (message.type === 'loading') { onStatus('loading', message.text || 'Loading CRuby 3.4 WebAssembly…'); return; }
      if (message.type === 'started') {
        clearTimeout(active.loadTimer);
        active.runTimer = setTimeout(() => terminate('Ruby stopped after 15 seconds to keep the browser responsive.'), RUN_TIMEOUT);
        onStatus('running', 'Running CRuby 3.4 in a separate Web Worker.');
        return;
      }
      if (message.type === 'output') { onOutput(message.stream || 'stdout', message.text || ''); return; }
      if (message.type === 'complete') { finish(active); return; }
      if (message.type === 'error') finish(active, new Error(String(message.text || 'Ruby could not run.').slice(0, MAX_STACK_CHARS)));
    });
    worker.addEventListener('error', (event) => {
      event.preventDefault?.();
      terminate(event.message || 'The Ruby worker stopped unexpectedly.');
    });
    return worker;
  }
  return {
    run(name, source, options = {}) {
      if (active) return Promise.reject(new Error('Ruby is already running. Stop it before starting another run.'));
      let request;
      try { request = validate(name, source, options); } catch (error) { return Promise.reject(error); }
      const id = ++sequence;
      const current = ensureWorker();
      onStatus('loading', 'Starting the local CRuby 3.4 WebAssembly runtime…');
      return new Promise((resolve, reject) => {
        active = { id, resolve, reject, mode: request.mode, loadTimer: 0, runTimer: 0 };
        active.loadTimer = setTimeout(() => terminate('Ruby took too long to initialize. Try again after reloading the editor.'), LOAD_TIMEOUT);
        current.postMessage({ type: 'run', runId: id, ...request });
      });
    },
    stop() {
      if (!worker && !active) return false;
      terminate('Ruby run stopped.');
      onStatus('stopped', 'Ruby worker stopped.');
      return true;
    },
    get running() { return Boolean(active); }
  };
}
