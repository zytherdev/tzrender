import * as monaco from '../node_modules/monaco-editor/esm/vs/editor/editor.api.js';
import '../node_modules/monaco-editor/esm/vs/language/html/monaco.contribution.js';
import '../node_modules/monaco-editor/esm/vs/language/css/monaco.contribution.js';
import '../node_modules/monaco-editor/esm/vs/language/json/monaco.contribution.js';
import '../node_modules/monaco-editor/esm/vs/language/typescript/monaco.contribution.js';
import '../node_modules/monaco-editor/esm/vs/languages/definitions/css/register.js';
import '../node_modules/monaco-editor/esm/vs/languages/definitions/html/register.js';
import '../node_modules/monaco-editor/esm/vs/languages/definitions/javascript/register.js';
import '../node_modules/monaco-editor/esm/vs/languages/definitions/typescript/register.js';
import '../node_modules/monaco-editor/esm/vs/editor/contrib/colorPicker/browser/colorPickerContribution.js';
import '../node_modules/monaco-editor/esm/vs/editor/contrib/colorPicker/browser/colorPicker.css';
import editorWorker from '../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import jsonWorker from '../node_modules/monaco-editor/esm/vs/language/json/json.worker.js?worker';
import cssWorker from '../node_modules/monaco-editor/esm/vs/language/css/css.worker.js?worker';
import htmlWorker from '../node_modules/monaco-editor/esm/vs/language/html/html.worker.js?worker';
import tsWorker from '../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker';
import '../node_modules/monaco-editor/min/vs/editor/editor.main.css';
import { buildLanguageInfoPreview, buildProjectPreview, buildPythonInfoPreview } from './editor/preview-content.js';
import {
  createStarterProject,
  FILE_TYPES,
  getFileType,
  isSafeFileName,
  loadSavedProject,
  MAX_FILE_CHARS,
  MAX_PATH_LENGTH,
  MAX_PROJECT_CHARS,
  MAX_PROJECT_FILES,
  MAX_PROJECT_FOLDERS,
  normalizeProject,
  serializeProject,
  STORAGE_KEY,
  STARTERS
} from './editor/project.js';
import { createPythonRuntime } from './editor/python-runtime.js';
import { createJavaRuntime } from './editor/java-runtime.js';
import { createPhpRuntime } from './editor/php-runtime.js';
import { createTypeScriptRuntime } from './editor/typescript-runtime.js';
import { executeTerminalCommand, getTerminalHelp } from './editor/terminal.js';
import { createFileExplorer } from './editor/explorer.js';
import { setupEditorAppearance } from './editor/appearance.js';

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  }
};

const $ = (id) => document.getElementById(id);
const workspace = $('editorWorkspace');
const frame = $('previewFrame');
const models = new Map();
const viewStates = new Map();
const modelSubscriptions = new Map();
let project = readDraft() || createStarterProject('landing');
let activeFileName = project.activeFile;
let editor;
let explorer;
let saveTimer = 0;
let previewTimer = 0;
let previewRunSequence = 0;
let markerTimer = 0;
let draftChanged = false;
let consoleCount = 0;
let pythonRunSequence = 0;
let terminalHistory = [];
let historyCursor = 0;
let resizeState = null;
const LAYOUT_STORAGE_KEY = 'tzrender-editor-layout-v1';
// JSON can encode any UTF-16 code unit in six ASCII bytes. Account for all
// file contents, file/folder paths, the active path and pretty-print overhead.
const MAX_PROJECT_BACKUP_BYTES = MAX_PROJECT_CHARS * 6
  + (MAX_PROJECT_FILES + MAX_PROJECT_FOLDERS + 1) * MAX_PATH_LENGTH * 6
  + (MAX_PROJECT_FILES + MAX_PROJECT_FOLDERS) * 128 + 100_000;
let layoutResizeState = null;
let sidebarWidth = 235;
let outputHeight = 205;
function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
function saveLayoutPreferences() {
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({
      explorerWidth: sidebarWidth,
      outputHeight,
      explorerCollapsed: workspace.dataset.explorerCollapsed === 'true'
    }));
  } catch { /* Layout preferences are optional. */ }
}
function updateExplorerControls() {
  const collapsed = workspace.dataset.explorerCollapsed === 'true';
  const collapseButton = $('collapseExplorer');
  const toolbarButton = $('toggleExplorer');
  if (collapseButton) {
    collapseButton.textContent = collapsed ? '›' : '‹';
    collapseButton.setAttribute('aria-expanded', String(!collapsed));
    collapseButton.title = collapsed ? 'Expand Explorer' : 'Collapse Explorer';
  }
  if (toolbarButton) {
    toolbarButton.setAttribute('aria-expanded', String(!collapsed));
    toolbarButton.title = collapsed ? 'Expand the Explorer' : 'Collapse the Explorer';
  }
}
function applyWorkspaceLayout() {
  workspace.style.setProperty('--explorer-width', `${sidebarWidth}px`);
  workspace.style.setProperty('--output-height', `${outputHeight}px`);
  $('sidebarDivider')?.setAttribute('aria-valuenow', String(Math.round(sidebarWidth)));
  $('outputDivider')?.setAttribute('aria-valuenow', String(Math.round(outputHeight)));
  updateExplorerControls();
  editor?.layout();
}
function restoreLayoutPreferences() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(LAYOUT_STORAGE_KEY) || 'null');
    if (saved && Number.isFinite(Number(saved.explorerWidth))) sidebarWidth = clamp(Number(saved.explorerWidth), 160, 340);
    if (saved && Number.isFinite(Number(saved.outputHeight))) outputHeight = clamp(Number(saved.outputHeight), 145, 360);
    if (saved?.explorerCollapsed) workspace.dataset.explorerCollapsed = 'true';
  } catch { /* Layout preferences are optional. */ }
  applyWorkspaceLayout();
}
function toggleExplorer() {
  if (workspace.dataset.explorerCollapsed === 'true') delete workspace.dataset.explorerCollapsed;
  else workspace.dataset.explorerCollapsed = 'true';
  updateExplorerControls();
  saveLayoutPreferences();
  window.setTimeout(() => editor?.layout(), 190);
}

function readDraft() {
  try {
    return loadSavedProject(window.localStorage);
  } catch {
    return null;
  }
}

function showToast(message) {
  const host = $('siteToast');
  const node = document.createElement('div');
  node.className = 'site-toast';
  node.textContent = message;
  host.replaceChildren(node);
  window.setTimeout(() => { if (node.isConnected) node.remove(); }, 2400);
}

function setSaveState(message, mode = 'saved') {
  const state = $('saveState');
  state.classList.toggle('is-saving', mode === 'saving');
  state.classList.toggle('is-error', mode === 'error');
  state.replaceChildren(document.createElement('i'), document.createTextNode(` ${message}`));
  state.querySelector('i').setAttribute('aria-hidden', 'true');
  state.setAttribute('aria-label', `Draft status: ${message}`);
}

function setPreviewStatus(message, mode = 'ready') {
  const status = $('previewStatus');
  status.dataset.state = mode;
  const dot = document.createElement('i');
  dot.className = 'status-dot';
  dot.setAttribute('aria-hidden', 'true');
  status.replaceChildren(dot, document.createTextNode(` ${message}`));
}

function getFiles() {
  return [...models.entries()].map(([name, model]) => ({ name, content: model.getValue() }));
}

function isProjectDifferentFromStarter() {
  const starter = STARTERS[project.starter];
  if (!starter) return true;
  if (project.folders?.length) return true;
  const current = getFiles();
  if (current.length !== starter.files.length) return true;
  return starter.files.some((file) => current.find((item) => item.name === file.name)?.content !== file.content);
}

function saveDraftNow() {
  clearTimeout(saveTimer);
  try {
    const serialized = serializeProject({
      projectName: $('projectName').value,
      starter: project.starter,
      activeFile: activeFileName,
      folders: project.folders,
      files: getFiles()
    });
    window.localStorage.setItem(STORAGE_KEY, serialized);
    setSaveState('Saved only on this device');
    $('dirtyIndicator').hidden = true;
    draftChanged = false;
    return true;
  } catch (error) {
    console.warn('Could not save this project in browser storage.', error);
    setSaveState('Local save unavailable', 'error');
    showToast(`Could not save draft: ${error?.message || 'Browser storage is unavailable.'}`);
    return false;
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  setSaveState('Saving locally…', 'saving');
  saveTimer = window.setTimeout(saveDraftNow, 350);
}

function updateProjectName() {
  const name = $('projectName').value.trim().slice(0, 48) || 'Untitled project';
  $('treeProjectName').textContent = name.toLocaleUpperCase().slice(0, 35);
  $('terminalPrompt').textContent = `${name.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 24) || 'project'} $`;
  document.title = `${name} — tzrender Studio`;
}

function safeFileUri(name) {
  const characters = Array.from(name);
  const loneSurrogate = (character) => character.length === 1
    && character.charCodeAt(0) >= 0xd800 && character.charCodeAt(0) <= 0xdfff;
  if (characters.some(loneSurrogate)) {
    // URI encoding rejects unpaired surrogates, although project paths allow
    // them. Keep these models in a separate namespace and escape '%' as well,
    // so distinct real paths cannot acquire the same Monaco URI.
    const encoded = characters.map((character) => character === '%' ? '%25'
      : loneSurrogate(character) ? `%u${character.charCodeAt(0).toString(16).padStart(4, '0')}` : character).join('');
    return monaco.Uri.from({ scheme: 'file', path: `/tzrender-workspace-escaped/${encoded}` });
  }
  return monaco.Uri.from({ scheme: 'file', path: `/tzrender-workspace/${name}` });
}

function onModelChange(name) {
  if (!models.has(name)) return;
  draftChanged = true;
  $('dirtyIndicator').hidden = false;
  scheduleSave();
  scheduleProblems();
  schedulePreview();
}

function makeModel(file) {
  const type = getFileType(file.name);
  const model = monaco.editor.createModel(String(file.content ?? ''), type.language, safeFileUri(file.name));
  const subscription = model.onDidChangeContent(() => onModelChange(file.name));
  models.set(file.name, model);
  modelSubscriptions.set(file.name, subscription);
  return model;
}

function destroyAllModels() {
  for (const subscription of modelSubscriptions.values()) subscription.dispose();
  modelSubscriptions.clear();
  for (const model of models.values()) model.dispose();
  models.clear();
  viewStates.clear();
}

function fileIconClass(name) {
  const extension = name.split('.').pop().toLowerCase();
  const classes = { htm: 'html', mjs: 'js', cjs: 'js', jsx: 'js', tsx: 'ts', markdown: 'md', json: 'data', yaml: 'data', yml: 'data' };
  const badge = classes[extension] || extension;
  return `file-${['html', 'css', 'js', 'ts', 'py', 'php', 'java', 'md', 'data'].includes(badge) ? badge : 'text'}`;
}

function renderFileList() {
  explorer?.render();
}

function updateActiveFileChrome() {
  const file = getFiles().find((item) => item.name === activeFileName);
  if (!file) return;
  const type = getFileType(file.name);
  $('activeFileSymbol').textContent = type.icon;
  $('activeFileSymbol').className = `file-symbol ${fileIconClass(file.name)}`;
  $('activeFileLabel').textContent = file.name;
  $('languageLabel').textContent = type.language.toUpperCase();
  $('previewUrl').textContent = `/${file.name}`;
  const runnable = type.runnable;
  const extension = file.name.split('.').pop().toLowerCase();
  $('runLabel').textContent = extension === 'py' ? 'Run Python' : extension === 'php' ? 'Run PHP' : extension === 'java' ? 'Run Java' : runnable ? 'Run' : 'Preview only';
  $('runProject').title = file.name.toLowerCase().endsWith('.py')
    ? 'Run this file in the local Python worker'
    : extension === 'php' ? 'Run this file in the local PHP WebAssembly runtime'
    : extension === 'java' ? 'Compile and run this file in the local Java WebAssembly runtime'
    : runnable ? 'Run the project preview' : 'This extension receives syntax highlighting only';
  $('languageStatus').replaceChildren(document.createElement('span'), document.createTextNode(` ${type.language.toUpperCase()} · ${type.runnable ? 'runnable/previewable' : 'syntax only'}`));
  $('languageStatus').querySelector('span').className = 'status-dot';
  $('languageStatus').querySelector('span').setAttribute('aria-hidden', 'true');
  $('cursorStatus').textContent = `Ln ${editor?.getPosition()?.lineNumber || 1}, Col ${editor?.getPosition()?.column || 1}`;
  $('deleteFile').disabled = getFiles().length <= 1;
}

function setActiveFile(name) {
  if (!models.has(name)) return;
  if (activeFileName === name) {
    explorer?.select(name);
    if (window.matchMedia('(max-width: 900px)').matches) setWorkspacePanel('editor');
    editor?.focus();
    return;
  }
  if (editor) {
    viewStates.set(activeFileName, editor.saveViewState());
    activeFileName = name;
    editor.setModel(models.get(name));
    editor.restoreViewState(viewStates.get(name) || null);
    editor.focus();
  } else {
    activeFileName = name;
  }
  project.activeFile = name;
  explorer?.select(name);
  updateActiveFileChrome();
  if (window.matchMedia('(max-width: 900px)').matches) setWorkspacePanel('editor');
  scheduleProblems();
  scheduleSave();
  schedulePreview();
}

function clearConsole(message = 'Console output from the sandboxed website preview appears here.') {
  const host = $('consolePanel');
  host.replaceChildren();
  const placeholder = document.createElement('div');
  placeholder.className = 'console-placeholder';
  placeholder.textContent = message;
  host.append(placeholder);
  consoleCount = 0;
  $('consoleCount').textContent = '0';
}

function pushConsole(level, message) {
  const host = $('consolePanel');
  host.querySelector('.console-placeholder')?.remove();
  const row = document.createElement('div');
  row.className = `console-entry${level === 'error' ? ' entry-error' : level === 'warn' ? ' entry-warn' : ''}`;
  const kind = document.createElement('span');
  kind.className = 'entry-kind';
  kind.textContent = level === 'error' ? '×' : level === 'warn' ? '!' : '›';
  const time = document.createElement('span');
  time.className = 'entry-time';
  time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const text = document.createElement('span');
  text.textContent = String(message ?? '').slice(0, 2000);
  row.append(kind, time, text);
  host.append(row);
  while (host.children.length > 100) host.firstElementChild.remove();
  consoleCount = Math.min(99, consoleCount + 1);
  $('consoleCount').textContent = String(consoleCount);
  host.scrollTop = host.scrollHeight;
}

function clearTerminal(message = 'Terminal cleared.') {
  const host = $('terminalOutput');
  host.replaceChildren();
  if (message) appendTerminalLine(message, 'info');
}

function appendTerminalLine(message, kind = 'info') {
  const host = $('terminalOutput');
  const placeholder = host.querySelector('.terminal-banner');
  placeholder?.remove();
  const row = document.createElement('div');
  row.className = `terminal-line ${kind}`;
  row.textContent = String(message ?? '').slice(0, 24_000);
  host.append(row);
  while (host.children.length > 250) host.firstElementChild.remove();
  host.scrollTop = host.scrollHeight;
}

function updateProblems() {
  const host = $('problemsPanel');
  const entries = [];
  for (const [name, model] of models) {
    const markers = monaco.editor.getModelMarkers({ resource: model.uri });
    for (const marker of markers) entries.push({ name, ...marker });
  }
  host.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'console-placeholder';
    empty.textContent = 'No editor problems to show.';
    host.append(empty);
  } else {
    for (const item of entries.slice(0, 100)) {
      const row = document.createElement('div');
      const severity = item.severity === monaco.MarkerSeverity.Warning ? 'warning' : 'error';
      row.className = `problem-entry ${severity}`;
      const icon = document.createElement('span');
      icon.textContent = severity === 'error' ? '×' : '!';
      const location = document.createElement('span');
      location.className = 'problem-location';
      location.textContent = `${item.name}:${item.startLineNumber || 1}:${item.startColumn || 1}`;
      const message = document.createElement('span');
      message.textContent = item.message;
      row.append(icon, location, message);
      row.addEventListener('click', () => {
        setActiveFile(item.name);
        editor.revealPositionInCenter({ lineNumber: item.startLineNumber || 1, column: item.startColumn || 1 });
        editor.setPosition({ lineNumber: item.startLineNumber || 1, column: item.startColumn || 1 });
        editor.focus();
      });
      host.append(row);
    }
  }
  const count = entries.length;
  $('problemsBadge').textContent = String(count);
  $('problemCount').textContent = String(count);
}

function scheduleProblems() {
  clearTimeout(markerTimer);
  markerTimer = window.setTimeout(updateProblems, 180);
}

function setOutputTab(name) {
  const valid = ['terminal', 'console', 'problems'].includes(name) ? name : 'terminal';
  workspace.dataset.outputTab = valid;
  for (const tab of document.querySelectorAll('[data-output]')) {
    const active = tab.dataset.output === valid;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  }
  for (const panel of document.querySelectorAll('[data-output-panel]')) panel.hidden = panel.dataset.outputPanel !== valid;
  $('outputDescription').textContent = valid === 'terminal'
    ? 'Local project commands only — type help'
    : valid === 'console' ? 'Messages from the sandboxed website preview' : 'Editor diagnostics and language-service problems';
}

function setWorkspacePanel(name) {
  const valid = ['files', 'editor', 'preview', 'output'].includes(name) ? name : 'editor';
  workspace.dataset.panel = valid;
  for (const tab of document.querySelectorAll('[data-panel-tab]')) tab.setAttribute('aria-selected', String(tab.dataset.panelTab === valid));
  if (valid === 'editor') window.setTimeout(() => editor?.layout(), 70);
}

function boundedConsoleMessage(value) {
  if (typeof value === 'string') return value.slice(0, 2000);
  try { return JSON.stringify(value)?.slice(0, 2000) ?? String(value); }
  catch { return String(value).slice(0, 2000); }
}

window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow) return;
  const data = event.data;
  if (!data || data.channel !== 'tzrender-preview' || !['console', 'error', 'ready'].includes(data.type)) return;
  if (data.type === 'ready') {
    setPreviewStatus('Preview is up to date');
    $('previewEmpty').hidden = true;
    return;
  }
  if (data.type === 'error') {
    pushConsole('error', boundedConsoleMessage(data.message || 'Preview runtime error'));
    setPreviewStatus('Preview has a runtime error', 'error');
    return;
  }
  if (data.type === 'console' && ['log', 'info', 'warn', 'error'].includes(data.level)) {
    pushConsole(data.level, boundedConsoleMessage(data.message || ''));
  }
});

function applyTypeScriptDiagnostics(fileName, diagnostics = []) {
  const model = models.get(fileName);
  if (!model) return;
  const markers = diagnostics.map((diagnostic) => ({
    severity: diagnostic.category === 0 ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
    message: diagnostic.message,
    startLineNumber: Math.max(1, diagnostic.line || 1),
    startColumn: Math.max(1, diagnostic.column || 1),
    endLineNumber: Math.max(1, diagnostic.line || 1),
    endColumn: Math.max(2, (diagnostic.column || 1) + 1),
    source: 'TypeScript compiler'
  }));
  monaco.editor.setModelMarkers(model, 'tzrender-typescript-run', markers);
  scheduleProblems();
}

function setPreviewDocument(srcdoc, path) {
  $('previewUrl').textContent = `/${path}`;
  $('previewEmpty').hidden = true;
  frame.dataset.run = String(Number(frame.dataset.run || 0) + 1);
  frame.srcdoc = srcdoc;
}

function previewFailure(message) {
  const text = String(message || 'Could not build the preview.').slice(0, 2000);
  pushConsole('error', text);
  appendTerminalLine(text, 'error');
  setPreviewStatus('Preview could not run', 'error');
  setOutputTab('console');
}

const typeScriptRuntime = createTypeScriptRuntime();
function onLanguageRuntimeStatus(state, message) {
  $('stopPython').disabled = !['loading', 'running'].includes(state);
  $('runProject').disabled = ['loading', 'running'].includes(state);
  if (message && ['loading', 'running'].includes(state)) appendTerminalLine(message, 'warning');
}

const phpRuntime = createPhpRuntime({
  onOutput(stream, text) {
    appendTerminalLine(text, stream === 'stderr' ? 'error' : 'success');
  },
  onStatus: onLanguageRuntimeStatus
});
const javaRuntime = createJavaRuntime({
  onOutput(stream, text) {
    appendTerminalLine(text, stream === 'stderr' ? 'error' : 'success');
  },
  onStatus: onLanguageRuntimeStatus
});
const pythonRuntime = createPythonRuntime({
  onOutput(stream, text) {
    appendTerminalLine(text, stream === 'stderr' ? 'error' : stream === 'result' ? 'success' : 'info');
  },
  onStatus(state, message) {
    $('stopPython').disabled = !['loading', 'running'].includes(state);
    $('runProject').disabled = ['loading', 'running'].includes(state);
    if (message && ['loading', 'running'].includes(state)) appendTerminalLine(message, 'warning');
  }
});

async function runPythonFile(name, source) {
  const runId = ++pythonRunSequence;
  const path = isSafeFileName(name) ? name : 'main.py';
  setOutputTab('terminal');
  appendTerminalLine(`$ python ${path}`, 'command');
  setPreviewStatus(`Running ${path} in a local worker…`, 'running');
  try {
    await pythonRuntime.run(source, { input: $('programInput')?.value || '' });
    if (runId === pythonRunSequence) {
      appendTerminalLine('Python finished.', 'success');
      setPreviewStatus('Python finished in the local worker');
    }
  } catch (error) {
    const message = error?.message || String(error);
    if (runId === pythonRunSequence) {
      appendTerminalLine(message, message.includes('stopped') ? 'warning' : 'error');
      setPreviewStatus(message.includes('stopped') ? 'Python stopped' : 'Python needs attention', message.includes('stopped') ? 'ready' : 'error');
    }
  }
}

async function runCompiledLanguageFile(language, name, source) {
  const runId = ++pythonRunSequence;
  setOutputTab('terminal');
  appendTerminalLine(`$ ${language} ${name}`, 'command');
  setPreviewStatus(`Loading the local ${language.toUpperCase()} runtime…`, 'running');
  const runtime = language === 'php' ? phpRuntime : javaRuntime;
  try {
    await runtime.run(name, source, { input: $('programInput')?.value || '' });
    if (runId === pythonRunSequence) setPreviewStatus(`${language.toUpperCase()} finished in the local WebAssembly runtime`);
  } catch (error) {
    const message = error?.message || String(error);
    if (runId === pythonRunSequence) {
      appendTerminalLine(message, 'error');
      setPreviewStatus(`${language.toUpperCase()} needs attention`, 'error');
    }
  }
}

// Match the website preview's page selection, local script resolution and
// same-directory legacy fallback. The returned indices refer to *all* TS files in
// the snapshot, because buildProjectPreview associates compiled outputs by index.
function previewTypeScriptIndices(activeFile, files, typeScriptFiles) {
  const extensionOf = (name) => name.split('.').pop().toLowerCase();
  const directoryOf = (name) => name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '';
  const extension = extensionOf(activeFile.name);
  if (!['html', 'htm', 'css', 'js', 'mjs', 'ts'].includes(extension)) return [];
  const html = ['html', 'htm'].includes(extension) ? activeFile
    : files.find((file) => file.name.toLowerCase() === 'index.html')
      || files.find((file) => ['html', 'htm'].includes(extensionOf(file.name)));
  if (!html) return [];

  const parsed = new DOMParser().parseFromString(html.content, 'text/html');
  const scripts = [...parsed.querySelectorAll('script[src]')];
  const referenced = new Set();
  for (const script of scripts) {
    const raw = (script.getAttribute('src') || '').trim().split(/[?#]/, 1)[0];
    if (!raw || raw.startsWith('/') || /[\\\x00-\x1f\x7f]/.test(raw)) continue;
    const parts = raw.split('/');
    const path = directoryOf(html.name) ? directoryOf(html.name).split('/') : [];
    let safe = true;
    for (let index = 0; index < parts.length; index += 1) {
      let part;
      try { part = decodeURIComponent(parts[index]); } catch { safe = false; break; }
      if (/[\/\\\x00-\x1f\x7f]/.test(part) || (index === 0 && part.includes(':'))) { safe = false; break; }
      if (!part || part === '.') continue;
      if (part === '..') {
        if (!path.length) { safe = false; break; }
        path.pop();
      } else path.push(part);
    }
    if (safe && path.length) referenced.add(path.join('/'));
  }
  const fallback = !scripts.length && !parsed.querySelector('script');
  return typeScriptFiles.flatMap((file, index) => referenced.has(file.name)
    || (fallback && directoryOf(file.name) === directoryOf(html.name)) ? [index] : []);
}

function invalidatePreview() {
  previewRunSequence += 1;
  clearTimeout(previewTimer);
}

async function runProject({ openPreview = false } = {}) {
  invalidatePreview();
  const runId = previewRunSequence;
  const files = getFiles();
  const activeFile = files.find((file) => file.name === activeFileName);
  if (!activeFile) return;
  const extension = activeFile.name.split('.').pop().toLowerCase();
  if (extension === 'py') {
    setPreviewDocument(buildPythonInfoPreview(activeFile.name), activeFile.name);
    await runPythonFile(activeFile.name, activeFile.content);
    return;
  }
  if (extension === 'php' || extension === 'java') {
    setPreviewDocument(buildLanguageInfoPreview(activeFile.name, extension), activeFile.name);
    await runCompiledLanguageFile(extension, activeFile.name, activeFile.content);
    return;
  }
  if (openPreview && getFileType(activeFile.name).runnable && window.matchMedia('(max-width: 760px)').matches) setWorkspacePanel('preview');
  setPreviewStatus('Preparing preview…', 'running');
  try {
    const typeScriptFiles = files.filter((file) => file.name.toLowerCase().endsWith('.ts'));
    const compiledTypeScript = new Array(typeScriptFiles.length);
    for (const index of previewTypeScriptIndices(activeFile, files, typeScriptFiles)) {
      const file = typeScriptFiles[index];
      const result = await typeScriptRuntime.compile(file.content);
      if (runId !== previewRunSequence) return;
      applyTypeScriptDiagnostics(file.name, result.diagnostics);
      if (result.diagnostics.some((diagnostic) => diagnostic.category === 1)) {
        throw new Error(`TypeScript compile failed in ${file.name}. See Problems for details.`);
      }
      compiledTypeScript[index] = result.code;
    }
    if (runId !== previewRunSequence) return;
    const preview = buildProjectPreview({ activeFile, files, compiledTypeScript });
    setPreviewDocument(preview.srcdoc, preview.path);
    setPreviewStatus(preview.mode === 'document' ? 'Document preview updated' : 'Preview is running', 'running');
    clearConsole('Console cleared. Messages from the next preview run appear here.');
  } catch (error) {
    if (runId === previewRunSequence) previewFailure(error?.message || 'Could not build the preview.');
  }
}

function schedulePreview() {
  invalidatePreview();
  if (!$('autoRun').checked) {
    setPreviewStatus('Changes not run yet', 'paused');
    return;
  }
  const extension = activeFileName.split('.').pop().toLowerCase();
  if (['py', 'php', 'java'].includes(extension)) {
    setPreviewStatus(`${extension.toUpperCase()} is manual-run only`, 'paused');
    return;
  }
  setPreviewStatus('Updating preview…', 'running');
  previewTimer = window.setTimeout(() => runProject(), 550);
}

function setProject(nextProject, { save = true, run = true } = {}) {
  const normalized = normalizeProject({
    format: 'tzrender-project',
    projectName: nextProject.projectName,
    starter: nextProject.starter,
    activeFile: nextProject.activeFile,
    folders: nextProject.folders,
    files: nextProject.files
  });
  invalidatePreview();
  if (editor) {
    editor.saveViewState();
    viewStates.set(activeFileName, editor.saveViewState());
  }
  const previousActive = activeFileName;
  destroyAllModels();
  project = normalized;
  activeFileName = normalized.activeFile;
  $('projectName').value = normalized.projectName;
  $('starterSelect').value = normalized.starter;
  updateProjectName();
  for (const file of normalized.files) makeModel(file);
  if (editor) {
    editor.setModel(models.get(activeFileName));
    editor.focus();
    if (previousActive === activeFileName) editor.setPosition({ lineNumber: 1, column: 1 });
  }
  draftChanged = true;
  $('dirtyIndicator').hidden = false;
  explorer?.reset();
  explorer?.select(activeFileName);
  updateActiveFileChrome();
  clearConsole();
  clearTerminal('Project loaded. Type help for available local commands.');
  updateProblems();
  const saved = !save || saveDraftNow();
  if (run) runProject();
  if (window.matchMedia('(max-width: 760px)').matches) setWorkspacePanel('editor');
  return saved;
}

function confirmReplace(action) {
  if (!isProjectDifferentFromStarter() && !draftChanged) return true;
  return window.confirm(`${action} This replaces the files in the current browser draft. Export the project first if you need a backup.`);
}

function replaceWithStarter(key, force = false) {
  if (!force && !confirmReplace('Load this starter?')) {
    $('starterSelect').value = project.starter;
    return;
  }
  if (setProject(createStarterProject(key))) showToast('Starter loaded. The previous project was replaced.');
}

function snapshotProject() {
  return { ...project, projectName: $('projectName').value, activeFile: activeFileName,
    folders: [...(project.folders || [])], files: getFiles() };
}

// Reconcile the filesystem snapshot without recreating unrelated Monaco models,
// so edits and undo history in untouched files are preserved.
function applyFilesystemProject(next) {
  const oldActive = activeFileName;
  if (editor && models.has(oldActive)) viewStates.set(oldActive, editor.saveViewState());
  const nextNames = new Set(next.files.map((file) => file.name));
  for (const file of next.files) {
    if (!models.has(file.name)) makeModel(file);
    else if (models.get(file.name).getValue() !== file.content) models.get(file.name).setValue(file.content);
  }
  if (!nextNames.has(oldActive) && next.activeFile !== oldActive && viewStates.has(oldActive)) {
    viewStates.set(next.activeFile, viewStates.get(oldActive));
  }
  project = next;
  activeFileName = next.activeFile;
  if (editor && editor.getModel() !== models.get(activeFileName)) {
    editor.setModel(models.get(activeFileName));
    editor.restoreViewState(viewStates.get(activeFileName) || null);
  }
  for (const [name, model] of models) {
    if (!nextNames.has(name)) {
      modelSubscriptions.get(name)?.dispose();
      modelSubscriptions.delete(name);
      model.dispose();
      models.delete(name);
      viewStates.delete(name);
    }
  }
  draftChanged = true;
  $('dirtyIndicator').hidden = false;
  updateActiveFileChrome();
  scheduleSave();
  scheduleProblems();
  schedulePreview();
}

function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function downloadActiveFile() {
  const file = getFiles().find((item) => item.name === activeFileName);
  if (!file) return;
  const mime = file.name.endsWith('.html') ? 'text/html;charset=utf-8'
    : file.name.endsWith('.css') ? 'text/css;charset=utf-8'
      : file.name.endsWith('.json') ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8';
  downloadFile(file.name.split('/').pop(), file.content, mime);
  showToast(`${file.name} downloaded.`);
}

function exportProject() {
  try {
    const serialized = serializeProject({
      projectName: $('projectName').value,
      starter: project.starter,
      activeFile: activeFileName,
      folders: project.folders,
      files: getFiles()
    });
    const safeName = $('projectName').value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tzrender-project';
    downloadFile(`${safeName}.tzrender.json`, JSON.stringify(JSON.parse(serialized), null, 2), 'application/json;charset=utf-8');
    setSaveState('Exported backup');
    showToast('Project backup downloaded. Keep it somewhere safe.');
  } catch (error) {
    showToast(error?.message || 'Could not export this project.');
  }
}

async function importProjectFile(file) {
  if (!file) return;
  if (file.size > MAX_PROJECT_BACKUP_BYTES) throw new Error(`Project backups must be no larger than ${MAX_PROJECT_BACKUP_BYTES.toLocaleString()} bytes.`);
  const parsed = JSON.parse(await file.text());
  const imported = normalizeProject(parsed);
  if (!confirmReplace('Import this project?')) return;
  if (setProject(imported)) showToast('Project imported and saved in this browser.');
}

function renderPreviewFile() {
  runProject({ openPreview: true });
}

function runTerminalPython(filename) {
  const file = getFiles().find((item) => item.name === filename);
  if (!file) return Promise.reject(new Error(`Python file not found: ${filename}`));
  return runPythonFile(file.name, file.content);
}

function runTerminalPhp(filename) {
  const file = getFiles().find((item) => item.name === filename);
  if (!file) return Promise.reject(new Error(`PHP file not found: ${filename}`));
  return runCompiledLanguageFile('php', file.name, file.content);
}

function runTerminalJava(filename) {
  const file = getFiles().find((item) => item.name === filename);
  if (!file) return Promise.reject(new Error(`Java file not found: ${filename}`));
  return runCompiledLanguageFile('java', file.name, file.content);
}

async function submitTerminal(event) {
  event.preventDefault();
  const input = $('terminalInput');
  const command = input.value.trim();
  input.value = '';
  if (!command) return;
  terminalHistory.push(command);
  terminalHistory = terminalHistory.slice(-80);
  historyCursor = terminalHistory.length;
  appendTerminalLine(`${$('terminalPrompt').textContent}${command}`, 'command');
  try {
    const result = await executeTerminalCommand(command, {
      files: getFiles,
      projectName: () => $('projectName').value,
      activeFile: () => activeFileName,
      runActive: () => runProject({ openPreview: true }),
      runPython: runTerminalPython,
      runPhp: runTerminalPhp,
      runJava: runTerminalJava,
      showPreview: () => setWorkspacePanel('preview'),
      clear: () => clearTerminal(''),
      stopRuntime: () => {
        pythonRunSequence += 1;
        const extension = activeFileName.split('.').pop().toLowerCase();
        if (extension === 'php') return phpRuntime.stop();
        if (extension === 'java') return javaRuntime.stop();
        return pythonRuntime.stop();
      }
    });
    if (result.text) appendTerminalLine(result.text, result.type || 'info');
  } catch (error) {
    appendTerminalLine(error?.message || 'Command failed.', 'error');
  }
}

function registerLanguages() {
  const existing = new Set(monaco.languages.getLanguages().map((language) => language.id));
  const definitions = {
    python: {
      defaultToken: '', tokenPostfix: '.py',
      keywords: ['and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'True', 'try', 'while', 'with', 'yield'],
      tokenizer: { root: [
        [/#.*$/, 'comment'],
        [/^\s*@\w+/, 'annotation'],
        [/[rRuUbBfF]?(?:"""|''')/, 'string.delimiter'],
        [/[rRuUbBfF]?"(?:[^"\\]|\\.)*"/, 'string'],
        [/[rRuUbBfF]?'(?:[^'\\]|\\.)*'/, 'string'],
        [/\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/, 'number'],
        [/[a-zA-Z_]\w*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
        [/[{}()[\]]/, '@brackets'],
        [/[=<>!~?:&|+*/%-]+/, 'operator']
      ] }
    },
    yaml: {
      defaultToken: '', tokenPostfix: '.yaml',
      tokenizer: { root: [
        [/^\s*#.*$/, 'comment'],
        [/^\s*[\w.-]+(?=\s*:)/, 'type.identifier'],
        [/\b(?:true|false|null|yes|no|on|off)\b/i, 'keyword'],
        [/\b\d+(?:\.\d+)?\b/, 'number'],
        [/"(?:[^"\\]|\\.)*"|'[^']*'/, 'string'],
        [/^\s*-\s/, 'delimiter'],
        [/[\[\]{}:,|>&*!]/, 'delimiter']
      ] }
    },
    markdown: {
      defaultToken: '', tokenPostfix: '.md',
      tokenizer: { root: [
        [/^\s{0,3}#{1,6}\s.*$/, 'keyword'],
        [/^\s*[-*+]\s/, 'delimiter'],
        [/^\s*>.*$/, 'comment'],
        [/\*\*[^*]+\*\*/, 'strong'],
        [/\*[^*]+\*/, 'emphasis'],
        [/`[^`]+`/, 'string'],
        [/\[[^\]]+\]\([^)]+\)/, 'string.link']
      ] }
    },
    xml: {
      defaultToken: '', tokenPostfix: '.xml',
      tokenizer: { root: [
        [/<!--/, 'comment', '@comment'],
        [/<\/?[\w:.-]+/, 'tag'],
        [/\s[\w:.-]+(?==)/, 'attribute.name'],
        [/"[^\"]*"|'[^']*'/, 'attribute.value'],
        [/>/, 'delimiter'],
        [/&\w+;/, 'string.escape']
      ], comment: [[/-->/, 'comment', '@pop'], [/./, 'comment']] }
    },
    php: {
      defaultToken: '', tokenPostfix: '.php',
      tokenizer: { root: [
        [/<\?(?:php|=)?|\?>/, 'metatag'],
        [/\/\/.*$/, 'comment'],
        [/#.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/, 'string'],
        [/\$[a-zA-Z_]\w*/, 'variable'],
        [/\b(?:abstract|and|array|as|break|callable|case|catch|class|clone|const|continue|declare|default|die|do|echo|else|elseif|empty|enddeclare|endfor|endforeach|endif|endswitch|endwhile|eval|exit|extends|final|finally|fn|for|foreach|function|global|if|implements|include|include_once|instanceof|insteadof|interface|isset|list|match|namespace|new|or|print|private|protected|public|readonly|require|require_once|return|self|static|switch|throw|trait|try|unset|use|var|while|xor|yield)\b/, 'keyword'],
        [/\b(?:true|false|null)\b/i, 'constant'],
        [/\b\d+(?:\.\d+)?\b/, 'number'],
        [/[a-zA-Z_]\w*/, 'identifier'],
        [/[{}()[\]]/, '@brackets'],
        [/[=<>!~?:&|+*/%-]+/, 'operator'],
        [/[;,.]/, 'delimiter']
      ], comment: [[/\*\//, 'comment', '@pop'], [/./, 'comment']] }
    },
    java: {
      defaultToken: '', tokenPostfix: '.java',
      tokenizer: { root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/@[a-zA-Z_]\w*/, 'annotation'],
        [/(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/, 'string'],
        [/\b(?:abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while|record|sealed|permits|var)\b/, 'keyword'],
        [/\b(?:true|false|null)\b/, 'constant'],
        [/\b\d+(?:\.\d+)?[fFdDlL]?\b/, 'number'],
        [/[a-zA-Z_$][\w$]*/, 'identifier'],
        [/[{}()[\]]/, '@brackets'],
        [/[=<>!~?:&|+*/%-]+/, 'operator'],
        [/[;,.]/, 'delimiter']
      ], comment: [[/\*\//, 'comment', '@pop'], [/./, 'comment']] }
    }
  };
  for (const [id, definition] of Object.entries(definitions)) {
    if (!existing.has(id)) monaco.languages.register({ id });
    monaco.languages.setMonarchTokensProvider(id, definition);
  }
}

function defineEditorTheme() {
  monaco.editor.defineTheme('tzrender-night', {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'tag', foreground: 'B9A8FF' },
      { token: 'attribute.name', foreground: '79DAB7' },
      { token: 'attribute.value', foreground: 'E4C77B' },
      { token: 'comment', foreground: '817B90', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'C2A9FF' },
      { token: 'string', foreground: '91D7B3' },
      { token: 'type.identifier', foreground: '7FCED9' },
      { token: 'number', foreground: 'E9A4C9' }
    ],
    colors: {
      'editor.background': '#15141D', 'editor.foreground': '#E8E4F1',
      'editorLineNumber.foreground': '#666174', 'editorLineNumber.activeForeground': '#B8ADD6',
      'editorCursor.foreground': '#B9A8FF', 'editor.selectionBackground': '#52418777',
      'editor.lineHighlightBackground': '#211E2B', 'editorIndentGuide.background1': '#2B2836',
      'editorIndentGuide.activeBackground1': '#4D4565', 'editorWidget.background': '#211E2B',
      'editorSuggestWidget.background': '#211E2B', 'editorSuggestWidget.border': '#454052',
      'editorBracketHighlight.foreground1': '#C7B5FF', 'editorBracketHighlight.foreground2': '#78D9B7',
      'editorBracketHighlight.foreground3': '#F3C56E'
    }
  });
}

function initEditor() {
  registerLanguages();
  defineEditorTheme();
  const nextProject = normalizeProject({
    format: 'tzrender-project', projectName: project.projectName,
    starter: project.starter, activeFile: project.activeFile, folders: project.folders, files: project.files
  });
  project = nextProject;
  $('projectName').value = project.projectName;
  $('starterSelect').value = project.starter;
  updateProjectName();
  for (const file of project.files) makeModel(file);

  editor = monaco.editor.create($('codeEditor'), {
    model: models.get(activeFileName), theme: 'tzrender-night', automaticLayout: true,
    minimap: { enabled: false }, lineNumbers: 'on', glyphMargin: true, folding: true,
    lineDecorationsWidth: 8, wordWrap: 'on', scrollBeyondLastLine: false,
    tabSize: 2, insertSpaces: true, formatOnPaste: true,
    bracketPairColorization: { enabled: true }, guides: { bracketPairs: true, indentation: true },
    renderWhitespace: 'selection', fontSize: 16, lineHeight: 24,
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    cursorBlinking: 'smooth', smoothScrolling: true, accessibilitySupport: 'auto',
    ariaLabel: 'Multi-language source code editor', padding: { top: 13, bottom: 16 },
    fixedOverflowWidgets: true, colorDecorators: true, suggestOnTriggerCharacters: true,
    quickSuggestions: { other: true, comments: false, strings: true },
    parameterHints: { enabled: true }, autoClosingBrackets: 'languageDefined',
    autoClosingQuotes: 'languageDefined', linkedEditing: true
  });
  setupEditorAppearance(editor, monaco);
  explorer = createFileExplorer({ getProject: snapshotProject, applyProject: applyFilesystemProject,
    openFile: setActiveFile, download: downloadFile, toast: showToast });
  editor.onDidChangeCursorPosition((event) => {
    $('cursorStatus').textContent = `Ln ${event.position.lineNumber}, Col ${event.position.column}`;
  });
  explorer.select(activeFileName);
  updateActiveFileChrome();
  updateProblems();
  setSaveState(readDraft() ? 'Saved only on this device' : 'Ready');
  runProject();
}

function resizeEditorPanels(event) {
  if (window.matchMedia('(max-width: 760px)').matches || window.matchMedia('(max-width: 900px)').matches) return;
  const divider = $('paneDivider');
  const workspaceRect = workspace.getBoundingClientRect();
  const renderedSidebarWidth = workspace.dataset.explorerCollapsed === 'true' ? 42 : sidebarWidth;
  const available = workspaceRect.width - renderedSidebarWidth - 7 - 7;
  const currentLeft = event.clientX - workspaceRect.left - renderedSidebarWidth - 7;
  const codeWidth = Math.max(280, Math.min(available - 320, currentLeft));
  workspace.style.setProperty('--code-width', `${codeWidth}px`);
  editor.layout();
  divider.setAttribute('aria-valuenow', String(Math.round((codeWidth / available) * 100)));
}
function resizeExplorer(event) {
  if (window.matchMedia('(max-width: 900px)').matches || workspace.dataset.explorerCollapsed === 'true') return;
  const rect = workspace.getBoundingClientRect();
  const maximum = Math.min(340, Math.max(160, rect.width - 640));
  sidebarWidth = clamp(event.clientX - rect.left, 160, maximum);
  applyWorkspaceLayout();
}
function resizeOutput(event) {
  if (window.matchMedia('(max-width: 900px)').matches) return;
  const rect = workspace.getBoundingClientRect();
  const maximum = Math.min(360, Math.max(145, rect.height - 245));
  outputHeight = clamp(rect.bottom - event.clientY, 145, maximum);
  applyWorkspaceLayout();
}
function startLayoutResize(kind, event) {
  if (window.matchMedia('(max-width: 900px)').matches) return;
  event.preventDefault();
  layoutResizeState = { kind, pointerId: event.pointerId };
  workspace.classList.add('is-resizing');
  event.currentTarget.setPointerCapture(event.pointerId);
}
function moveLayoutResize(event) {
  if (!layoutResizeState || layoutResizeState.pointerId !== event.pointerId) return;
  if (layoutResizeState.kind === 'explorer') resizeExplorer(event);
  else if (layoutResizeState.kind === 'output') resizeOutput(event);
}
function finishLayoutResize() {
  if (!layoutResizeState) return;
  layoutResizeState = null;
  workspace.classList.remove('is-resizing');
  saveLayoutPreferences();
  editor?.layout();
}
function adjustExplorerWidth(delta) {
  if (workspace.dataset.explorerCollapsed === 'true' && delta > 0) {
    toggleExplorer();
    return;
  }
  sidebarWidth = clamp(sidebarWidth + delta, 160, 340);
  applyWorkspaceLayout();
  saveLayoutPreferences();
}
function adjustOutputHeight(delta) {
  outputHeight = clamp(outputHeight + delta, 145, 360);
  applyWorkspaceLayout();
  saveLayoutPreferences();
}
function handleExplorerResizeKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  adjustExplorerWidth(event.key === 'ArrowRight' ? 24 : -24);
}
function handleOutputResizeKeydown(event) {
  if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  adjustOutputHeight(event.key === 'ArrowUp' ? 24 : -24);
}

function setFocusMode(mode) {
  workspace.dataset.focus = workspace.dataset.focus === mode ? '' : mode;
  if (!workspace.dataset.focus) delete workspace.dataset.focus;
  window.setTimeout(() => editor.layout(), 50);
  return workspace.dataset.focus === mode;
}

function requestFullScreen(element) {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
    return;
  }
  if (!element.requestFullscreen) return showToast('Full-screen mode is not available in this browser.');
  element.requestFullscreen().catch(() => showToast('The browser did not allow full-screen mode.'));
}

function insertPickedColor() {
  const color = $('colorPicker').value;
  const selection = editor.getSelection();
  if (!selection) return;
  editor.executeEdits('tzrender-color-picker', [{ range: selection, text: color, forceMoveMarkers: true }]);
  editor.focus();
}

function runEditorAction(id, successMessage) {
  const action = editor.getAction(id);
  if (!action) return showToast('That command is not available for this file type.');
  Promise.resolve(action.run()).then(() => { if (successMessage) showToast(successMessage); }).catch(() => showToast('That command could not run for this file type.'));
}

function handleGlobalKeydown(event) {
  const modifier = event.metaKey || event.ctrlKey;
  if (!modifier) return;
  const key = event.key.toLowerCase();
  if (modifier && key === 'enter') {
    event.preventDefault();
    runProject({ openPreview: true });
  } else if (modifier && key === 's') {
    event.preventDefault();
    saveDraftNow();
  } else if (modifier && event.shiftKey && key === 'p') {
    event.preventDefault();
    runEditorAction('editor.action.quickCommand');
  }
}

function handleTerminalHistory(event) {
  const input = $('terminalInput');
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    historyCursor = Math.max(0, historyCursor - 1);
    input.value = terminalHistory[historyCursor] || '';
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    historyCursor = Math.min(terminalHistory.length, historyCursor + 1);
    input.value = terminalHistory[historyCursor] || '';
  }
}

function initializeEventHandlers() {
  $('projectName').addEventListener('input', () => {
    $('projectName').value = $('projectName').value.slice(0, 48);
    updateProjectName();
    draftChanged = true;
    $('dirtyIndicator').hidden = false;
    scheduleSave();
  });
  $('starterSelect').addEventListener('change', (event) => replaceWithStarter(event.target.value));
  $('resetProject').addEventListener('click', () => replaceWithStarter(project.starter));
  $('runProject').addEventListener('click', () => runProject({ openPreview: true }));
  $('reloadPreview').addEventListener('click', () => runProject({ openPreview: true }));
  $('autoRun').addEventListener('change', () => {
    if ($('autoRun').checked) schedulePreview();
    else {
      invalidatePreview();
      setPreviewStatus('Auto-run paused', 'paused');
    }
  });
  $('downloadFile').addEventListener('click', downloadActiveFile);
  $('exportProject').addEventListener('click', exportProject);
  $('importProject').addEventListener('click', () => $('projectFileInput').click());
  $('projectFileInput').addEventListener('change', async (event) => {
    try { await importProjectFile(event.target.files?.[0]); }
    catch (error) { showToast(error?.message || 'That project file could not be imported.'); }
    finally { event.target.value = ''; }
  });
  $('renameFile').addEventListener('click', () => explorer.rename(activeFileName));
  $('deleteFile').addEventListener('click', () => explorer.remove(activeFileName));
  $('formatCode').addEventListener('click', () => runEditorAction('editor.action.formatDocument', `${activeFileName} formatted.`));
  $('findCode').addEventListener('click', () => runEditorAction('actions.find'));
  $('goToLine').addEventListener('click', () => runEditorAction('editor.action.gotoLine'));
  $('commandPalette').addEventListener('click', () => runEditorAction('editor.action.quickCommand'));
  $('insertColor').addEventListener('click', () => $('colorPicker').click());
  $('colorPicker').addEventListener('input', insertPickedColor);
  $('tabSize').addEventListener('change', (event) => editor.updateOptions({ tabSize: Number(event.target.value) || 2, insertSpaces: true }));
  $('minimapToggle').addEventListener('change', (event) => editor.updateOptions({ minimap: { enabled: event.target.checked } }));
  $('wordWrapToggle').addEventListener('change', (event) => editor.updateOptions({ wordWrap: event.target.checked ? 'on' : 'off' }));
  $('viewportSize').addEventListener('change', (event) => { $('previewCanvasWrap').dataset.size = event.target.value; });
  $('toggleExplorer').addEventListener('click', toggleExplorer);
  $('collapseExplorer').addEventListener('click', toggleExplorer);
  $('focusCode').addEventListener('click', () => { setFocusMode('code'); });
  $('focusPreview').addEventListener('click', () => { setFocusMode('preview'); });
  $('fullscreenCode').addEventListener('click', () => requestFullScreen($('codePane')));
  $('fullscreenPreview').addEventListener('click', () => requestFullScreen($('previewPane')));
  $('stopPython').addEventListener('click', () => {
    pythonRunSequence += 1;
    const extension = activeFileName.split('.').pop().toLowerCase();
    const stopped = extension === 'php' ? phpRuntime.stop() : extension === 'java' ? javaRuntime.stop() : pythonRuntime.stop();
    if (stopped) appendTerminalLine(`${extension.toUpperCase()} runtime stopped.`, 'warning');
  });
  $('clearOutput').addEventListener('click', () => {
    const active = workspace.dataset.outputTab || 'terminal';
    if (active === 'terminal') clearTerminal('Terminal cleared.');
    else if (active === 'console') clearConsole('Console cleared. Run your preview to see messages.');
    else updateProblems();
  });
  $('terminalForm').addEventListener('submit', submitTerminal);
  $('terminalInput').addEventListener('keydown', handleTerminalHistory);
  document.querySelectorAll('[data-output]').forEach((tab) => tab.addEventListener('click', () => setOutputTab(tab.dataset.output)));
  document.querySelectorAll('[data-panel-tab]').forEach((tab) => tab.addEventListener('click', () => setWorkspacePanel(tab.dataset.panelTab)));
  $('sidebarDivider').addEventListener('pointerdown', (event) => startLayoutResize('explorer', event));
  $('sidebarDivider').addEventListener('pointermove', moveLayoutResize);
  $('sidebarDivider').addEventListener('pointerup', finishLayoutResize);
  $('sidebarDivider').addEventListener('pointercancel', finishLayoutResize);
  $('sidebarDivider').addEventListener('keydown', handleExplorerResizeKeydown);
  $('outputDivider').addEventListener('pointerdown', (event) => startLayoutResize('output', event));
  $('outputDivider').addEventListener('pointermove', moveLayoutResize);
  $('outputDivider').addEventListener('pointerup', finishLayoutResize);
  $('outputDivider').addEventListener('pointercancel', finishLayoutResize);
  $('outputDivider').addEventListener('keydown', handleOutputResizeKeydown);
  $('paneDivider').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    resizeState = { pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  });
  $('paneDivider').addEventListener('pointermove', (event) => { if (resizeState?.pointerId === event.pointerId) resizeEditorPanels(event); });
  $('paneDivider').addEventListener('pointerup', () => { resizeState = null; editor.layout(); });
  $('paneDivider').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const current = editor.getLayoutInfo().width;
    const bounds = workspace.getBoundingClientRect();
    const renderedSidebarWidth = workspace.dataset.explorerCollapsed === 'true' ? 42 : sidebarWidth;
    resizeEditorPanels({ clientX: bounds.left + renderedSidebarWidth + 7 + current + (event.key === 'ArrowRight' ? 32 : -32) });
  });
  $('closeMobileNotice').addEventListener('click', () => { $('mobileEditorNotice').hidden = true; });
  window.addEventListener('keydown', handleGlobalKeydown);
  window.addEventListener('beforeunload', () => {
    clearTimeout(saveTimer);
    if (draftChanged) saveDraftNow();
    pythonRuntime.dispose();
    typeScriptRuntime.dispose();
  });
  window.addEventListener('resize', () => editor.layout());
}

restoreLayoutPreferences();
initEditor();
initializeEventHandlers();
setOutputTab('terminal');
setWorkspacePanel('editor');
clearConsole();
$('mobileEditorNotice').hidden = !window.matchMedia('(max-width: 760px) and (pointer: coarse)').matches;
window.matchMedia('(max-width: 760px) and (pointer: coarse)').addEventListener?.('change', (event) => { $('mobileEditorNotice').hidden = !event.matches; });
$('terminalInput').addEventListener('focus', () => { if (window.matchMedia('(max-width: 760px)').matches) setWorkspacePanel('output'); });
$('terminalPrompt').addEventListener('click', () => $('terminalInput').focus());
window.addEventListener('beforeunload', () => {
  if (draftChanged) {
    try { window.localStorage.setItem(STORAGE_KEY, serializeProject({ projectName: $('projectName').value, starter: project.starter, activeFile: activeFileName, folders: project.folders, files: getFiles() })); }
    catch { /* Best-effort synchronous local draft save. */ }
  }
});
