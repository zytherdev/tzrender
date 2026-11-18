import '@live-codes/java-wasm';

function javaBaseUrl() {
  return new URL('/java-wasm/', window.location.href).href;
}

export function createJavaRuntime({ onOutput = () => {}, onStatus = () => {} } = {}) {
  let runtime = null;
  let loading = null;

  async function ensureRuntime() {
    if (runtime) return runtime;
    if (!loading) {
      loading = (async () => {
        onStatus('loading', 'Loading the Java compiler and WebAssembly runtime…');
        if (!globalThis.JavaWasm?.createRuntime) throw new Error('Java WebAssembly runtime is unavailable.');
        runtime = await globalThis.JavaWasm.createRuntime({
          baseUrl: javaBaseUrl(),
          onProgress: ({ detail }) => onStatus('loading', detail)
        });
        onStatus('ready', 'Java runtime ready.');
        return runtime;
      })().catch((error) => {
        loading = null;
        onStatus('error', error?.message || 'Java runtime could not start.');
        throw error;
      });
    }
    return loading;
  }

  return {
    async run(name, source) {
      const engine = await ensureRuntime();
      onStatus('running', `Running ${name} in the local Java WebAssembly runtime…`);
      const result = await engine.run(source);
      if (result.stdout) onOutput('stdout', result.stdout);
      if (result.stderr) onOutput('stderr', result.stderr);
      if (!result.ok) throw new Error(result.error || result.stderr || `Java exited with code ${result.exitCode}.`);
      onStatus('ready', 'Java finished in the local WebAssembly runtime.');
      return result;
    },
    stop() {
      if (!runtime && !loading) return false;
      try { runtime?.destroy(); } catch { /* Runtime cleanup is best effort. */ }
      runtime = null;
      loading = null;
      onStatus('stopped', 'Java runtime stopped.');
      return true;
    }
  };
}
