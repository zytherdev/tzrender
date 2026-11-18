import '@live-codes/java-wasm';

const JAVA_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const JAVA_QUALIFIED_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
const JAVA_PATH = /^(?:[A-Za-z_$][A-Za-z0-9_$]*\/)*[A-Za-z_$][A-Za-z0-9_$]*(?:\.java)?$/;
const MAX_JAVA_FILES = 100;
const MAX_JAVA_PROJECT_CHARS = 500_000;

function javaBaseUrl() {
  return new URL('/java-wasm/', window.location.href).href;
}

function deriveMainClass(name, source = '') {
  const value = String(name ?? '').replaceAll('\\', '/');
  if (!JAVA_PATH.test(value)) {
    throw new Error('Java file names must be a simple class name or a relative path ending in a valid class name.');
  }
  const fileName = value.split('/').at(-1).replace(/\.java$/, '');
  if (!JAVA_IDENTIFIER.test(fileName)) {
    throw new Error(`Invalid Java main class name: ${fileName}.`);
  }
  const packageName = String(source).replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (part) => part.replace(/[^\r\n]/g, ' '))
    .match(/^\s*package\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/m)?.[1];
  return packageName ? `${packageName}.${fileName}` : fileName;
}

function resolveMainClass(name, options, source) {
  const derived = deriveMainClass(name, source);
  const requested = options?.mainClass;
  if (requested === undefined) return derived;
  if (typeof requested !== 'string' || !JAVA_QUALIFIED_IDENTIFIER.test(requested)) {
    throw new Error(`Invalid Java main class name: ${requested}.`);
  }
  const packageName = derived.includes('.') ? derived.slice(0, derived.lastIndexOf('.')) : '';
  return packageName && JAVA_IDENTIFIER.test(requested) ? `${packageName}.${requested}` : requested;
}

function combineLocalJavaSources(entryName, source, files) {
  if (files === undefined) return source;
  if (!Array.isArray(files) || files.length > MAX_JAVA_FILES) throw new Error(`Java projects are limited to ${MAX_JAVA_FILES} files.`);
  const entries = new Map();
  let total = 0;
  for (const file of files) {
    if (!file || typeof file.name !== 'string' || typeof file.content !== 'string') throw new Error('Java project files must have a name and string content.');
    if (!file.name.endsWith('.java')) continue;
    const path = file.name.replaceAll('\\', '/');
    if (!JAVA_PATH.test(path) || path.split('/').some((part) => part === '.' || part === '..')) throw new Error(`Invalid Java project path: ${file.name}`);
    total += file.content.length;
    if (total > MAX_JAVA_PROJECT_CHARS) throw new Error(`Java project files are limited to ${MAX_JAVA_PROJECT_CHARS.toLocaleString()} characters.`);
    if (!entries.has(path)) entries.set(path, file.content);
  }
  const entry = entryName.replaceAll('\\', '/');
  entries.set(entry, source);
  const packageOf = (text) => text.match(/^\s*package\s+([A-Za-z_$][\w$.]*)\s*;/m)?.[1] || '';
  const declarations = (text) => [...text.matchAll(/\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/g)].map((match) => match[1]);
  const activePackage = packageOf(source);
  const included = new Set([entry]);
  let combined = source;
  let changed = true;
  while (changed) {
    changed = false;
    for (const [path, text] of entries) {
      if (included.has(path)) continue;
      const classNames = declarations(text);
      const importNames = [...combined.matchAll(/^\s*import\s+(?:static\s+)?([A-Za-z_$][\w$.]*)(?:\.\*)?\s*;/gm)].map((match) => match[1]);
      const referenced = classNames.some((className) => new RegExp(`\\b${className}\\b`).test(combined))
        || importNames.some((item) => classNames.some((className) => item.endsWith(`.${className}`)));
      if (!referenced) continue;
      const declaredPackage = packageOf(text);
      if (declaredPackage !== activePackage) {
        throw new Error(`Java local import '${path}' uses package '${declaredPackage || '(default)'}', but this runtime can only combine source files in the same package. Multi-package classpaths are not supported by the current Java WASM compiler.`);
      }
      included.add(path);
      combined += `\n${text}`;
      changed = true;
    }
  }
  const includedSources = [...included].map((path) => ({ path, text: entries.get(path) || '' }));
  const localTypeNames = new Set(includedSources.filter(({ path }) => path !== entry).flatMap(({ text }) => declarations(text)));
  const imports = [...new Set(includedSources.flatMap(({ text }) => [...text.matchAll(/^\s*import\s+([^;]+);/gm)].map((match) => match[1].trim())))]
    .filter((item) => ![...localTypeNames].some((name) => item.endsWith(`.${name}`)));
  const bodies = includedSources.map(({ path, text }) => {
    let body = text.replace(/^\s*package\s+[A-Za-z_$][\w$.]*\s*;\s*/gm, '')
      .replace(/^\s*import\s+[^;]+;\s*/gm, '');
    if (path !== entry) body = body.replace(/\bpublic\s+(?=(?:(?:abstract|final|sealed|non-sealed|static)\s+)*(?:class|interface|enum|record)\b)/g, '');
    return body;
  });
  return `${activePackage ? `package ${activePackage};\n` : ''}${imports.map((item) => `import ${item};`).join('\n')}\n${bodies.join('\n')}`;
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
      if (typeof source !== 'string') throw new TypeError('Java source must be a string.');
      if (options === null || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('Java run options must be an object.');
      }
      const mainClass = resolveMainClass(name, options, source);
      if (options.input !== undefined && typeof options.input !== 'string') {
        throw new TypeError('Java run input must be a string.');
      }
      const mode = options.mode ?? 'safe';
      if (mode !== 'safe' && mode !== 'experimental') throw new TypeError('Java mode must be "safe" or "experimental".');
      if (options.packages !== undefined && !Array.isArray(options.packages)) throw new TypeError('Java packages must be an array.');
      if (options.packages?.length) throw new Error('Java package installation is unavailable in this single-source WebAssembly runtime; packages were not installed.');
      const compilationSource = combineLocalJavaSources(name, source, options.files);
      const engine = await ensureRuntime();
      setStatus('running', `Running ${name} in the local Java WebAssembly runtime…`);
      try {
        const result = await engine.run(compilationSource, {
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
      } finally {
        if (mode === 'experimental') destroy();
      }
    },
    stop: destroy,
    destroy,
    get status() {
      return state;
    }
  };
}
