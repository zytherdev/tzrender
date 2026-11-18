import { PHP, loadPHPRuntime, withPHPIniValues } from '@php-wasm/universal';
import { getPHPLoaderModule } from '@php-wasm/web-8-5';

const WORKSPACE = '/workspace';
const STDIN_FILE = `${WORKSPACE}/stdin.txt`;

function projectPath(name) {
  if (typeof name !== 'string' || !name || name.startsWith('/') || name.includes('\\') || name.includes('\0')) {
    throw new TypeError('PHP project file names must be relative paths.');
  }
  const parts = name.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || !/^[A-Za-z0-9._-]+$/.test(part))) {
    throw new TypeError(`Invalid PHP project path: ${name}`);
  }
  return `${WORKSPACE}/${parts.join('/')}`;
}

function validateInput(input) {
  if (input === undefined || typeof input === 'string' || input instanceof Uint8Array) return input;
  throw new TypeError('PHP input must be a string or Uint8Array.');
}

function normalizeFiles(files, name, source) {
  if (files === undefined) return [{ path: projectPath(name), content: source }];
  if (!Array.isArray(files)) throw new TypeError('PHP files must be an array of {name, content} project files.');
  const staged = new Map();
  for (const file of files) {
    if (!file || typeof file !== 'object' || typeof file.content !== 'string' && !(file.content instanceof Uint8Array)) {
      throw new TypeError('Each PHP project file must have a string or Uint8Array content.');
    }
    const path = projectPath(file.name);
    if (staged.has(path)) throw new TypeError(`Duplicate PHP project path: ${file.name}`);
    staged.set(path, file.content);
  }
  const entry = projectPath(name);
  // `source` is the active editor buffer and takes precedence over a saved snapshot copy.
  staged.set(entry, source);
  return [...staged].map(([path, content]) => ({ path, content }));
}

function clearWorkspace(php) {
  if (php.isDir(WORKSPACE)) php.rmdir(WORKSPACE, { recursive: true });
  php.mkdirTree(WORKSPACE);
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
        php = new PHP(await loadPHPRuntime(loader));
        php.mkdirTree(WORKSPACE);
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
    /** Run a project file in the isolated PHP-WASM virtual filesystem. */
    async run(name, source, { input, files, mode = 'safe', packages = [] } = {}) {
      if (mode !== 'safe' && mode !== 'experimental') throw new TypeError('PHP mode must be "safe" or "experimental".');
      if (!Array.isArray(packages)) throw new TypeError('PHP packages must be an array.');
      if (packages.length) throw new Error('PHP package installation is unavailable in this offline PHP-WASM runtime; packages were not installed.');
      if (typeof source !== 'string') throw new TypeError('PHP source must be a string.');
      const normalizedInput = validateInput(input);
      const projectFiles = normalizeFiles(files, name, source);
      const scriptPath = projectPath(name);
      const instance = await ensureRuntime();
      onStatus('running', `Running ${name} in the local PHP WebAssembly runtime…`);

      try {
      // The only user-controlled filesystem content is the validated project snapshot.
      clearWorkspace(instance);
      for (const file of projectFiles) {
        const parent = file.path.slice(0, file.path.lastIndexOf('/'));
        if (parent !== WORKSPACE) instance.mkdirTree(parent);
        instance.writeFile(file.path, file.content);
      }
      if (normalizedInput !== undefined) instance.writeFile(STDIN_FILE, normalizedInput);
      // Relative include/require paths resolve from the project root; PHP also resolves
      // nested sibling includes from the including file's directory.
      instance.chdir(WORKSPACE);

      const request = { scriptPath };
      if (normalizedInput !== undefined) request.body = normalizedInput;
      const response = await withPHPIniValues(instance, {
        allow_url_fopen: '0',
        allow_url_include: '0',
        disable_functions: [
          'curl_init', 'curl_exec', 'curl_multi_init', 'fsockopen', 'pfsockopen',
          'stream_socket_client', 'stream_socket_server', 'socket_create', 'socket_connect',
          'socket_bind', 'socket_listen', 'socket_accept', 'gethostbyname', 'gethostbynamel',
          'dns_get_record'
        ].join(',')
      }, () => instance.runStream(request));
      const [stdout, stderr, exitCode] = await Promise.all([
        response.stdoutText,
        response.stderrText,
        response.exitCode
      ]);
      if (stdout) onOutput('stdout', stdout);
      if (stderr) onOutput('stderr', stderr);
      if (exitCode !== 0) throw new Error(stderr || `PHP exited with code ${exitCode}.`);
      onStatus('ready', 'PHP finished in the local PHP WebAssembly runtime.');
      return { stdout, stderr, exitCode };
      } finally {
        if (mode === 'experimental' && php === instance) {
          try { instance[Symbol.dispose]?.(); } catch { /* Experimental session cleanup is best effort. */ }
          php = null;
          loading = null;
        }
      }
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
