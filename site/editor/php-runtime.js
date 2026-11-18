import { PHP, loadPHPRuntime } from '@php-wasm/universal';
import { getPHPLoaderModule } from '@php-wasm/web-8-5';

const STDIN_FILE = '/workspace/stdin.txt';

function safePath(name) {
  return `/workspace/${String(name || 'main.php').replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

function validateInput(input) {
  if (input === undefined || typeof input === 'string' || input instanceof Uint8Array) {
    return input;
  }
  throw new TypeError('PHP input must be a string or Uint8Array.');
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
    /**
     * Execute a PHP file in the shared /workspace filesystem.
     *
     * `input` is written to `/workspace/stdin.txt` for scripts that need a
     * stable CLI-compatible input file. The installed @php-wasm/universal
     * PHPRunOptions contract has no `stdin` option, so the same value is also
     * passed through its documented `body` option and is available to PHP as
     * `php://input`. PHP code that specifically reads STDIN may therefore use
     * `file_get_contents('/workspace/stdin.txt')`; this avoids blocking on a
     * prompt when the WASM runtime cannot attach a process stdin stream.
     *
     * @param {string} name Workspace filename (sanitized before use).
     * @param {string} source PHP source code.
     * @param {{ input?: string|Uint8Array }} options Optional request body/input.
     * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
     */
    async run(name, source, { input } = {}) {
      const normalizedInput = validateInput(input);
      const instance = await ensureRuntime();
      onStatus('running', `Running ${name} in the local PHP WebAssembly runtime…`);
      const scriptPath = safePath(name);
      instance.writeFile(scriptPath, source);

      const request = { scriptPath };
      if (normalizedInput !== undefined) {
        instance.writeFile(STDIN_FILE, normalizedInput);
        request.body = normalizedInput;
      }

      const response = await instance.runStream(request);
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
