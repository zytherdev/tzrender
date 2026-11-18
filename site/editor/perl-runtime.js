import PerlWorker from './perl.worker.js?worker';
export const MAX_SOURCE_CHARS = 100_000;
export const MAX_FILES = 200;
export const MAX_FILE_CHARS = 100_000;
export const MAX_PROJECT_CHARS = 1_000_000;
export const MAX_PATH_CHARS = 512;
export const MAX_OUTPUT_CHARS = 100_000;
const LOAD_TIMEOUT = 90_000, RUN_TIMEOUT = 15_000, MAX_MESSAGE_CHARS = 12_000;
function projectPath(name) {
  if (typeof name !== 'string' || name.length > MAX_PATH_CHARS) throw new Error(`Perl project file name is limited to ${MAX_PATH_CHARS.toLocaleString()} characters.`);
  if (!name || name.startsWith('/') || name.includes('\\') || name.includes('\0') || name.split('/').some((part) => !part || part === '.' || part === '..' || !/^[A-Za-z0-9._-]+$/.test(part))) throw new Error(`Invalid Perl project path: ${name || '<empty>'}`);
  return name;
}
function normalizeFiles(files, entryName, source) {
  if (!Array.isArray(files)) throw new Error('Perl project files must be an array of {name, content} files.');
  if (files.length > MAX_FILES) throw new Error(`Perl projects are limited to ${MAX_FILES} files.`);
  if (typeof source !== 'string' || source.length > MAX_SOURCE_CHARS) throw new Error(`Perl source is limited to ${MAX_SOURCE_CHARS.toLocaleString()} characters.`);
  const staged = new Map(); let total = 0;
  for (const file of files) {
    if (!file || typeof file !== 'object' || Array.isArray(file) || typeof file.content !== 'string') throw new Error('Each Perl project file must have a name and string content.');
    const name = projectPath(file.name);
    if (file.content.length > MAX_FILE_CHARS) throw new Error(`Perl project file '${name}' content is limited to ${MAX_FILE_CHARS.toLocaleString()} characters.`);
    if (staged.has(name)) throw new Error(`Duplicate Perl project path: ${name}`);
    total += file.content.length; staged.set(name, file.content);
  }
  const entry = projectPath(entryName); total += source.length - (staged.has(entry) ? staged.get(entry).length : 0);
  if (total > MAX_PROJECT_CHARS) throw new Error(`Perl project files are limited to ${MAX_PROJECT_CHARS.toLocaleString()} characters in total.`);
  staged.set(entry, source); return [...staged].map(([name, content]) => ({ name, content }));
}
const clip = (text) => String(text ?? '').slice(0, MAX_MESSAGE_CHARS);
export function createPerlRuntime({ onOutput = () => {}, onStatus = () => {} } = {}) {
  let worker = null, workerMode = null, sequence = 0, active = null, state = 'idle';
  function status(next, detail = '') { state = next; onStatus(next, detail); }
  function clearTimers(task) { clearTimeout(task?.loadTimer); clearTimeout(task?.runTimer); }
  function settle(task, error = null, result = null) {
    if (!task || active !== task) return;
    clearTimers(task); active = null;
    if (task.mode === 'experimental' && worker) { worker.terminate(); worker = null; workerMode = null; }
    status(error ? 'error' : 'ready', error?.message || 'Perl run finished.');
    if (error) task.reject(error); else task.resolve(result);
  }
  function terminate(reason, next = 'error') {
    const task = active;
    if (worker) { try { worker.postMessage({ type: 'stop', runId: task?.id ?? 0 }); } catch {} worker.terminate(); worker = null; workerMode = null; }
    if (task) { clearTimers(task); active = null; task.reject(new Error(reason)); }
    status(next, reason);
  }
  function ensureWorker(mode) {
    if (worker && workerMode !== mode) { worker.terminate(); worker = null; }
    if (worker) return worker;
    worker = new PerlWorker(); workerMode = mode;
    worker.addEventListener('message', ({ data: msg }) => {
      if (!msg || !active || msg.runId !== active.id) return;
      if (msg.type === 'loading') { status('loading', clip(msg.text) || 'Loading Perl WebAssembly…'); return; }
      if (msg.type === 'started') {
        clearTimeout(active.loadTimer);
        active.runTimer = setTimeout(() => terminate('Perl execution exceeded 15 seconds; the worker was terminated.'), RUN_TIMEOUT);
        status('running', 'Running Perl 5 in a dedicated Web Worker.'); return;
      }
      if (msg.type === 'output') {
        if (msg.stream !== 'stdout' && msg.stream !== 'stderr') return;
        const incoming = String(msg.text ?? ''), accepted = incoming.slice(0, Math.max(0, MAX_OUTPUT_CHARS - active.outputTotal));
        active.outputTotal += accepted.length; active.output[msg.stream] += accepted;
        if (accepted) onOutput(msg.stream, accepted);
        if (incoming.length > accepted.length) terminate(`Perl output is limited to ${MAX_OUTPUT_CHARS.toLocaleString()} characters.`);
        return;
      }
      if (msg.type === 'complete') settle(active, null, { stdout: active.output.stdout, stderr: active.output.stderr, exitCode: Number.isInteger(msg.exitCode) ? msg.exitCode : 0 });
      else if (msg.type === 'error') settle(active, new Error(clip(msg.text) || 'Perl execution failed.'));
    });
    worker.addEventListener('error', (event) => { event.preventDefault?.(); terminate(clip(event.message) || 'Perl worker stopped unexpectedly.'); });
    return worker;
  }
  return {
    run(name, source, { files = [], mode = 'safe', packages = [] } = {}) {
      if (mode !== 'safe' && mode !== 'experimental') return Promise.reject(new Error("Perl mode must be 'safe' or 'experimental'."));
      if (!Array.isArray(packages)) return Promise.reject(new Error('Perl packages must be an array of package names.'));
      if (packages.some((item) => typeof item !== 'string' || !item.trim())) return Promise.reject(new Error('Perl packages must contain non-empty package names.'));
      if (packages.length) return Promise.reject(new Error('Perl package installation is unavailable in this offline ZeroPerl WASI runtime; CPAN packages were not installed.'));
      if (active) return Promise.reject(new Error('Perl is already running. Stop it before starting another run.'));
      let snapshot; try { snapshot = normalizeFiles(files, name, source); } catch (error) { return Promise.reject(error); }
      let current; try { current = ensureWorker(mode); } catch (error) { return Promise.reject(error); }
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const task = active = { id, mode, resolve, reject, output: { stdout: '', stderr: '' }, outputTotal: 0, loadTimer: 0, runTimer: 0 };
        status('loading', 'Starting the local Perl 5 WebAssembly runtime…');
        task.loadTimer = setTimeout(() => terminate('Perl runtime initialization timed out; the worker was terminated.'), LOAD_TIMEOUT);
        try { current.postMessage({ type: 'run', runId: id, name, source, files: snapshot, mode }); }
        catch (error) { settle(task, new Error(clip(error?.message) || 'Unable to start Perl worker.')); }
      });
    },
    stop() { if (!worker && !active) return false; terminate('Perl run stopped.', 'stopped'); return true; },
    get status() { return state; }, get running() { return Boolean(active); }
  };
}
