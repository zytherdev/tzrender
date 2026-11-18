import { MemoryFileSystem, ZeroPerl } from '@6over3/zeroperl-ts';
import wasmUrl from '@6over3/zeroperl-ts/zeroperl.wasm?url';
const MAX_OUTPUT_CHARS = 100_000;
const MAX_MESSAGE_CHARS = 12_000;
const ROOT = '/workspace';
let instance = null;
let fileSystem = null;
let safeFiles = [];
let busy = false;
let currentRun = 0;
function send(type, runId, extra = {}) { self.postMessage({ type, runId, ...extra }); }
function pathOf(name) { return `${ROOT}/${name}`; }
async function createInstance(snapshot, runId) {
  // ZeroPerl's browser detector checks for both window and document, which do
  // not normally exist in DedicatedWorkerGlobalScope. This marker keeps its
  // WASM loader on the supported fetch path instead of importing node:fs.
  globalThis.window ??= self;
  globalThis.document ??= {};
  const fs = new MemoryFileSystem({ '/': '' });
  for (const { name, content } of snapshot) fs.addFile(pathOf(name), content);
  const loaded = await ZeroPerl.create({
    fileSystem: fs,
    fetch: async () => { const response = await fetch(wasmUrl); if (!response.ok) throw new Error(`Unable to load ZeroPerl WebAssembly (${response.status}).`); return response; },
    stdout: (chunk) => write('stdout', chunk, runId),
    stderr: (chunk) => write('stderr', chunk, runId)
  });
  return { loaded, fs };
}
let outputCount = 0;
function write(stream, chunk, runId) {
  if (runId !== currentRun || outputCount >= MAX_OUTPUT_CHARS) return;
  const text = typeof chunk === 'string' ? chunk : chunk instanceof Uint8Array ? new TextDecoder().decode(chunk) : String(chunk ?? '');
  const accepted = text.slice(0, MAX_OUTPUT_CHARS - outputCount);
  for (let offset = 0; offset < accepted.length; offset += MAX_MESSAGE_CHARS) {
    send('output', runId, { stream, text: accepted.slice(offset, offset + MAX_MESSAGE_CHARS) });
  }
  outputCount += accepted.length;
  if (accepted.length < text.length) send('error', runId, { text: 'Perl output exceeded the 100,000 character limit.' });
}
function cleanError(error) { return String(error?.perlError || error?.stack || error?.message || error || 'Perl execution failed.').slice(0, MAX_MESSAGE_CHARS); }
async function run(message) {
  const { runId, mode, name, source, files } = message;
  if (busy) { send('error', runId, { text: 'Perl worker is already running.' }); return; }
  busy = true; currentRun = runId; outputCount = 0;
  try {
    if (!Array.isArray(files) || files.length > 200) throw new Error('Invalid Perl file snapshot.');
    send('loading', runId, { text: mode === 'experimental' ? 'Creating a fresh Perl runtime…' : 'Loading the Perl 5 WebAssembly runtime…' });
    if (mode === 'experimental' && instance) { instance.dispose(); instance = null; fileSystem = null; safeFiles = []; }
    if (!instance) {
      const created = await createInstance(files, runId);
      if (currentRun !== runId) { created.loaded.dispose(); return; }
      instance = created.loaded; fileSystem = created.fs; safeFiles = files.map(({ name: file }) => pathOf(file));
    } else {
      for (const path of safeFiles) fileSystem.removeFile(path);
      for (const { name: file, content } of files) fileSystem.addFile(pathOf(file), content);
      safeFiles = files.map(({ name: file }) => pathOf(file));
    }
    if (currentRun !== runId) return;
    send('started', runId);
    const result = await instance.runFile(pathOf(name));
    if (currentRun !== runId) return;
    instance.flush();
    if (!result.success) throw new Error(cleanError(result.error || instance.getLastError?.() || `Perl exited with code ${result.exitCode}.`));
    send('complete', runId, { exitCode: result.exitCode });
  } catch (error) {
    if (currentRun === runId) send('error', runId, { text: cleanError(error) });
  } finally {
    if (currentRun === runId) {
      busy = false;
      if (mode === 'experimental') { try { instance?.dispose(); } catch {} instance = null; fileSystem = null; safeFiles = []; }
    }
  }
}
self.addEventListener('message', ({ data }) => {
  if (!data) return;
  if (data.type === 'stop') { currentRun = 0; busy = false; try { instance?.dispose(); } catch {} instance = null; fileSystem = null; safeFiles = []; return; }
  if (data.type === 'run') void run(data);
});
