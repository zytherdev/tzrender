import { PHP, loadPHPRuntime } from '@php-wasm/universal';
import { getPHPLoaderModule } from '@php-wasm/web-8-5';

function safePath(name) {
  return `/workspace/${String(name || 'main.php').replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

export function createPhpRuntime({ onOutput = () => {}, onStatus = () => {} } = {}) {
  let php = null;
  let loading = null;

  async function ensureRuntime() {
    if (php) return php;
    if (!loading) {
      loading = (async () => {
        onStatus('loading', 'Loading PHP 8.5 WebAssembly runtime…');
        const loader = await getPHPLoaderModule();
        const runtimeId = await loadPHPRuntime(loader);
        php = new PHP(runtimeId);
        php.mkdirTree('/workspace');
        onStatus('ready', 'PHP runtime ready.');
        return php;
      })().catch((error) => {
        loading = null;
        onStatus('error', error?.message || 'PHP runtime could not start.');
        throw error;
      });
    }
    return loading;
  }

  return {
    async run(name, source) {
      const instance = await ensureRuntime();
      onStatus('running', `Running ${name} in the local PHP WebAssembly runtime…`);
      const scriptPath = safePath(name);
      instance.writeFile(scriptPath, source);
      const response = await instance.runStream({ scriptPath });
      const [stdout, stderr, exitCode] = await Promise.all([
        response.stdoutText,
        response.stderrText,
        response.exitCode
      ]);
      if (stdout) onOutput('stdout', stdout);
      if (stderr) onOutput('stderr', stderr);
      if (exitCode !== 0) throw new Error(stderr || `PHP exited with code ${exitCode}.`);
      onStatus('ready', 'PHP finished in the local WebAssembly runtime.');
      return { stdout, stderr, exitCode };
    },
    stop() {
      if (!php && !loading) return false;
      try { php?.[Symbol.dispose]?.(); } catch { /* Runtime cleanup is best effort. */ }
      php = null;
      loading = null;
      onStatus('stopped', 'PHP runtime stopped.');
      return true;
    }
  };
}
