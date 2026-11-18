import { WebR } from 'webr';

export const MAX_SOURCE_CHARS = 100_000;
export const MAX_OUTPUT_CHARS = 100_000;
export const MAX_PROJECT_FILES = 100;
export const MAX_PROJECT_CHARS = 500_000;
export const MAX_PACKAGES = 20;
const MAX_PATH_CHARS = 256;
const MAX_PACKAGE_CHARS = 100;
const LOAD_TIMEOUT = 90_000;
const RUN_TIMEOUT = 15_000;

function validatePath(path, label) {
  if (typeof path !== 'string' || !path || path.length > MAX_PATH_CHARS || path.startsWith('/')
    || path.includes('\\') || /[\0-\x1f\x7f:]/.test(path)
    || path.split('/').some((part) => !part || part === '.' || part === '..' || !/^[A-Za-z0-9_.-]+$/.test(part))) {
    throw new Error(`Invalid R ${label}: ${String(path)}.`);
  }
  return path;
}

function validateRun(name, source, options) {
  if (typeof source !== 'string' || source.length > MAX_SOURCE_CHARS) throw new Error(`R source is limited to ${MAX_SOURCE_CHARS.toLocaleString()} characters.`);
  const entry = validatePath(name || 'main.R', 'entry file name');
  const mode = options.mode ?? 'safe';
  if (mode !== 'safe' && mode !== 'experimental') throw new Error("R mode must be 'safe' or 'experimental'.");
  const files = options.files ?? [];
  if (!Array.isArray(files) || files.length > MAX_PROJECT_FILES) throw new Error(`R projects are limited to ${MAX_PROJECT_FILES} files.`);
  let total = source.length;
  const snapshot = new Map();
  for (const file of files) {
    if (!file || typeof file !== 'object' || typeof file.name !== 'string' || typeof file.content !== 'string') throw new Error('R project files must have a name and string content.');
    const path = validatePath(file.name.replaceAll('\\', '/'), 'project file name');
    if (snapshot.has(path)) throw new Error(`R project file name is duplicated: ${path}.`);
    total += file.content.length;
    if (total > MAX_PROJECT_CHARS) throw new Error(`R project files are limited to ${MAX_PROJECT_CHARS.toLocaleString()} characters in total.`);
    snapshot.set(path, file.content);
  }
  snapshot.set(entry, source);
  const packages = options.packages ?? [];
  if (!Array.isArray(packages) || packages.length > MAX_PACKAGES || packages.some((pkg) => typeof pkg !== 'string' || pkg.length > MAX_PACKAGE_CHARS || !/^[A-Za-z][A-Za-z0-9.]*$/.test(pkg))) {
    throw new Error('Invalid R package list. Use package names only.');
  }
  if (mode === 'safe' && packages.length) throw new Error('R package installation is disabled in safe mode.');
  return { entry, mode, files: snapshot, packages };
}

function rQuote(text) {
  return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\r', '\\r')}"`;
}

function webRBaseUrl() {
  const applicationBase = import.meta.env?.BASE_URL || '/';
  return new URL(`${applicationBase}webr/`, globalThis.location?.href || 'http://localhost/').href;
}

export function createRRuntime({ onOutput = () => {}, onStatus = () => {} } = {}) {
  let instance = null;
  let loading = null;
  let active = null;
  let disposed = false;
  let state = 'idle';
  let streamReader = null;
  const emit = (status, detail = '') => { state = status; onStatus(status, detail); };

  function closeInstance() {
    const current = instance;
    instance = null;
    loading = null;
    if (streamReader) {
      try { streamReader.return(); } catch { /* worker is closing */ }
      streamReader = null;
    }
    if (!current) return false;
    try {
      if (typeof current.close === 'function') current.close();
      else if (typeof current.worker?.terminate === 'function') current.worker.terminate();
      else if (typeof current.terminate === 'function') current.terminate();
      else throw new Error('This WebR build exposes no worker close or terminate API; R session cannot be safely discarded.');
    } catch (error) {
      emit('error', error?.message || 'Could not close the WebR session.');
    }
    return true;
  }

  async function createInstance() {
    const webR = new WebR({ baseUrl: webRBaseUrl() });
    instance = webR;
    if (typeof webR.init !== 'function' || !(typeof webR.close === 'function' || typeof webR.worker?.terminate === 'function' || typeof webR.terminate === 'function')) {
      closeInstance();
      throw new Error('Unsupported WebR API: an asynchronous init() and worker close/terminate API are required.');
    }
    await webR.init();
    if (typeof webR.flush === 'function') await webR.flush();
    return webR;
  }

  function stop(reason = 'R run stopped.') {
    if (!active && !instance && !loading) return false;
    const task = active;
    const webR = instance;
    closeInstance();
    if (webR && typeof webR.interrupt === 'function') {
      try { webR.interrupt(); } catch { /* closed worker */ }
    }
    if (task && !task.settled) {
      task.settled = true;
      active = null;
      clearTimeout(task.timer);
      task.reject(new Error(reason));
    }
    emit('stopped', reason);
    return true;
  }

  return {
    async run(name, source, options = {}) {
      if (disposed) throw new Error('R runtime has been disposed.');
      if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('R run options must be an object.');
      const checked = validateRun(name, source, options);
      if (active) throw new Error('R is already running. Stop it before starting another run.');
      let webR;
      let task;
      let outputLength = 0;
      let outputLimited = false;
      const write = (stream, value) => {
        const text = typeof value === 'string' ? value : String(value ?? '');
        if (!text || outputLimited) return;
        const available = MAX_OUTPUT_CHARS - outputLength;
        if (available <= 0) { outputLimited = true; return; }
        const clipped = text.slice(0, available);
        outputLength += clipped.length;
        onOutput(stream, clipped);
        if (clipped.length < text.length) {
          outputLimited = true;
          onOutput('system', `R output truncated at ${MAX_OUTPUT_CHARS.toLocaleString()} characters.\n`);
        }
      };
      const promise = new Promise((resolve, reject) => {
        task = { resolve, reject, webR: null, settled: false, timer: 0 };
        active = task;
      });
      void promise.catch(() => {});
      try {
        emit('loading', 'Starting isolated WebR session…');
        task.timer = setTimeout(() => stop('R took too long to initialize.'), LOAD_TIMEOUT);
        loading = createInstance();
        try { webR = await loading; } finally { clearTimeout(task.timer); }
        if (task.settled) return await promise;
        task.webR = webR;
        if (typeof webR.stream !== 'function') throw new Error('Unsupported WebR API: stream() is required.');
        const messages = webR.stream();
        if (!messages || typeof messages[Symbol.asyncIterator] !== 'function') throw new Error('Unsupported WebR API: stream() must return an async iterable.');
        streamReader = messages[Symbol.asyncIterator]();
        const reader = streamReader;
        const consumeStreams = async () => {
          try {
            while (true) {
              const { value, done } = await reader.next();
              if (done) break;
              const type = value?.type;
              if (!['stdout', 'stderr', 'warning', 'error'].includes(type)) continue;
              const stream = type === 'warning' ? 'message' : type === 'error' ? 'stderr' : type;
              write(stream, value?.data ?? '');
            }
          } catch (error) {
            if (!task.settled) write('stderr', `${error?.message || String(error)}\n`);
          }
        };
        void consumeStreams();
        if (checked.mode === 'experimental' && checked.packages.length) {
          if (typeof webR.installPackages !== 'function') throw new Error('This WebR build does not support installation of precompiled WebAssembly packages.');
          emit('loading', `Installing ${checked.packages.length} WebAssembly package(s)…`);
          await webR.installPackages(checked.packages);
        }
        const projectDir = '/home/web_user/r-project';
        await webR.FS.mkdir(projectDir);
        for (const [path, content] of checked.files) {
          const segments = path.split('/');
          segments.pop();
          let dir = projectDir;
          for (const segment of segments) {
            dir += `/${segment}`;
            try { await webR.FS.mkdir(dir); } catch (error) {
              // A parent may have been created by another path in this snapshot.
              if (!await webR.FS.analyzePath(dir).then((result) => result.exists).catch(() => false)) throw error;
            }
          }
          await webR.FS.writeFile(`${projectDir}/${path}`, new TextEncoder().encode(content));
        }
        if (typeof webR.evalRVoid !== 'function' || typeof webR.evalRString !== 'function') throw new Error('Unsupported WebR API: evalRVoid() and evalRString() are required.');
        const entryPath = `${projectDir}/${checked.entry}`;
        const script = `setwd(${rQuote(projectDir)}); .tz_stdout <- character(); .tz_stderr <- character(); .tz_error <- ""; .tz_trace <- ""; .tz_stdout <- capture.output(withCallingHandlers(tryCatch(source(${rQuote(entryPath)}, local=globalenv(), chdir=TRUE), error=function(e) { .tz_error <<- conditionMessage(e); .tz_trace <<- paste(vapply(sys.calls(), function(call) paste(deparse(call), collapse=""), character(1)), collapse="\\n"); NULL }), message=function(m) { .tz_stderr <<- c(.tz_stderr, conditionMessage(m)); invokeRestart("muffleMessage") }, warning=function(w) { .tz_stderr <<- c(.tz_stderr, paste0("Warning: ", conditionMessage(w))); invokeRestart("muffleWarning") })); .tz_stderr <- paste(.tz_stderr, collapse="\\n")`;
        emit('running', `Running ${checked.entry} in WebR…`);
        task.timer = setTimeout(() => stop('R stopped after 15 seconds to keep the editor responsive.'), RUN_TIMEOUT);
        await webR.evalRVoid(script);
        const stdout = await webR.evalRString('if (length(.tz_stdout)) paste0(paste(.tz_stdout, collapse="\\n"), "\\n") else ""');
        const stderr = await webR.evalRString('if (nzchar(.tz_stderr)) paste0(.tz_stderr, "\\n") else ""');
        const errorText = await webR.evalRString('if (nzchar(.tz_error)) paste0(.tz_error, if (nzchar(.tz_trace)) paste0("\\n", .tz_trace) else "") else ""');
        write('stdout', stdout);
        write('stderr', stderr);
        if (errorText) throw new Error(String(errorText).slice(0, MAX_OUTPUT_CHARS));
        if (!task.settled) {
          task.settled = true;
          active = null;
          clearTimeout(task.timer);
          emit('ready', 'R run finished.');
          task.resolve({ exitCode: 0 });
        }
        return await promise;
      } catch (error) {
        const message = String(error?.message || error).replace(/\s+$/, '');
        write('stderr', `${message}\n`);
        if (task && !task.settled) {
          task.settled = true;
          clearTimeout(task.timer);
          active = null;
          emit('error', message);
          task.reject(error instanceof Error ? error : new Error(message));
          return await promise;
        } else {
          if (state !== 'stopped') emit('error', message);
          throw error instanceof Error ? error : new Error(message);
        }
      } finally {
        if (checked.mode === 'experimental') closeInstance();
      }
    },
    stop() { return stop(); },
    dispose() {
      disposed = true;
      if (active) stop('The editor is closing.');
      else closeInstance();
    },
    get status() { return state; },
    get running() { return Boolean(active); }
  };
}
