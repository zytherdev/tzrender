import PythonWorker from './python.worker.js?worker';

const MAX_SOURCE_CHARS = 100_000;
const MAX_INPUT_CHARS = 100_000;
const MAX_FILES = 100;
const MAX_FILE_CHARS = 100_000;
const MAX_PROJECT_CHARS = 500_000;
const MAX_PACKAGES = 20;
const MAX_PACKAGE_SPEC_CHARS = 200;
const RUNTIME_LOAD_TIMEOUT = 90_000;
const RUN_TIMEOUT = 15_000;

function validateInput(input) {
  if (input === undefined) return '';
  if (typeof input !== 'string' || input.length > MAX_INPUT_CHARS) {
    throw new Error(`Python input is limited to ${MAX_INPUT_CHARS.toLocaleString()} characters.`);
  }
  return input;
}

function validateOptions(options = {}) {
  const mode = options.mode ?? 'safe';
  if (mode !== 'safe' && mode !== 'experimental') throw new Error("Python mode must be 'safe' or 'experimental'.");
  const name = options.name ?? 'main.py';
  if (typeof name !== 'string' || !name || name.startsWith('/') || name.replaceAll('\\', '/').split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid Python entry file name: ${name}`);
  }
  const files = options.files ?? [];
  if (!Array.isArray(files) || files.length > MAX_FILES) throw new Error(`Python project is limited to ${MAX_FILES} files.`);
  let total = 0;
  const snapshot = files.map((file) => {
    if (!file || typeof file.name !== 'string' || typeof file.content !== 'string') throw new Error('Python project files must have a name and string content.');
    const name = file.name.replaceAll('\\', '/');
    if (!name || name.startsWith('/') || name.split('/').some((part) => !part || part === '.' || part === '..')) {
      throw new Error(`Invalid Python project file name: ${file.name}`);
    }
    if (file.content.length > MAX_FILE_CHARS) throw new Error(`Python project file '${name}' exceeds ${MAX_FILE_CHARS.toLocaleString()} characters.`);
    total += file.content.length;
    return { name, content: file.content };
  });
  if (total > MAX_PROJECT_CHARS) throw new Error(`Python project is limited to ${MAX_PROJECT_CHARS.toLocaleString()} characters.`);
  const packages = options.packages ?? [];
  if (!Array.isArray(packages) || packages.length > MAX_PACKAGES) throw new Error(`Python installs are limited to ${MAX_PACKAGES} packages.`);
  const checkedPackages = packages.map((spec) => {
    if (typeof spec !== 'string' || spec.length > MAX_PACKAGE_SPEC_CHARS || !/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\s*(?:===|==|~=|!=|<=|>=|<|>)\s*[A-Za-z0-9.*+!_-]+)?$/.test(spec)) {
      throw new Error('Invalid pip package specification. Use a package name with an optional version constraint.');
    }
    return spec;
  });
  if (mode !== 'experimental' && checkedPackages.length) throw new Error('Package installation is available only in experimental mode.');
  return { mode, name: name.replaceAll('\\', '/'), files: snapshot, packages: checkedPackages };
}

export function createPythonRuntime({ onOutput = () => {}, onStatus = () => {} } = {}) {
  let worker = null;
  let workerMode = null;
  let runSequence = 0;
  let active = null;
  let pendingInput = '';

  function clearTimers(task) {
    if (!task) return;
    clearTimeout(task.loadTimer);
    clearTimeout(task.runTimer);
  }

  function endTask(task, error = null) {
    if (!task || active !== task) return;
    clearTimers(task);
    active = null;
    if (task.mode === 'experimental' && worker) {
      worker.terminate();
      worker = null;
    }
    onStatus(error ? 'error' : 'ready', error?.message || '');
    if (error) task.reject(error);
    else task.resolve();
  }

  function stopWorker(reason) {
    if (worker) {
      worker.postMessage({ type: 'stop', runId: active?.id ?? 0 });
      worker.terminate();
      worker = null;
    }
    if (active) endTask(active, new Error(reason));
  }

  function ensureWorker(mode) {
    if (worker && workerMode !== mode) {
      worker.terminate();
      worker = null;
    }
    if (worker) return worker;
    worker = new PythonWorker();
    workerMode = mode;
    worker.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || !active || message.runId !== active.id) return;
      if (message.type === 'loading') {
        onStatus('loading', message.text);
        return;
      }
      if (message.type === 'started') {
        clearTimeout(active.loadTimer);
        active.runTimer = setTimeout(() => stopWorker('Python stopped after 15 seconds to keep the browser responsive.'), RUN_TIMEOUT);
        onStatus('running', 'Python is running in a separate browser worker.');
        return;
      }
      if (message.type === 'output' || message.type === 'output-limit') {
        onOutput(message.stream || 'system', message.text || '');
        return;
      }
      if (message.type === 'complete') {
        endTask(active);
        return;
      }
      if (message.type === 'error') endTask(active, new Error(message.text || 'Python could not run.'));
    });
    worker.addEventListener('error', (event) => {
      event.preventDefault();
      stopWorker(event.message || 'The Python worker stopped unexpectedly.');
    });
    return worker;
  }

  function sendInput(input, replace) {
    const value = validateInput(input);
    if (active && worker) worker.postMessage({ type: 'input', runId: active.id, input: value, replace });
    else if (replace) pendingInput = value;
    else pendingInput += value;
    return value.length;
  }

  return {
    run(source, options = {}) {
      if (typeof source !== 'string' || source.length > MAX_SOURCE_CHARS) return Promise.reject(new Error(`Python files are limited to ${MAX_SOURCE_CHARS.toLocaleString()} characters.`));
      if (active) return Promise.reject(new Error('Python is already running. Stop it before starting another run.'));
      let input;
      let runOptions;
      try {
        input = options.input === undefined ? pendingInput : validateInput(options.input);
        runOptions = validateOptions(options);
      } catch (error) { return Promise.reject(error); }
      pendingInput = '';
      const id = ++runSequence;
      const currentWorker = ensureWorker(runOptions.mode);
      onStatus('loading', 'Starting the local Python runtime…');
      return new Promise((resolve, reject) => {
        active = { id, resolve, reject, mode: runOptions.mode, loadTimer: 0, runTimer: 0 };
        active.loadTimer = setTimeout(() => stopWorker('Python took too long to initialize. Try again after reloading the editor.'), RUNTIME_LOAD_TIMEOUT);
        currentWorker.postMessage({ type: 'run', runId: id, source, input, ...runOptions });
      });
    },
    setInput(input = '') { return sendInput(input, true); },
    submitInput(input = '') { return sendInput(input, false); },
    stop() {
      if (!active && !worker) return false;
      stopWorker('Python run stopped.');
      onStatus('stopped', 'Python worker stopped.');
      return true;
    },
    dispose() {
      if (worker) worker.terminate();
      worker = null;
      if (active) {
        clearTimers(active);
        active.reject(new Error('The editor is closing.'));
        active = null;
      }
    },
    get running() { return Boolean(active); }
  };
}
