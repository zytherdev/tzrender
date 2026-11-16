import * as monaco from '../node_modules/monaco-editor/esm/vs/editor/editor.api.js';
import { buildPreviewDocument as createPreviewDocument } from './preview-document.js';
import '../node_modules/monaco-editor/esm/vs/language/html/monaco.contribution.js';
import '../node_modules/monaco-editor/esm/vs/language/css/monaco.contribution.js';
import '../node_modules/monaco-editor/esm/vs/language/typescript/monaco.contribution.js';
import editorWorker from '../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import jsonWorker from '../node_modules/monaco-editor/esm/vs/language/json/json.worker.js?worker';
import cssWorker from '../node_modules/monaco-editor/esm/vs/language/css/css.worker.js?worker';
import htmlWorker from '../node_modules/monaco-editor/esm/vs/language/html/html.worker.js?worker';
import tsWorker from '../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker';
import '../node_modules/monaco-editor/min/vs/editor/editor.main.css';

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  }
};

const STORAGE_KEY = 'tzrender-editor-v1';
const MAX_FILE_SIZE = 100_000;
const FILES = {
  html: { name: 'index.html', language: 'html', symbol: '5' },
  css: { name: 'styles.css', language: 'css', symbol: '#' },
  js: { name: 'script.js', language: 'javascript', symbol: 'JS' }
};
const STARTERS = {
  landing: {
    name: 'My first website',
    html: `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>My first website</title>\n</head>\n<body>\n  <main class="card">\n    <p class="eyebrow">YOUR FIRST BUILD</p>\n    <h1>Hello, web.</h1>\n    <p>Change this page and watch your idea come alive.</p>\n    <button id="helloButton" type="button">Try the button</button>\n  </main>\n</body>\n</html>`,
    css: `:root {\n  color-scheme: light;\n  font-family: system-ui, sans-serif;\n  color: #28233b;\n  background: #f3f0fc;\n}\n\n* { box-sizing: border-box; }\n\nbody {\n  min-height: 100vh;\n  display: grid;\n  place-items: center;\n  margin: 0;\n  padding: 2rem;\n}\n\n.card {\n  width: min(100%, 34rem);\n  padding: 2.5rem;\n  border: 1px solid #e2dcf2;\n  border-radius: 1.5rem;\n  background: white;\n  box-shadow: 0 1.5rem 4rem #2b20541a;\n}\n\n.eyebrow {\n  color: #7456dc;\n  font-size: .75rem;\n  font-weight: 800;\n  letter-spacing: .12em;\n}\n\nh1 { margin: .4rem 0; font-size: clamp(2rem, 8vw, 3.2rem); letter-spacing: -.07em; }\n.card > p:not(.eyebrow) { color: #625d70; line-height: 1.7; }\nbutton { padding: .8rem 1rem; border: 0; border-radius: .7rem; color: white; background: #7456dc; font: inherit; font-weight: 700; cursor: pointer; }\nbutton:hover { background: #5c40c2; }`,
    js: `const button = document.querySelector('#helloButton');\n\nbutton.addEventListener('click', () => {\n  console.log('Your first interaction works!');\n  button.textContent = 'You made it work!';\n});`
  },
  profile: {
    name: 'Profile card',
    html: `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>A little about me</title>\n</head>\n<body>\n  <main class="profile-card">\n    <div class="avatar" aria-hidden="true">JD</div>\n    <p class="eyebrow">A LITTLE ABOUT ME</p>\n    <h1>Jordan Developer</h1>\n    <p class="bio">I am learning to build friendly things for the web.</p>\n    <a class="profile-link" href="https://developer.mozilla.org/">What I am learning <span aria-hidden="true">↗</span></a>\n    <button id="likeButton" type="button">Say hello</button>\n    <p id="message" aria-live="polite"></p>\n  </main>\n</body>\n</html>`,
    css: `* { box-sizing: border-box; }\n:root { font-family: system-ui, sans-serif; color: #242037; background: #f0edf9; }\nbody { min-height: 100vh; display: grid; place-items: center; margin: 0; padding: 1.5rem; }\n.profile-card { width: min(100%, 25rem); padding: 2rem; border: 1px solid #e1dced; border-radius: 1.4rem; background: #fff; box-shadow: 0 1.5rem 4rem #24194a16; }\n.avatar { display: grid; width: 3.5rem; height: 3.5rem; place-items: center; margin-bottom: 1.2rem; border-radius: 1.2rem; color: #fff; background: #8067f7; font-weight: 800; }\n.eyebrow { color: #8067f7; font-size: .7rem; font-weight: 800; letter-spacing: .14em; }\nh1 { margin: .25rem 0; font-size: 1.8rem; letter-spacing: -.06em; }\n.bio { color: #696477; line-height: 1.65; }\n.profile-link { display: inline-block; margin: .45rem 0 1.2rem; color: #6449d6; font-weight: 700; text-decoration: none; }\nbutton { padding: .75rem 1rem; border: 0; border-radius: .7rem; color: #fff; background: #8067f7; font: inherit; font-weight: 700; cursor: pointer; }\n#message { min-height: 1.5rem; margin-bottom: 0; color: #477e6b; }`,
    js: `document.querySelector('#likeButton').addEventListener('click', () => {\n  document.querySelector('#message').textContent = 'Thanks for stopping by!';\n  console.log('Hello from the profile card.');\n});`
  },
  blank: {
    name: 'Untitled project',
    html: `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Untitled project</title>\n</head>\n<body>\n  <!-- Build your page here. -->\n</body>\n</html>`,
    css: `/* Add your styles here. */\nbody {\n  font-family: system-ui, sans-serif;\n}`,
    js: `// Add your interactions here.\nconsole.log('Ready to build.');`
  }
};

const $ = (id) => document.getElementById(id);
const workspace = $('editorWorkspace');
const frame = $('previewFrame');
const consoleOutput = $('consoleOutput');
const saveState = $('saveState');
const autoRun = $('autoRun');
let activeFile = 'html';
let saveTimer = 0;
let previewTimer = 0;
let runNumber = 0;
let models = {};
let editor;
let draftChanged = false;
let consoleCount = 0;

function showToast(message) {
  const host = $('siteToast');
  const node = document.createElement('div');
  node.className = 'site-toast';
  node.textContent = message;
  host.replaceChildren(node);
  window.setTimeout(() => { if (node.isConnected) node.remove(); }, 2400);
}

function getStarter(key) {
  return STARTERS[key] || STARTERS.landing;
}

function safeDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > 330_000) return null;
    const value = JSON.parse(raw);
    if (value?.version !== 1 || typeof value.files !== 'object') return null;
    for (const key of Object.keys(FILES)) {
      if (typeof value.files[key] !== 'string' || value.files[key].length > MAX_FILE_SIZE) return null;
    }
    return {
      files: value.files,
      projectName: typeof value.projectName === 'string' ? value.projectName.slice(0, 48) : 'My first website',
      starter: Object.hasOwn(STARTERS, value.starter) ? value.starter : 'landing'
    };
  } catch {
    return null;
  }
}

function setSaveState(label, mode = 'saved') {
  saveState.classList.toggle('is-saving', mode === 'saving');
  saveState.classList.toggle('is-error', mode === 'error');
  saveState.querySelector('i').setAttribute('aria-hidden', 'true');
  saveState.lastChild.textContent = ` ${label}`;
}

function saveDraft() {
  clearTimeout(saveTimer);
  setSaveState('Saving locally…', 'saving');
  saveTimer = window.setTimeout(() => {
    try {
      const payload = {
        version: 1,
        projectName: $('projectName').value.trim().slice(0, 48) || 'Untitled project',
        starter: $('starterSelect').value,
        files: Object.fromEntries(Object.keys(FILES).map((key) => [key, models[key].getValue()])),
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setSaveState('Saved in this browser');
      $('dirtyIndicator').hidden = true;
      draftChanged = false;
    } catch (error) {
      console.warn('Could not save editor draft locally:', error);
      setSaveState('Local save unavailable', 'error');
    }
  }, 450);
}

function updateProjectName(value) {
  const name = value.trim() || 'Untitled project';
  $('treeProjectName').textContent = name.toLocaleUpperCase().slice(0, 35);
  document.title = `${name} — tzrender Editor`;
}

function switchFile(key) {
  if (!Object.hasOwn(FILES, key)) return;
  if (activeFile === key) return;
  editor.saveViewState();
  activeFile = key;
  editor.setModel(models[key]);
  editor.restoreViewState();
  editor.focus();
  document.querySelectorAll('[data-file]').forEach((button) => {
    const selected = button.dataset.file === key;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  const file = FILES[key];
  $('activeFileSymbol').textContent = file.symbol;
  $('activeFileSymbol').className = `file-symbol file-${key}`;
  $('activeFileLabel').textContent = file.name;
  $('languageLabel').textContent = file.language.toUpperCase();
  const position = editor.getPosition();
  $('cursorStatus').textContent = `Ln ${position?.lineNumber || 1}, Col ${position?.column || 1}`;
}

function scheduleRun() {
  if (!autoRun.checked) {
    $('previewStatus').innerHTML = '<i class="status-dot"></i> Changes not run yet';
    return;
  }
  clearTimeout(previewTimer);
  $('previewStatus').innerHTML = '<i class="status-dot" style="background:#f5c46a"></i> Updating preview…';
  previewTimer = window.setTimeout(runPreview, 420);
}

function boundedText(value, limit = 2000) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text.slice(0, limit);
}

function pushConsole(level, message) {
  const placeholder = consoleOutput.querySelector('.console-placeholder');
  placeholder?.remove();
  const row = document.createElement('div');
  row.className = `console-entry${level === 'error' ? ' entry-error' : level === 'warn' ? ' entry-warn' : ''}`;
  const kind = document.createElement('span');
  kind.className = 'entry-kind';
  kind.textContent = level === 'error' ? '×' : level === 'warn' ? '!' : '›';
  const time = document.createElement('span');
  time.className = 'entry-time';
  time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const text = document.createElement('span');
  text.textContent = boundedText(message);
  row.append(kind, time, text);
  consoleOutput.append(row);
  while (consoleOutput.children.length > 100) consoleOutput.firstElementChild.remove();
  consoleCount = Math.min(99, consoleCount + 1);
  $('consoleCount').textContent = String(consoleCount);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow) return;
  const data = event.data;
  if (!data || data.channel !== 'tzrender-preview' || !['console', 'error', 'ready'].includes(data.type)) return;
  if (data.type === 'ready') {
    $('previewStatus').innerHTML = '<i class="status-dot"></i> Preview is up to date';
    $('previewEmpty').hidden = true;
    return;
  }
  if (data.type === 'error') {
    pushConsole('error', data.message || 'Preview runtime error');
    $('previewStatus').innerHTML = '<i class="status-dot" style="background:#ff818d"></i> Preview has an error';
    return;
  }
  if (data.type === 'console' && ['log', 'info', 'warn', 'error'].includes(data.level)) {
    pushConsole(data.level, data.message || '');
  }
});

function buildPreviewDocument() {
  return createPreviewDocument({
    html: models.html.getValue(),
    css: models.css.getValue(),
    javascript: models.js.getValue(),
    maxLength: MAX_FILE_SIZE
  });
}

function runPreview() {
  clearTimeout(previewTimer);
  $('previewStatus').innerHTML = '<i class="status-dot" style="background:#f5c46a"></i> Running preview…';
  $('previewEmpty').hidden = true;
  const currentRun = ++runNumber;
  try {
    frame.srcdoc = buildPreviewDocument();
    frame.dataset.run = String(currentRun);
  } catch (error) {
    $('previewStatus').innerHTML = '<i class="status-dot" style="background:#ff818d"></i> Preview could not run';
    pushConsole('error', error?.message || 'Could not build the preview document.');
  }
}

function replaceProject(key) {
  const starter = getStarter(key);
  $('projectName').value = starter.name;
  updateProjectName(starter.name);
  Object.keys(FILES).forEach((fileKey) => models[fileKey].setValue(starter[fileKey]));
  $('starterSelect').value = key;
  consoleOutput.replaceChildren(Object.assign(document.createElement('div'), { className: 'console-placeholder', textContent: 'Your preview messages will appear here.' }));
  consoleCount = 0;
  $('consoleCount').textContent = '0';
  saveDraft();
  runPreview();
  showToast('Starter loaded. Your previous draft was replaced.');
}

function downloadFile(filename, contents, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const savedDraft = safeDraft();
const initial = savedDraft ? { ...getStarter(savedDraft.starter), ...savedDraft.files, name: savedDraft.projectName } : getStarter('landing');
$('projectName').value = initial.name;
$('starterSelect').value = savedDraft?.starter || 'landing';
updateProjectName(initial.name);

for (const key of Object.keys(FILES)) {
  models[key] = monaco.editor.createModel(initial[key], FILES[key].language, monaco.Uri.parse(`file:///tzrender/${FILES[key].name}`));
}
monaco.editor.defineTheme('tzrender-night', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'tag', foreground: 'B9A8FF' },
    { token: 'attribute.name', foreground: '79DAB7' },
    { token: 'attribute.value', foreground: 'E4C77B' },
    { token: 'comment', foreground: '817B90', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'C2A9FF' },
    { token: 'string', foreground: '91D7B3' }
  ],
  colors: {
    'editor.background': '#15141D',
    'editor.foreground': '#E8E4F1',
    'editorLineNumber.foreground': '#666174',
    'editorLineNumber.activeForeground': '#B8ADD6',
    'editorCursor.foreground': '#B9A8FF',
    'editor.selectionBackground': '#52418777',
    'editor.lineHighlightBackground': '#211E2B',
    'editorIndentGuide.background1': '#2B2836',
    'editorIndentGuide.activeBackground1': '#4D4565',
    'editorWidget.background': '#211E2B',
    'editorSuggestWidget.background': '#211E2B',
    'editorSuggestWidget.border': '#454052'
  }
});

editor = monaco.editor.create($('codeEditor'), {
  model: models.html,
  theme: 'tzrender-night',
  automaticLayout: true,
  minimap: { enabled: false },
  lineNumbers: 'on',
  glyphMargin: false,
  folding: true,
  lineDecorationsWidth: 8,
  wordWrap: 'on',
  scrollBeyondLastLine: false,
  tabSize: 2,
  insertSpaces: true,
  formatOnPaste: true,
  bracketPairColorization: { enabled: true },
  guides: { bracketPairs: true, indentation: true },
  renderWhitespace: 'selection',
  fontSize: 13,
  lineHeight: 21,
  fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
  cursorBlinking: 'smooth',
  smoothScrolling: true,
  accessibilitySupport: 'auto',
  ariaLabel: 'HTML CSS JavaScript code editor',
  padding: { top: 13, bottom: 16 },
  fixedOverflowWidgets: true
});

editor.onDidChangeModelContent(() => {
  draftChanged = true;
  $('dirtyIndicator').hidden = false;
  saveDraft();
  scheduleRun();
});
editor.onDidChangeCursorPosition((event) => {
  $('cursorStatus').textContent = `Ln ${event.position.lineNumber}, Col ${event.position.column}`;
});

document.querySelectorAll('[data-file]').forEach((button) => button.addEventListener('click', () => switchFile(button.dataset.file)));
$('runProject').addEventListener('click', runPreview);
$('reloadPreview').addEventListener('click', runPreview);
$('autoRun').addEventListener('change', () => {
  if (autoRun.checked) runPreview();
  else $('previewStatus').innerHTML = '<i class="status-dot"></i> Auto-run paused';
});
$('clearConsole').addEventListener('click', () => {
  consoleOutput.replaceChildren(Object.assign(document.createElement('div'), { className: 'console-placeholder', textContent: 'Console cleared. Run your preview to see messages.' }));
  consoleCount = 0;
  $('consoleCount').textContent = '0';
});
$('closeMobileNotice').addEventListener('click', () => { $('mobileEditorNotice').hidden = true; });
$('projectName').addEventListener('input', () => {
  updateProjectName($('projectName').value);
  saveDraft();
});
$('starterSelect').addEventListener('change', () => replaceProject($('starterSelect').value));
$('resetProject').addEventListener('click', () => {
  if (draftChanged && !window.confirm('Reset this project to its starter? Your browser-local edits will be replaced.')) return;
  replaceProject($('starterSelect').value);
});
$('formatCode').addEventListener('click', async () => {
  try {
    await editor.getAction('editor.action.formatDocument')?.run();
    showToast(`${FILES[activeFile].name} formatted.`);
  } catch {
    showToast('Formatting is not available for this file.');
  }
});
$('viewportSize').addEventListener('change', () => {
  $('previewCanvasWrap').dataset.size = $('viewportSize').value;
});
$('downloadFile').addEventListener('click', () => {
  const file = FILES[activeFile];
  downloadFile(file.name, models[activeFile].getValue(), activeFile === 'html' ? 'text/html;charset=utf-8' : activeFile === 'css' ? 'text/css;charset=utf-8' : 'text/javascript;charset=utf-8');
  showToast(`${file.name} downloaded.`);
});
$('exportProject').addEventListener('click', () => {
  const payload = {
    format: 'tzrender-project',
    version: 1,
    projectName: $('projectName').value.trim() || 'Untitled project',
    files: Object.fromEntries(Object.keys(FILES).map((key) => [FILES[key].name, models[key].getValue()]))
  };
  downloadFile(`${payload.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tzrender-project'}.tzrender.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  showToast('Project export downloaded. Keep it as a backup.');
});

document.querySelectorAll('[data-panel-tab]').forEach((tab) => tab.addEventListener('click', () => {
  workspace.dataset.panel = tab.dataset.panelTab;
  document.querySelectorAll('[data-panel-tab]').forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
  if (tab.dataset.panelTab === 'editor') window.setTimeout(() => editor.layout(), 80);
}));

const mobileQuery = window.matchMedia('(max-width: 760px) and (pointer: coarse)');
$('mobileEditorNotice').hidden = !mobileQuery.matches;
mobileQuery.addEventListener?.('change', (event) => { $('mobileEditorNotice').hidden = !event.matches; });

window.addEventListener('keydown', (event) => {
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const modifier = isMac ? event.metaKey : event.ctrlKey;
  if (modifier && event.key === 'Enter') {
    event.preventDefault();
    runPreview();
  } else if (modifier && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveDraft();
    setSaveState('Saved in this browser');
  }
});

frame.addEventListener('load', () => {
  if (!frame.dataset.run) return;
  $('previewStatus').innerHTML = '<i class="status-dot"></i> Preview is up to date';
});

if (!savedDraft) saveDraft();
runPreview();
window.addEventListener('beforeunload', () => {
  if (draftChanged) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, projectName: $('projectName').value, starter: $('starterSelect').value, files: Object.fromEntries(Object.keys(FILES).map((key) => [key, models[key].getValue()])), savedAt: new Date().toISOString() }));
    } catch { /* Best-effort emergency save. */ }
  }
});
