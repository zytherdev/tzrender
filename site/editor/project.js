export const STORAGE_KEY = 'tzrender-editor-v2';
export const LEGACY_STORAGE_KEY = 'tzrender-editor-v1';
export const MAX_FILE_CHARS = 100_000;
export const MAX_PROJECT_CHARS = 1_000_000;
export const MAX_PROJECT_FILES = 32;
export const MAX_FILE_NAME = 64;

const LEGACY_FILE_NAMES = { html: 'index.html', css: 'styles.css', js: 'script.js' };
const FILE_NAME_PATTERN = /^(?!\.{1,2}$)[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;

export const FILE_TYPES = {
  html: { language: 'html', icon: '5', category: 'markup', runnable: true },
  htm: { language: 'html', icon: '5', category: 'markup', runnable: true },
  css: { language: 'css', icon: '#', category: 'styles', runnable: true },
  js: { language: 'javascript', icon: 'JS', category: 'script', runnable: true },
  mjs: { language: 'javascript', icon: 'JS', category: 'script', runnable: true },
  cjs: { language: 'javascript', icon: 'JS', category: 'script', runnable: false },
  ts: { language: 'typescript', icon: 'TS', category: 'script', runnable: true },
  tsx: { language: 'typescript', icon: 'TS', category: 'script', runnable: false },
  jsx: { language: 'javascript', icon: 'JS', category: 'script', runnable: false },
  py: { language: 'python', icon: 'Py', category: 'script', runnable: true },
  php: { language: 'php', icon: 'PHP', category: 'php', runnable: true },
  java: { language: 'java', icon: 'J', category: 'java', runnable: true },
  json: { language: 'json', icon: '{}', category: 'data', runnable: true },
  md: { language: 'markdown', icon: 'M↓', category: 'document', runnable: true },
  markdown: { language: 'markdown', icon: 'M↓', category: 'document', runnable: true },
  yaml: { language: 'yaml', icon: 'Y', category: 'data', runnable: true },
  yml: { language: 'yaml', icon: 'Y', category: 'data', runnable: true },
  txt: { language: 'plaintext', icon: 'T', category: 'document', runnable: true },
  xml: { language: 'xml', icon: '<>', category: 'markup', runnable: false }
};

const LANDING_FILES = [
  {
    name: 'index.html',
    content: `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>My first website</title>\n</head>\n<body>\n  <main class="card">\n    <p class="eyebrow">YOUR FIRST BUILD</p>\n    <h1>Hello, web.</h1>\n    <p>Change this page and watch your idea come alive.</p>\n    <button id="helloButton" type="button">Try the button</button>\n  </main>\n</body>\n</html>`
  },
  {
    name: 'styles.css',
    content: `:root {\n  color-scheme: light;\n  font-family: system-ui, sans-serif;\n  color: #28233b;\n  background: #f3f0fc;\n}\n\n* { box-sizing: border-box; }\n\nbody { min-height: 100vh; display: grid; place-items: center; margin: 0; padding: 2rem; }\n.card { width: min(100%, 34rem); padding: 2.5rem; border: 1px solid #e2dcf2; border-radius: 1.5rem; background: white; box-shadow: 0 1.5rem 4rem #2b20541a; }\n.eyebrow { color: #7456dc; font-size: .75rem; font-weight: 800; letter-spacing: .12em; }\nh1 { margin: .4rem 0; font-size: clamp(2rem, 8vw, 3.2rem); letter-spacing: -.07em; }\n.card > p:not(.eyebrow) { color: #625d70; line-height: 1.7; }\nbutton { padding: .8rem 1rem; border: 0; border-radius: .7rem; color: white; background: #7456dc; font: inherit; font-weight: 700; cursor: pointer; }\nbutton:hover { background: #5c40c2; }`
  },
  {
    name: 'script.js',
    content: `const button = document.querySelector('#helloButton');\n\nbutton.addEventListener('click', () => {\n  console.log('Your first interaction works!');\n  button.textContent = 'You made it work!';\n});`
  }
];

const PROFILE_FILES = [
  {
    name: 'index.html',
    content: `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>A little about me</title>\n</head>\n<body>\n  <main class="profile-card">\n    <div class="avatar" aria-hidden="true">JD</div>\n    <p class="eyebrow">A LITTLE ABOUT ME</p>\n    <h1>Jordan Developer</h1>\n    <p class="bio">I am learning to build friendly things for the web.</p>\n    <button id="likeButton" type="button">Say hello</button>\n    <p id="message" aria-live="polite"></p>\n  </main>\n</body>\n</html>`
  },
  {
    name: 'styles.css',
    content: `* { box-sizing: border-box; }\n:root { font-family: system-ui, sans-serif; color: #242037; background: #f0edf9; }\nbody { min-height: 100vh; display: grid; place-items: center; margin: 0; padding: 1.5rem; }\n.profile-card { width: min(100%, 25rem); padding: 2rem; border: 1px solid #e1dced; border-radius: 1.4rem; background: #fff; box-shadow: 0 1.5rem 4rem #24194a16; }\n.avatar { display: grid; width: 3.5rem; height: 3.5rem; place-items: center; margin-bottom: 1.2rem; border-radius: 1.2rem; color: #fff; background: #8067f7; font-weight: 800; }\n.eyebrow { color: #8067f7; font-size: .7rem; font-weight: 800; letter-spacing: .14em; }\nh1 { margin: .25rem 0; font-size: 1.8rem; letter-spacing: -.06em; }\n.bio { color: #696477; line-height: 1.65; }\nbutton { padding: .75rem 1rem; border: 0; border-radius: .7rem; color: #fff; background: #8067f7; font: inherit; font-weight: 700; cursor: pointer; }\n#message { min-height: 1.5rem; margin-bottom: 0; color: #477e6b; }`
  },
  {
    name: 'script.js',
    content: `document.querySelector('#likeButton').addEventListener('click', () => {\n  document.querySelector('#message').textContent = 'Thanks for stopping by!';\n  console.log('Hello from the profile card.');\n});`
  }
];

export const STARTERS = {
  landing: { name: 'My first website', files: LANDING_FILES },
  profile: { name: 'Profile card', files: PROFILE_FILES },
  typescript: {
    name: 'TypeScript starter',
    files: [
      ...LANDING_FILES.slice(0, 2),
      { name: 'app.ts', content: `const button = document.querySelector<HTMLButtonElement>('#helloButton');\n\nbutton?.addEventListener('click', () => {\n  console.log('TypeScript compiled in your browser.');\n  button.textContent = 'Typed, compiled, running!';\n});` }
    ]
  },
  python: {
    name: 'Python starter',
    files: [
      { name: 'README.md', content: '# Python starter\n\nRun `main.py` with the **Run Python** button or enter `python main.py` in the project terminal.\n\nPython executes in a browser worker using the standard library. Package installs, network access and interactive `input()` are not available.' },
      { name: 'main.py', content: `from datetime import date\n\nname = "web builder"\nprint(f"Hello, {name}!")\nprint(f"Today is {date.today():%A}.")` },
      { name: 'index.html', content: `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Python project</title>\n</head>\n<body>\n  <main>\n    <h1>Python runs in the Terminal</h1>\n    <p>Select <code>main.py</code> and press <strong>Run Python</strong> to see its output.</p>\n  </main>\n</body>\n</html>` }
    ]
  },
  blank: {
    name: 'Untitled project',
    files: [
      { name: 'index.html', content: `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Untitled project</title>\n</head>\n<body>\n  <!-- Build your page here. -->\n</body>\n</html>` },
      { name: 'styles.css', content: `/* Add your styles here. */\nbody { font-family: system-ui, sans-serif; }` },
      { name: 'script.js', content: `// Add your interactions here.\nconsole.log('Ready to build.');` }
    ]
  }
};

export function getFileType(name = '') {
  const extension = String(name).split('.').pop()?.toLowerCase() || '';
  return FILE_TYPES[extension] || { language: 'plaintext', icon: 'T', category: 'document', runnable: false };
}

export function isSafeFileName(name) {
  return typeof name === 'string'
    && name.length <= MAX_FILE_NAME
    && FILE_NAME_PATTERN.test(name)
    && Object.hasOwn(FILE_TYPES, name.split('.').pop()?.toLowerCase() || '');
}

function cleanProjectFiles(files) {
  const entries = Array.isArray(files)
    ? files.map((file) => [file?.name, file?.content])
    : Object.entries(files || {}).map(([name, content]) => [name, content]);
  if (entries.length < 1 || entries.length > MAX_PROJECT_FILES) throw new Error(`A project must contain between 1 and ${MAX_PROJECT_FILES} files.`);
  const seen = new Set();
  const cleaned = [];
  let total = 0;
  for (const [name, content] of entries) {
    if (!isSafeFileName(name)) throw new Error(`Unsupported or unsafe file name: ${String(name).slice(0, 80)}`);
    if (seen.has(name.toLowerCase())) throw new Error(`Duplicate file name: ${name}`);
    if (typeof content !== 'string' || content.length > MAX_FILE_CHARS) throw new Error(`${name} is larger than ${MAX_FILE_CHARS.toLocaleString()} characters or is not text.`);
    total += content.length;
    if (total > MAX_PROJECT_CHARS) throw new Error(`Projects are limited to ${MAX_PROJECT_CHARS.toLocaleString()} total characters.`);
    seen.add(name.toLowerCase());
    cleaned.push({ name, content });
  }
  return cleaned;
}

export function normalizeProject(value, fallbackName = 'Imported project') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The project file is not a valid object.');
  if (value.format && value.format !== 'tzrender-project') throw new Error('This file is not a tzrender project.');
  const source = value.files;
  if (!source || typeof source !== 'object') throw new Error('The project has no files.');
  let files;
  if (Array.isArray(source)) files = cleanProjectFiles(source);
  else {
    const mapped = Object.entries(source).map(([key, content]) => {
      const name = Object.hasOwn(LEGACY_FILE_NAMES, key) ? LEGACY_FILE_NAMES[key] : key;
      return [name, content];
    });
    files = cleanProjectFiles(mapped);
  }
  return {
    projectName: typeof value.projectName === 'string' ? value.projectName.trim().slice(0, 48) || fallbackName : fallbackName,
    starter: Object.hasOwn(STARTERS, value.starter) ? value.starter : 'blank',
    activeFile: files.some((file) => file.name === value.activeFile) ? value.activeFile : files.find((file) => file.name === 'index.html')?.name || files[0].name,
    files
  };
}

export function loadSavedProject(storage = globalThis.localStorage) {
  for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    try {
      const raw = storage?.getItem(key);
      if (!raw || raw.length > MAX_PROJECT_CHARS * 2) continue;
      const parsed = JSON.parse(raw);
      if (key === STORAGE_KEY && parsed.version !== 2) continue;
      if (key === LEGACY_STORAGE_KEY && parsed.version !== 1) continue;
      const sourceFiles = key === LEGACY_STORAGE_KEY
        ? Object.fromEntries(Object.entries(LEGACY_FILE_NAMES).map(([oldKey, name]) => [name, parsed.files?.[oldKey]]))
        : parsed.files;
      return normalizeProject({
        format: 'tzrender-project',
        projectName: parsed.projectName,
        starter: parsed.starter,
        activeFile: parsed.activeFile,
        files: sourceFiles
      });
    } catch {
      // A corrupt or obsolete draft never prevents the editor from opening.
    }
  }
  return null;
}

export function serializeProject({ projectName, starter, activeFile, files }) {
  const cleanFiles = cleanProjectFiles(files);
  return JSON.stringify({
    format: 'tzrender-project',
    version: 2,
    projectName: String(projectName || 'Untitled project').trim().slice(0, 48) || 'Untitled project',
    starter: Object.hasOwn(STARTERS, starter) ? starter : 'blank',
    activeFile: cleanFiles.some((file) => file.name === activeFile) ? activeFile : cleanFiles[0].name,
    files: cleanFiles,
    savedAt: new Date().toISOString()
  });
}

export function createStarterProject(starter = 'landing') {
  const selected = STARTERS[starter] || STARTERS.landing;
  return {
    projectName: selected.name,
    starter: Object.hasOwn(STARTERS, starter) ? starter : 'landing',
    activeFile: selected.files.find((file) => file.name === 'index.html')?.name || selected.files[0].name,
    files: selected.files.map((file) => ({ ...file }))
  };
}
