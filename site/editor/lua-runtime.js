import { LuaFactory } from 'wasmoon';
import luaWasmUrl from 'wasmoon/dist/glue.wasm?url';

export const MAX_SOURCE_CHARS = 100_000;
export const MAX_INPUT_CHARS = 100_000;
export const MAX_OUTPUT_CHARS = 100_000;
export const MAX_MODULES = 128;
export const MAX_MODULE_PATH_CHARS = 256;
export const MAX_MODULE_SOURCE_CHARS = 100_000;
export const MAX_MODULES_SOURCE_CHARS = 1_000_000;
export const RUN_TIMEOUT = 15_000;

const LUA_SANDBOX = `
-- Keep the editor runtime deterministic and browser-only.
if io then
  io.open = nil
  io.popen = nil
  io.input = nil
  io.output = nil
  io.read = function(...) return __tz_input(...) end
  io.write = function(...) return __tz_write(...) end
end
os = nil
dofile = nil
loadfile = nil
-- Only the in-memory preload searcher is available. There is no filesystem
-- or network-backed package searcher in this runtime.
if package then
  package.path = ''
  package.cpath = ''
  package.preload = {}
  package.searchers = { package.searchers[1] }
end
-- debug is retained only long enough for the private traceback handler below.
local __tz_traceback = debug and debug.traceback
debug = nil
`;

function validateText(value, label, limit) {
  if (typeof value !== 'string' || value.length > limit) {
    throw new Error(`${label} is limited to ${limit.toLocaleString()} characters.`);
  }
  return value;
}

function inputReader(input) {
  let offset = 0;
  return (mode = '*l') => {
    if (mode === '*a') {
      const rest = input.slice(offset);
      offset = input.length;
      return rest;
    }
    if (offset >= input.length) return undefined;
    const start = offset;
    const newline = input.indexOf('\n', offset);
    offset = newline < 0 ? input.length : newline + 1;
    const line = input.slice(start, newline < 0 ? input.length : newline);
    return mode === '*L' ? line + (newline < 0 ? '' : '\n') : line.replace(/\r$/, '');
  };
}

function luaStringLiteral(value) {
  let result = "'";
  for (const character of value) {
    const code = character.codePointAt(0);
    if (character === '\\') result += '\\\\';
    else if (character === "'") result += "\\'";
    else if (character === '\n') result += '\\n';
    else if (character === '\r') result += '\\r';
    else if (character === '\t') result += '\\t';
    else if (code < 32 || code === 127) result += `\\${String(code).padStart(3, '0')}`;
    else result += character;
  }
  return `${result}'`;
}

function moduleAliases(path) {
  const withoutExtension = path.endsWith('.lua') ? path.slice(0, -4) : path;
  const dotted = withoutExtension.replaceAll('/', '.');
  return [...new Set([path, withoutExtension, dotted])];
}

function validateModules(modules) {
  if (modules === undefined) return [];
  if (!Array.isArray(modules)) throw new Error('Lua modules must be an array.');
  if (modules.length > MAX_MODULES) {
    throw new Error(`Lua modules are limited to ${MAX_MODULES}.`);
  }

  const registered = new Set();
  let totalSource = 0;
  const result = [];
  for (const module of modules) {
    if (!module || typeof module !== 'object') throw new Error('Each Lua module must be an object.');
    const path = validateText(module.path, 'Lua module path', MAX_MODULE_PATH_CHARS);
    const source = validateText(module.source, `Lua module ${path || '<unnamed>'} source`, MAX_MODULE_SOURCE_CHARS);
    if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => part === '..')) {
      throw new Error(`Lua module path is invalid: ${path || '<empty>'}.`);
    }
    if (!/^[A-Za-z0-9_./-]+(?:\.lua)?$/.test(path) || path.endsWith('/') || path.includes('//')) {
      throw new Error(`Lua module path is invalid: ${path}.`);
    }
    totalSource += source.length;
    if (totalSource > MAX_MODULES_SOURCE_CHARS) {
      throw new Error(`Lua module sources are limited to ${MAX_MODULES_SOURCE_CHARS.toLocaleString()} characters in total.`);
    }
    const aliases = moduleAliases(path);
    if (aliases.some((alias) => registered.has(alias))) {
      throw new Error(`Lua module path is duplicated: ${path}.`);
    }
    aliases.forEach((alias) => registered.add(alias));
    result.push({ path, source, aliases });
  }
  return result;
}

function modulesBootstrap(modules) {
  return modules.map(({ path, source, aliases }) => aliases.map((alias) => `
package.preload[${luaStringLiteral(alias)}] = function(...)
  local __tz_chunk, __tz_error = load(${luaStringLiteral(source)}, ${luaStringLiteral(`@${path}`)}, 't')
  if not __tz_chunk then error(__tz_error, 0) end
  return __tz_chunk(...)
end`).join('')).join('\n');
}

function runWithTraceback(source) {
  return `
local __tz_ok, __tz_value = xpcall(function()
${source}
end, function(__tz_error)
  if __tz_traceback then return __tz_traceback(tostring(__tz_error), 2) end
  return tostring(__tz_error)
end)
if not __tz_ok then error(__tz_value, 0) end
`;
}

export function createLuaRuntime({ onOutput = () => {}, onStatus = () => {} } = {}) {
  let factory = null;
  let engine = null;
  let loading = null;
  let active = null;
  let pendingInput = '';
  let disposed = false;
  let state = 'idle';

  function emit(status, detail = '') {
    state = status;
    onStatus(status, detail);
  }

  function closeEngine() {
    try { engine?.global?.close?.(); } catch { /* cleanup is best effort */ }
    engine = null;
    loading = null;
  }

  async function ensureEngine() {
    if (disposed) throw new Error('Lua runtime has been disposed.');
    if (engine) return engine;
    if (!loading) {
      loading = (async () => {
        emit('loading', 'Loading Lua 5.4 WebAssembly runtime…');
        // Wasmoon's browser default points to unpkg, which is blocked by the
        // editor's same-origin CSP. Let Vite bundle and resolve the local asset.
        factory ||= new LuaFactory(luaWasmUrl);
        const next = await factory.createEngine({
          openStandardLibs: true,
          injectObjects: false,
          enableProxy: false,
          functionTimeout: RUN_TIMEOUT
        });
        next.global.setTimeout?.(RUN_TIMEOUT);
        engine = next;
        emit('ready', 'Lua 5.4 runtime ready.');
        return next;
      })().catch((error) => {
        loading = null;
        closeEngine();
        // A factory retains its rejected initialization promise, so replace it
        // after a load failure to allow a later run to retry.
        factory = null;
        emit('error', error?.message || 'Lua runtime could not start.');
        throw error;
      });
    }
    return loading;
  }

  function validateInput(input) {
    if (input === undefined) return '';
    return validateText(input, 'Lua input', MAX_INPUT_CHARS);
  }

  return {
    async run(name, source, { input, modules } = {}) {
      if (disposed) throw new Error('Lua runtime has been disposed.');
      validateText(source, 'Lua source', MAX_SOURCE_CHARS);
      const localModules = validateModules(modules);
      if (active) throw new Error('Lua is already running. Stop it before starting another run.');
      const providedInput = input === undefined ? pendingInput : validateInput(input);
      pendingInput = '';
      const stdin = inputReader(providedInput);
      let stdout = '';
      let outputSize = 0;
      let task;

      const writeOutput = (stream, values, separator = '') => {
        const text = values.map((value) => String(value)).join(separator);
        if (outputSize + text.length > MAX_OUTPUT_CHARS) {
          throw new Error(`Lua output is limited to ${MAX_OUTPUT_CHARS.toLocaleString()} characters.`);
        }
        outputSize += text.length;
        if (stream === 'stdout') stdout += text;
        if (text) onOutput(stream, text);
      };

      const current = await ensureEngine();
      emit('running', `Running ${name || 'main.lua'} in the local Lua 5.4 WebAssembly runtime…`);
      current.global.set('__tz_input', (mode) => stdin(mode));
      current.global.set('__tz_write', (...values) => {
        writeOutput('stdout', values);
        return true;
      });
      current.global.set('print', (...values) => {
        writeOutput('stdout', values, '\t');
        writeOutput('stdout', ['\n']);
      });

      const promise = new Promise((resolve, reject) => {
        task = { resolve, reject, settled: false };
        active = task;
      });
      try {
        await current.doString(`${LUA_SANDBOX}\n${modulesBootstrap(localModules)}\n${runWithTraceback(source)}`);
        if (!task.settled) {
          task.settled = true;
          active = null;
          emit('ready', 'Lua finished in the local Lua 5.4 WebAssembly runtime.');
          task.resolve({ stdout, stderr: '', exitCode: 0 });
        }
      } catch (error) {
        const message = error?.message || String(error);
        if (outputSize + message.length + 1 <= MAX_OUTPUT_CHARS) onOutput('stderr', message);
        if (!task.settled) {
          task.settled = true;
          active = null;
          emit('error', message);
          task.reject(error instanceof Error ? error : new Error(message));
        }
      }
      return promise;
    },
    setInput(input = '') {
      pendingInput = validateInput(input);
      return pendingInput.length;
    },
    submitInput(input = '') {
      const value = validateInput(input);
      pendingInput += value;
      if (pendingInput.length > MAX_INPUT_CHARS) throw new Error(`Lua input is limited to ${MAX_INPUT_CHARS.toLocaleString()} characters.`);
      return value.length;
    },
    stop() {
      if (!engine && !loading && !active) return false;
      const error = new Error('Lua run stopped.');
      if (active && !active.settled) {
        active.settled = true;
        active.reject(error);
        active = null;
      }
      closeEngine();
      emit('stopped', error.message);
      return true;
    },
    dispose() {
      if (disposed) return false;
      disposed = true;
      const hadRuntime = Boolean(engine || loading || active);
      if (active && !active.settled) {
        active.settled = true;
        active.reject(new Error('The Lua runtime was disposed.'));
        active = null;
      }
      closeEngine();
      if (hadRuntime) emit('stopped', 'Lua runtime disposed.');
      return hadRuntime;
    },
    get running() { return Boolean(active); },
    get status() { return disposed ? 'disposed' : state; }
  };
}
