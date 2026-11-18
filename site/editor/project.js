export const STORAGE_KEY = 'tzrender-editor-v2';
export const LEGACY_STORAGE_KEY = 'tzrender-editor-v1';
export const MAX_FILE_CHARS = 100_000;
export const MAX_PROJECT_CHARS = 1_000_000;
export const MAX_PROJECT_FILES = 512;
export const MAX_PROJECT_FOLDERS = 1024;
export const MAX_FILE_NAME = 255;
export const MAX_PATH_LENGTH = 1024;

const LEGACY_FILE_NAMES = { html: 'index.html', css: 'styles.css', js: 'script.js' };
// Besides POSIX traversal, reject names that are unsafe on common export targets
// or can poison object-based maps. Dotfiles and names without an extension are OK.
// Device-like names remain valid because these paths belong to a virtual filesystem.
const UNSAFE_SEGMENT = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\\<>:"|?*]/u;
const RESERVED_SEGMENT = /^(?:__proto__|prototype|constructor)$/i;
// JSON escaping can expand a single character to six characters.
const MAX_SAVED_PROJECT_CHARS = MAX_PROJECT_CHARS * 6
  + (MAX_PROJECT_FILES + MAX_PROJECT_FOLDERS) * (MAX_PATH_LENGTH * 6 + 30) + 10_000;

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
  lua: { language: 'lua', icon: 'Lua', category: 'script', runnable: true },
  py: { language: 'python', icon: 'Py', category: 'script', runnable: true },
  rb: { language: 'ruby', icon: 'Rb', category: 'ruby', runnable: true },
  r: { language: 'r', icon: 'R', category: 'r', runnable: true },
  pl: { language: 'perl', icon: 'Pl', category: 'perl', runnable: true },
  pm: { language: 'perl', icon: 'Pl', category: 'perl', runnable: false },
  php: { language: 'php', icon: 'PHP', category: 'php', runnable: true },
  java: { language: 'java', icon: 'J', category: 'java', runnable: true },
  json: { language: 'json', icon: '{}', category: 'data', runnable: true },
  sql: { language: 'sql', icon: 'SQL', category: 'data', runnable: true },
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
  lua: {
    name: 'Lua starter',
    files: [
      { name: 'README.md', content: '# Lua starter\n\nRun `main.lua` in the local Lua 5.4 WebAssembly runtime. Input is supplied as queued lines to `io.read()`; network and DOM access are unavailable.' },
      { name: 'main.lua', content: 'print("Hello from Lua 5.4!")\nlocal name = io.read()\nif name then print("Hello, " .. name .. "!") end' }
    ]
  },
  sql: {
    name: 'SQLite starter',
    files: [
      { name: 'README.md', content: '# SQLite starter\n\nRun `main.sql` in the local in-memory SQLite WASM runtime. Data is reset when the runtime is reset or the editor is closed.' },
      { name: 'main.sql', content: `CREATE TABLE people (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL\n);\n\nINSERT INTO people (name) VALUES ('Ada'), ('Grace');\n\nSELECT id, name FROM people ORDER BY id;` }
    ]
  },
  todo: {
    name: 'Interactive task list',
    activeFile: 'index.html',
    files: [
      { name: 'index.html', content: `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Today, in small steps</title>\n  <link rel="stylesheet" href="src/styles.css">\n</head>\n<body>\n  <main class="task-app">\n    <p class="eyebrow">A LITTLE PROGRESS</p>\n    <h1>Today, in small steps.</h1>\n    <form id="taskForm"><label class="visually-hidden" for="taskInput">New task</label><input id="taskInput" required maxlength="120" placeholder="What would you like to do?"><button>Add task</button></form>\n    <ul id="taskList" aria-live="polite"></ul>\n    <p id="taskCount">No tasks yet</p>\n  </main>\n  <script src="src/app.js"></script>\n</body>\n</html>` },
      { name: 'src/styles.css', content: `:root { font: 16px/1.5 system-ui, sans-serif; color: #242037; background: #f0edf9; }\n* { box-sizing: border-box; }\nbody { min-height: 100vh; display: grid; place-items: center; margin: 0; padding: 1.25rem; }\n.task-app { width: min(100%, 38rem); padding: clamp(1.5rem, 6vw, 3rem); border: 1px solid #e4def0; border-radius: 1.5rem; background: white; box-shadow: 0 1rem 4rem #271b4d18; }\n.eyebrow { color: #8067f7; font-size: .72rem; font-weight: 800; letter-spacing: .15em; }\nh1 { margin: .3rem 0 1.5rem; font-size: clamp(2rem, 7vw, 3rem); line-height: 1.08; letter-spacing: -.06em; }\nform { display: flex; gap: .5rem; }\ninput { min-width: 0; flex: 1; padding: .8rem; border: 1px solid #d8d2e5; border-radius: .7rem; font: inherit; }\nbutton { padding: .8rem 1rem; border: 0; border-radius: .7rem; color: white; background: #735bdd; font: inherit; font-weight: 700; cursor: pointer; }\nli { display: flex; justify-content: space-between; gap: .5rem; padding: .65rem 0; border-bottom: 1px solid #eeeaf4; }\nli button { padding: .25rem .5rem; font-size: .8rem; }\n#taskCount { color: #6c667b; font-size: .85rem; }\n.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }` },
      { name: 'src/app.js', content: `const form = document.querySelector('#taskForm');\nconst input = document.querySelector('#taskInput');\nconst list = document.querySelector('#taskList');\nconst count = document.querySelector('#taskCount');\nlet tasks = 0;\n\nform.addEventListener('submit', (event) => {\n  event.preventDefault();\n  const item = document.createElement('li');\n  const text = document.createElement('span');\n  text.textContent = input.value.trim();\n  const done = document.createElement('button');\n  done.type = 'button';\n  done.textContent = 'Done';\n  done.addEventListener('click', () => { item.remove(); tasks -= 1; updateCount(); });\n  item.append(text, done);\n  list.append(item);\n  tasks += 1;\n  input.value = '';\n  updateCount();\n});\n\nfunction updateCount() { count.textContent = tasks === 1 ? '1 small step in motion' : tasks ? tasks + ' small steps in motion' : 'No tasks yet'; }` }
    ]
  },
  pythonModules: {
    name: 'Python · local modules',
    activeFile: 'main.py',
    files: [
      { name: 'main.py', content: `from lib.greetings import greet\n\nfor name in ("Ada", "Grace", "you"):\n    print(greet(name))` },
      { name: 'lib/greetings.py', content: `def greet(name: str) -> str:\n    return f"Hello, {name}!"` },
      { name: 'README.md', content: '# Python · local modules\n\nRun `main.py`. The import is resolved from this project’s virtual files. Safe mode uses the standard library; package installation is off by default.' }
    ]
  },
  luaModules: {
    name: 'Lua · local modules',
    activeFile: 'main.lua',
    files: [
      { name: 'main.lua', content: `local greeting = require("lib.greetings")\n\nfor _, name in ipairs({ "Ada", "Grace", "you" }) do\n  print(greeting.say(name))\nend` },
      { name: 'lib/greetings.lua', content: `local M = {}\n\nfunction M.say(name)\n  return "Hello, " .. name .. "!"\nend\n\nreturn M` },
      { name: 'README.md', content: '# Lua · local modules\n\nRun `main.lua`; `require()` resolves Lua modules from the current project snapshot. The runtime has no host filesystem or network access.' }
    ]
  },
  phpIncludes: {
    name: 'PHP · local includes',
    activeFile: 'index.php',
    files: [
      { name: 'index.php', content: `<?php\nrequire __DIR__ . '/includes/greeting.php';\n$name = 'world';\n?>\n<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>PHP on the page</title></head>\n<body><main><h1><?= htmlspecialchars(greeting($name), ENT_QUOTES, 'UTF-8') ?></h1><p>Rendered locally by the PHP WebAssembly runtime.</p></main></body></html>` },
      { name: 'includes/greeting.php', content: `<?php\nfunction greeting(string $name): string {\n    return 'Hello, ' . $name . '!';\n}` },
      { name: 'README.md', content: '# PHP · local includes\n\nRun `index.php` to render a sandboxed page. `require` can load files from this project; there is no web server or networked Composer install.' }
    ]
  },
  javaProject: {
    name: 'Java · same-package sources',
    activeFile: 'src/Main.java',
    files: [
      { name: 'src/Main.java', content: `package demo;\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println(Greeting.say("browser"));\n    }\n}` },
      { name: 'src/Greeting.java', content: `package demo;\n\nfinal class Greeting {\n    static String say(String name) {\n        return "Hello, " + name + "!";\n    }\n}` },
      { name: 'README.md', content: '# Java · same-package sources\n\nSelect `src/Main.java` and Run. The browser Java compiler combines explicitly referenced sources in the same package; general multi-package classpaths are not supported.' }
    ]
  },
  sqlProject: {
    name: 'SQLite · schema and data',
    activeFile: 'main.sql',
    files: [
      { name: 'main.sql', content: `.read schema.sql\n.read seed.sql\n\nSELECT department, COUNT(*) AS people, ROUND(AVG(salary), 0) AS avg_salary\nFROM employees\nGROUP BY department\nORDER BY department;` },
      { name: 'schema.sql', content: `CREATE TABLE employees (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  department TEXT NOT NULL,\n  salary INTEGER NOT NULL\n);` },
      { name: 'seed.sql', content: `INSERT INTO employees (name, department, salary) VALUES\n  ('Ada', 'Research', 125000),\n  ('Grace', 'Research', 132000),\n  ('Katherine', 'Engineering', 118000);` },
      { name: 'README.md', content: '# SQLite · schema and data\n\nRun `main.sql`. SQLite `.read` loads sibling project scripts. The database is in-memory and starts fresh for each new session.' }
    ]
  },
  ruby: {
    name: 'Ruby · local require',
    activeFile: 'main.rb',
    files: [
      { name: 'main.rb', content: `require_relative "lib/greetings"\n\nputs Greetings.say("browser")` },
      { name: 'lib/greetings.rb', content: `module Greetings\n  def self.say(name)\n    "Hello, #{name}!"\n  end\nend` },
      { name: 'README.md', content: '# Ruby · local require\n\nRun `main.rb` in the CRuby WebAssembly runtime. Project-local `require` is available; host OS, network sockets and gem installation are not.' }
    ]
  },
  rProject: {
    name: 'R · data and helper script',
    activeFile: 'main.R',
    files: [
      { name: 'main.R', content: `source("R/summary.R")\nscores <- read.csv("data/scores.csv")\nprint(summarise_scores(scores$score))` },
      { name: 'R/summary.R', content: `summarise_scores <- function(values) {\n  c(count = length(values), mean = mean(values), sd = sd(values))\n}` },
      { name: 'data/scores.csv', content: `student,score\nAda,96\nGrace,91\nKatherine,99` },
      { name: 'README.md', content: '# R · data and helper script\n\nRun `main.R` in webR. Base R and local `source()` imports work offline. In experimental mode, configured packages are fetched only from the webR WebAssembly package repository.' }
    ]
  },
  perl: {
    name: 'Perl · local module',
    activeFile: 'main.pl',
    files: [
      { name: 'main.pl', content: `use strict;\nuse warnings;\nuse lib "/workspace/lib";\nuse Greetings;\n\nprint Greetings::say("browser"), "\\n";` },
      { name: 'lib/Greetings.pm', content: `package Greetings;\nuse strict;\nuse warnings;\n\nsub say {\n  my ($name) = @_;\n  return "Hello, $name!";\n}\n\n1;` },
      { name: 'README.md', content: '# Perl · local module\n\nRun `main.pl` in the experimental ZeroPerl WebAssembly runtime. Project files are virtual; CPAN installation and host OS/network access are unavailable.' }
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
  return Object.hasOwn(FILE_TYPES, extension)
    ? FILE_TYPES[extension]
    : { language: 'plaintext', icon: 'T', category: 'document', runnable: false };
}

function isSafePath(path) {
  if (typeof path !== 'string' || !path || path.length > MAX_PATH_LENGTH) return false;
  return path.split('/').every((segment) => segment.length > 0
    && segment.length <= MAX_FILE_NAME
    && segment !== '.' && segment !== '..'
    && !segment.endsWith('.') && !segment.endsWith(' ')
    && !UNSAFE_SEGMENT.test(segment)
    && !RESERVED_SEGMENT.test(segment));
}

export function isSafeFileName(name) {
  return isSafePath(name);
}

export function isSafeFolderName(name) {
  return isSafePath(name);
}

// Normalize canonical Unicode variants and case expansions (e.g. ß/SS and
// Greek final sigma) consistently for the whole virtual filesystem.
export function caseFoldPath(path) {
  return path.toLowerCase().toUpperCase().toLowerCase().normalize('NFC');
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
    if (!isSafeFileName(name)) throw new Error(`Unsafe file path: ${String(name).slice(0, 80)}`);
    if (seen.has(caseFoldPath(name))) throw new Error(`Duplicate file name: ${name}`);
    if (typeof content !== 'string' || content.length > MAX_FILE_CHARS) throw new Error(`${name} is larger than ${MAX_FILE_CHARS.toLocaleString()} characters or is not text.`);
    total += content.length;
    if (total > MAX_PROJECT_CHARS) throw new Error(`Projects are limited to ${MAX_PROJECT_CHARS.toLocaleString()} total characters.`);
    seen.add(caseFoldPath(name));
    cleaned.push({ name, content });
  }
  return cleaned;
}

// Shared by persistence and file-system operations. Ancestors are inferred,
// while explicit folders preserve empty directories across round trips.
export function validateProjectTree(files, folders = []) {
  const cleanFiles = cleanProjectFiles(files);
  if (!Array.isArray(folders)) throw new Error('Project folders must be an array of paths.');
  if (folders.length > MAX_PROJECT_FOLDERS) throw new Error(`Projects are limited to ${MAX_PROJECT_FOLDERS} folders.`);

  const fileNames = new Set(cleanFiles.map((file) => caseFoldPath(file.name)));
  const folderNames = new Map();
  const explicitlySeen = new Set();
  const cleanFolders = [];

  function addFolder(path) {
    const key = caseFoldPath(path);
    if (fileNames.has(key)) throw new Error(`A file conflicts with folder: ${path}`);
    const existing = folderNames.get(key);
    if (existing && existing !== path) throw new Error(`Folder name conflicts by case: ${path}`);
    if (!existing) {
      if (cleanFolders.length >= MAX_PROJECT_FOLDERS) throw new Error(`Projects are limited to ${MAX_PROJECT_FOLDERS} folders.`);
      folderNames.set(key, path);
      cleanFolders.push(path);
    }
  }

  function addAncestors(path, includeSelf) {
    const parts = path.split('/');
    const count = includeSelf ? parts.length : parts.length - 1;
    for (let i = 1; i <= count; i += 1) addFolder(parts.slice(0, i).join('/'));
  }

  for (const path of folders) {
    if (!isSafeFolderName(path)) throw new Error(`Unsafe folder path: ${String(path).slice(0, 80)}`);
    const key = caseFoldPath(path);
    if (explicitlySeen.has(key)) throw new Error(`Duplicate folder name: ${path}`);
    explicitlySeen.add(key);
    addAncestors(path, true);
  }
  for (const file of cleanFiles) addAncestors(file.name, false);
  return { files: cleanFiles, folders: cleanFolders };
}

export function normalizeProject(value, fallbackName = 'Imported project') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The project file is not a valid object.');
  if (value.format && value.format !== 'tzrender-project') throw new Error('This file is not a tzrender project.');
  const source = value.files;
  if (!source || typeof source !== 'object') throw new Error('The project has no files.');
  let fileSource = source;
  if (!Array.isArray(source)) {
    fileSource = Object.entries(source).map(([key, content]) => {
      const name = Object.hasOwn(LEGACY_FILE_NAMES, key) ? LEGACY_FILE_NAMES[key] : key;
      return { name, content };
    });
  }
  const { files, folders } = validateProjectTree(fileSource, value.folders);
  const activeFile = !Array.isArray(source) && Object.hasOwn(LEGACY_FILE_NAMES, value.activeFile)
    ? LEGACY_FILE_NAMES[value.activeFile] : value.activeFile;
  return {
    projectName: typeof value.projectName === 'string' ? value.projectName.trim().slice(0, 48) || fallbackName : fallbackName,
    starter: Object.hasOwn(STARTERS, value.starter) ? value.starter : 'blank',
    executionMode: value.executionMode === 'experimental' ? 'experimental' : 'safe',
    packages: normalizeProjectPackages(value.packages),
    activeFile: files.some((file) => file.name === activeFile) ? activeFile : files.find((file) => file.name === 'index.html')?.name || files[0].name,
    files,
    folders
  };
}

const PACKAGE_NAME = /^(?:@[A-Za-z0-9][A-Za-z0-9._-]{0,49}\/)?[A-Za-z0-9][A-Za-z0-9._+-]{0,99}(?:==[A-Za-z0-9][A-Za-z0-9._+-]{0,99})?$/;
const PYTHON_PACKAGE_SPEC = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}(?:==[A-Za-z0-9][A-Za-z0-9._+-]{0,99})?$/;
const ESM_PACKAGE_NAME = /^(?:@[A-Za-z0-9][A-Za-z0-9._-]{0,49}\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const R_PACKAGE_SPEC = /^[A-Za-z][A-Za-z0-9.]{0,99}$/;
const PACKAGE_LANGUAGES = new Set(['javascript', 'typescript', 'python', 'lua', 'php', 'java', 'r']);

export function normalizeProjectPackages(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [language, packages] of Object.entries(value)) {
    if (!PACKAGE_LANGUAGES.has(language) || !Array.isArray(packages)) continue;
    const unique = [...new Set(packages.filter((name) => typeof name === 'string'
      && PACKAGE_NAME.test(name)
      && (language !== 'python' || PYTHON_PACKAGE_SPEC.test(name))
      && (language !== 'r' || R_PACKAGE_SPEC.test(name))
      && (!['javascript', 'typescript'].includes(language) || ESM_PACKAGE_NAME.test(name))))].slice(0, language === 'r' ? 20 : 32);
    if (unique.length) result[language] = unique;
  }
  return result;
}

export function loadSavedProject(storage = globalThis.localStorage) {
  for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    try {
      const raw = storage?.getItem(key);
      if (!raw || raw.length > MAX_SAVED_PROJECT_CHARS) continue;
      const parsed = JSON.parse(raw);
      if (key === STORAGE_KEY && parsed.version !== 2) continue;
      if (key === LEGACY_STORAGE_KEY && parsed.version !== 1) continue;
      return normalizeProject({
        format: 'tzrender-project',
        projectName: parsed.projectName,
        starter: parsed.starter,
        executionMode: parsed.executionMode,
        packages: parsed.packages,
        activeFile: parsed.activeFile,
        files: parsed.files,
        folders: parsed.folders
      });
    } catch {
      // A corrupt or obsolete draft never prevents the editor from opening.
    }
  }
  return null;
}

export function serializeProject({ projectName, starter, activeFile, files, folders, executionMode, packages }) {
  const { files: cleanFiles, folders: cleanFolders } = validateProjectTree(files, folders);
  return JSON.stringify({
    format: 'tzrender-project',
    version: 2,
    projectName: String(projectName || 'Untitled project').trim().slice(0, 48) || 'Untitled project',
    starter: Object.hasOwn(STARTERS, starter) ? starter : 'blank',
    executionMode: executionMode === 'experimental' ? 'experimental' : 'safe',
    packages: normalizeProjectPackages(packages),
    activeFile: cleanFiles.some((file) => file.name === activeFile) ? activeFile : cleanFiles[0].name,
    files: cleanFiles,
    folders: cleanFolders,
    savedAt: new Date().toISOString()
  });
}

export function createStarterProject(starter = 'landing') {
  const selected = Object.hasOwn(STARTERS, starter) ? STARTERS[starter] : STARTERS.landing;
  const { files, folders } = validateProjectTree(selected.files, selected.folders);
  return {
    projectName: selected.name,
    starter: Object.hasOwn(STARTERS, starter) ? starter : 'landing',
    activeFile: files.some((file) => file.name === selected.activeFile) ? selected.activeFile
      : files.find((file) => file.name === 'index.html')?.name || files[0].name,
    files,
    folders
  };
}
