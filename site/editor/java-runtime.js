import '@live-codes/java-wasm';

const JAVA_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const JAVA_PATH = /^(?:[A-Za-z_$][A-Za-z0-9_$]*\/)*[A-Za-z_$][A-Za-z0-9_$]*(?:\.java)?$/;

function javaBaseUrl() {
  return new URL('/java-wasm/', window.location.href).href;
}

function deriveMainClass(name) {
  const value = String(name ?? '').replaceAll('\\', '/');
  if (!JAVA_PATH.test(value)) {
    throw new Error('Java file names must be a simple class name or a relative path ending in a valid class name.');
  }
  const fileName = value.split('/').at(-1).replace(/\.java$/, '');
  if (!JAVA_IDENTIFIER.test(fileName)) {
    throw new Error(`Invalid Java main class name: ${fileName}.`);
  }
  return fileName;
}

function resolveMainClass(name, options) {
  const derived = deriveMainClass(name);
  const requested = options?.mainClass;
  if (requested === undefined) return derived;
  if (typeof requested !== 'string' || !JAVA_IDENTIFIER.test(requested)) {
    throw new Error(`Invalid Java main class name: ${requested}.`);
  }
  return requested;
}

// The JavaWasm API preloads input into System.in for each execution. It does not
// provide a live interactive stdin channel while the program is running.
export function createJavaRuntime({ onOutput = () => {}, onStatus = () => {} } = {}) {
  let runtime = null;
  let loading = null;
  let state = 'idle';
  let lifecycle = 0;

  function setStatus(nextState, detail) {
    state = nextState;
    onStatus(nextState, detail);
  }

  async function ensureRuntime() {
    if (runtime) return runtime;
    if (!loading) {
      const currentLifecycle = lifecycle;
      loading = (async () => {
        setStatus('loading', 'Loading the Java compiler and WebAssembly runtime…');
        if (!globalThis.JavaWasm?.createRuntime) throw new Error('Java WebAssembly runtime is unavailable.');
        const created = await globalThis.JavaWasm.createRuntime({
          baseUrl: javaBaseUrl(),
          onProgress: ({ detail }) => setStatus('loading', detail)
        });
        if (currentLifecycle !== lifecycle) {
          try { created.destroy?.(); } catch { /* Runtime cleanup is best effort. */ }
          throw new Error('Java runtime was stopped while it was loading.');
        }
        runtime = created;
        setStatus('ready', 'Java runtime ready.');
        return runtime;
      })().catch((error) => {
        if (currentLifecycle === lifecycle) {
          loading = null;
          setStatus('error', error?.message || 'Java runtime could not start.');
        }
        throw error;
      });
    }
    return loading;
  }

  function destroy() {
    if (!runtime && !loading) return false;
    lifecycle += 1;
    try { runtime?.destroy?.(); } catch { /* Runtime cleanup is best effort. */ }
    runtime = null;
    loading = null;
    setStatus('stopped', 'Java runtime stopped.');
    return true;
  }

  return {
    async run(name, source, options = {}) {
      const mainClass = resolveMainClass(name, options);
      if (typeof source !== 'string') throw new TypeError('Java source must be a string.');
      if (options === null || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('Java run options must be an object.');
      }
      if (options.input !== undefined && typeof options.input !== 'string') {
        throw new TypeError('Java run input must be a string.');
      }
      const engine = await ensureRuntime();
      setStatus('running', `Running ${name} in the local Java WebAssembly runtime…`);
      const result = await engine.run(source, {
        input: options.input ?? '',
        mainClass
      });
      if (result.stdout) onOutput('stdout', result.stdout);
      if (result.stderr) onOutput('stderr', result.stderr);
      if (!result.ok) {
        setStatus('error', result.error || result.stderr || `Java exited with code ${result.exitCode}.`);
        throw new Error(result.error || result.stderr || `Java exited with code ${result.exitCode}.`);
      }
      setStatus('ready', 'Java finished in the local WebAssembly runtime.');
      return { ...result, stdout: result.stdout || '', stderr: result.stderr || '', exitCode: result.exitCode };
    },
    stop: destroy,
    destroy,
    get status() {
      return state;
    }
  };
}
