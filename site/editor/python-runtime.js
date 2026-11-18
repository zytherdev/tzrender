import PythonWorker from './python.worker.js?worker';

const MAX_SOURCE_CHARS = 100_000;
const MAX_INPUT_CHARS = 100_000;
const RUNTIME_LOAD_TIMEOUT = 90_000;
const RUN_TIMEOUT = 15_000;

function validateInput(input) {
  if (input === undefined) return '';
  if (typeof input !== 'string' || input.length > MAX_INPUT_CHARS) {
    throw new Error(`Python input is limited to ${MAX_INPUT_CHARS.toLocaleString()} characters.`);
  }
  return input;
}

export function createPythonRuntime({ onOutput = () => {}, onStatus = () => {} } = {}) {
  let worker = null;
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

  function ensureWorker() {
    if (worker) return worker;
    worker = new PythonWorker();
    worker.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || !active || message.runId !== active.id) return;
      if (message.type === 'loading') {
        onStatus('loading', message.text);
        return;
      }
      if (message.type === 'started') {
        clearTimeout(active.loadTimer);
        active.runTimer = setTimeout(() => {
          stopWorker('Python stopped after 15 seconds to keep the browser responsive.');
        }, RUN_TIMEOUT);
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
    if (active && worker) {
      worker.postMessage({ type: 'input', runId: active.id, input: value, replace });
    } else if (replace) {
      pendingInput = value;
    } else {
      pendingInput += value;
    }
    return value.length;
  }

  return {
    run(source, options = {}) {
      if (typeof source !== 'string' || source.length > MAX_SOURCE_CHARS) {
        return Promise.reject(new Error(`Python files are limited to ${MAX_SOURCE_CHARS.toLocaleString()} characters.`));
      }
      if (active) return Promise.reject(new Error('Python is already running. Stop it before starting another run.'));
      let input;
      try {
        input = options.input === undefined ? pendingInput : validateInput(options.input);
      } catch (error) {
        return Promise.reject(error);
      }
      pendingInput = '';
      const id = ++runSequence;
      const currentWorker = ensureWorker();
      onStatus('loading', 'Starting the local Python runtime…');
      const promise = new Promise((resolve, reject) => {
        active = { id, resolve, reject, loadTimer: 0, runTimer: 0 };
        active.loadTimer = setTimeout(() => {
          stopWorker('Python took too long to initialize. Try again after reloading the editor.');
        }, RUNTIME_LOAD_TIMEOUT);
        currentWorker.postMessage({ type: 'run', runId: id, source, input });
      });
      return promise;
    },
    setInput(input = '') {
      return sendInput(input, true);
    },
    submitInput(input = '') {
      return sendInput(input, false);
    },
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
    get running() {
      return Boolean(active);
    }
  };
}
