import * as monaco from '../node_modules/monaco-editor/esm/vs/editor/editor.api.js';
import '../node_modules/monaco-editor/esm/vs/language/html/monaco.contribution.js';
import '../node_modules/monaco-editor/esm/vs/language/css/monaco.contribution.js';
import '../node_modules/monaco-editor/esm/vs/language/json/monaco.contribution.js';
import '../node_modules/monaco-editor/esm/vs/language/typescript/monaco.contribution.js';
import '../node_modules/monaco-editor/esm/vs/editor/contrib/colorPicker/browser/colorPickerContribution.js';
import '../node_modules/monaco-editor/esm/vs/editor/contrib/colorPicker/browser/colorPicker.css';
import editorWorker from '../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import jsonWorker from '../node_modules/monaco-editor/esm/vs/language/json/json.worker.js?worker';
import cssWorker from '../node_modules/monaco-editor/esm/vs/language/css/css.worker.js?worker';
import htmlWorker from '../node_modules/monaco-editor/esm/vs/language/html/html.worker.js?worker';
import tsWorker from '../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker';
import '../node_modules/monaco-editor/min/vs/editor/editor.main.css';
import { buildProjectPreview, buildPythonInfoPreview } from './editor/preview-content.js';
import {
  createStarterProject,
  FILE_TYPES,
  getFileType,
  isSafeFileName,
  loadSavedProject,
  MAX_FILE_CHARS,
  MAX_PROJECT_CHARS,
  MAX_PROJECT_FILES,
  normalizeProject,
  serializeProject,
  STORAGE_KEY,
  STARTERS
} from './editor/project.js';
import { createPythonRuntime } from './editor/python-runtime.js';
import { createTypeScriptRuntime } from './editor/typescript-runtime.js';
import { executeTerminalCommand, getTerminalHelp } from './editor/terminal.js';

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
let modelSequence = 0;
let saveTimer = 0;
let previewTimer = 0;
let markerTimer = 0;
let draftChanged = false;
let consoleCount = 0;
let pythonRunSequence = 0;
let terminalHistory = [];
let historyCursor = 0;
let resizeState = null;

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
  modelSequence += 1;
  return monaco.Uri.parse(`file:///tzrender-workspace-${modelSequence}/${encodeURIComponent(name)}`);
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
  const category = getFileType(name).category;
  return `file-${category}`;
}

function renderFileList() {
  const host = $('fileList');
  host.replaceChildren();
  for (const file of getFiles()) {
    const type = getFileType(file.name);
    const row = document.createElement('div');
    row.className = `file-row${file.name === activeFileName ? ' active' : ''}`;
    row.setAttribute('role', 'listitem');

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'file-open';
    open.dataset.file = file.name;
    open.setAttribute('aria-current', file.name === activeFileName ? 'page' : 'false');
    open.title = file.name;
    const symbol = document.createElement('span');
    symbol.className = `file-symbol ${fileIconClass(file.name)}`;
    symbol.setAttribute('aria-hidden', 'true');
    symbol.textContent = type.icon;
    const label = document.createElement('span');
    label.textContent = file.name;
    open.append(symbol, label);
    open.addEventListener('click', () => setActiveFile(file.name));

    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'file-action';
    rename.setAttribute('aria-label', `Rename ${file.name}`);
    rename.title = `Rename ${file.name}`;
    rename.textContent = '⋯';
    rename.addEventListener('click', () => renameActiveFile(file.name));
    row.append(open, rename);
    host.append(row);
  }
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
  $('runLabel').textContent = file.name.toLowerCase().endsWith('.py') ? 'Run Python' : runnable ? 'Run' : 'Preview only';
  $('runProject').title = file.name.toLowerCase().endsWith('.py')
    ? 'Run this file in the local Python worker'
    : runnable ? 'Run the project preview' : 'This extension receives syntax highlighting only';
  $('languageStatus').replaceChildren(document.createElement('span'), document.createTextNode(` ${type.language.toUpperCase()} · ${type.runnable ? 'runnable/previewable' : 'syntax only'}`));
  $('languageStatus').querySelector('span').className = 'status-dot';
  $('languageStatus').querySelector('span').setAttribute('aria-hidden', 'true');
  $('cursorStatus').textContent = `Ln ${editor?.getPosition()?.lineNumber || 1}, Col ${editor?.getPosition()?.column || 1}`;
  $('deleteFile').disabled = getFiles().length <= 1;
}

function setActiveFile(name) {
  if (!models.has(name) || activeFileName === name) return;
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
  renderFileList();
  updateActiveFileChrome();
  if (window.matchMedia('(max-width: 760px)').matches) setWorkspacePanel('editor');
  scheduleProblems();
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
  const valid = ['editor', 'preview', 'output'].includes(name) ? name : 'editor';
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
    await pythonRuntime.run(source);
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

async function runProject() {
  clearTimeout(previewTimer);
  const activeFile = getFiles().find((file) => file.name === activeFileName);
  if (!activeFile) return;
  const extension = activeFile.name.split('.').pop().toLowerCase();
  if (extension === 'py') {
    setPreviewDocument(buildPythonInfoPreview(activeFile.name), activeFile.name);
    await runPythonFile(activeFile.name, activeFile.content);
    return;
  }
  setPreviewStatus('Preparing preview…', 'running');
  try {
    let compiledTypeScript = [];
    if (['html', 'htm', 'css', 'js', 'mjs', 'ts'].includes(extension)) {
      const typeScriptFiles = getFiles().filter((file) => file.name.toLowerCase().endsWith('.ts'));
      compiledTypeScript = [];
      for (const file of typeScriptFiles) {
        const result = await typeScriptRuntime.compile(file.content);
        applyTypeScriptDiagnostics(file.name, result.diagnostics);
        if (result.diagnostics.some((diagnostic) => diagnostic.category === 1)) {
          throw new Error(`TypeScript compile failed in ${file.name}. See Problems for details.`);
        }
        compiledTypeScript.push(result.code);
      }
    }
    const preview = buildProjectPreview({ activeFile, files: getFiles(), compiledTypeScript });
    setPreviewDocument(preview.srcdoc, preview.path);
    setPreviewStatus(preview.mode === 'document' ? 'Document preview updated' : 'Preview is running', 'running');
    clearConsole('Console cleared. Messages from the next preview run appear here.');
    if (window.matchMedia('(max-width: 760px)').matches) setWorkspacePanel('preview');
  } catch (error) {
    previewFailure(error?.message || 'Could not build the preview.');
  }
}

function schedulePreview() {
  if (!$('autoRun').checked) {
    setPreviewStatus('Changes not run yet', 'paused');
    return;
  }
  const extension = activeFileName.split('.').pop().toLowerCase();
  if (extension === 'py') {
    setPreviewStatus('Python is manual-run only', 'paused');
    return;
  }
  clearTimeout(previewTimer);
  setPreviewStatus('Updating preview…', 'running');
  previewTimer = window.setTimeout(runProject, 550);
}

function setProject(nextProject, { save = true, run = true } = {}) {
  const normalized = normalizeProject({
    format: 'tzrender-project',
    projectName: nextProject.projectName,
    starter: nextProject.starter,
    activeFile: nextProject.activeFile,
    files: nextProject.files
  });
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
  renderFileList();
  updateActiveFileChrome();
  clearConsole();
  clearTerminal('Project loaded. Type help for available local commands.');
  updateProblems();
  if (save) saveDraftNow();
  if (run) runProject();
  if (window.matchMedia('(max-width: 760px)').matches) setWorkspacePanel('editor');
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
  setProject(createStarterProject(key));
  showToast('Starter loaded. The previous project was replaced.');
}

function uniqueNewFileName(extension) {
  const baseNames = { html: 'page', css: 'styles', js: 'script', ts: 'app', py: 'main', md: 'notes', json: 'data', yaml: 'config' };
  const base = baseNames[extension] || 'file';
  let name = `${base}.${extension}`;
  let suffix = 2;
  while (models.has(name)) name = `${base}-${suffix++}.${extension}`;
  return name;
}

function createFile() {
  if (models.size >= MAX_PROJECT_FILES) return showToast(`Projects can contain at most ${MAX_PROJECT_FILES} files.`);
  const extension = $('newFileType').value;
  if (!Object.hasOwn(FILE_TYPES, extension)) return showToast('That file type is not supported.');
  const file = { name: uniqueNewFileName(extension), content: '' };
  makeModel(file);
  project.activeFile = file.name;
  setActiveFile(file.name);
  renderFileList();
  draftChanged = true;
  $('dirtyIndicator').hidden = false;
  scheduleSave();
  editor.focus();
  showToast(`${file.name} created.`);
}

function renameActiveFile(name = activeFileName) {
  if (!models.has(name)) return;
  const nextName = window.prompt('Rename file (include its extension):', name);
  if (nextName === null) return;
  const trimmed = nextName.trim();
  if (!isSafeFileName(trimmed)) return showToast('Use a supported file name without folders or spaces.');
  if (trimmed.toLowerCase() !== name.toLowerCase() && [...models.keys()].some((item) => item.toLowerCase() === trimmed.toLowerCase())) return showToast('A file with that name already exists.');
  if (trimmed === name) return;
  const oldModel = models.get(name);
  const viewState = viewStates.get(name);
  const newModel = makeModel({ name: trimmed, content: oldModel.getValue() });
  if (activeFileName === name) {
    editor.setModel(newModel);
    activeFileName = trimmed;
    project.activeFile = trimmed;
  }
  modelSubscriptions.get(name)?.dispose();
  modelSubscriptions.delete(name);
  models.delete(name);
  oldModel.dispose();
  viewStates.delete(name);
  if (viewState) viewStates.set(trimmed, viewState);
  $('dirtyIndicator').hidden = false;
  draftChanged = true;
  renderFileList();
  updateActiveFileChrome();
  scheduleSave();
  schedulePreview();
  showToast(`Renamed to ${trimmed}.`);
}

function deleteActiveFile() {
  const file = getFiles().find((item) => item.name === activeFileName);
  if (!file) return;
  if (models.size <= 1) return showToast('A project must keep at least one file.');
  const htmlFiles = getFiles().filter((item) => ['html', 'htm'].includes(item.name.split('.').pop().toLowerCase()));
  if (htmlFiles.length === 1 && htmlFiles[0].name === file.name) return showToast('Add another HTML file before deleting the last page.');
  if (!window.confirm(`Delete ${file.name}? This cannot be undone.`)) return;
  const name = file.name;
  const nextFile = getFiles().find((item) => item.name !== name);
  if (activeFileName === name) setActiveFile(nextFile.name);
  modelSubscriptions.get(name)?.dispose();
  modelSubscriptions.delete(name);
  models.get(name)?.dispose();
  models.delete(name);
  viewStates.delete(name);
  project.activeFile = activeFileName;
  draftChanged = true;
  $('dirtyIndicator').hidden = false;
  renderFileList();
  updateActiveFileChrome();
  scheduleSave();
  schedulePreview();
  showToast(`${name} deleted.`);
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
  downloadFile(file.name, file.content, mime);
  showToast(`${file.name} downloaded.`);
}

function exportProject() {
  try {
    const serialized = serializeProject({
      projectName: $('projectName').value,
      starter: project.starter,
      activeFile: activeFileName,
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
  if (file.size > MAX_PROJECT_CHARS * 2) throw new Error('Project backups must be smaller than 2 MB.');
  const parsed = JSON.parse(await file.text());
  const imported = normalizeProject(parsed);
  if (!confirmReplace('Import this project?')) return;
  setProject(imported);
  showToast('Project imported and saved in this browser.');
}

function renderPreviewFile() {
  runProject();
}

function runTerminalPython(filename) {
  const file = getFiles().find((item) => item.name === filename);
  if (!file) return Promise.reject(new Error(`Python file not found: ${filename}`));
  return runPythonFile(file.name, file.content);
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
      runActive: runProject,
      runPython: runTerminalPython,
      showPreview: () => setWorkspacePanel('preview'),
      clear: () => clearTerminal(''),
      stopPython: () => {
        pythonRunSequence += 1;
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

function applyTheme(theme) {
  const value = ['vs', 'hc-black', 'tzrender-night'].includes(theme) ? theme : 'tzrender-night';
  monaco.editor.setTheme(value);
  $('editorTheme').value = value;
  document.documentElement.dataset.theme = value === 'vs' ? 'light' : 'dark';
  try { window.localStorage.setItem('tzrender-editor-theme', value); } catch { /* Theme preference is optional. */ }
}

function initEditor() {
  registerLanguages();
  defineEditorTheme();
  const nextProject = normalizeProject({
    format: 'tzrender-project', projectName: project.projectName,
    starter: project.starter, activeFile: project.activeFile, files: project.files
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
    renderWhitespace: 'selection', fontSize: 14, lineHeight: 21,
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    cursorBlinking: 'smooth', smoothScrolling: true, accessibilitySupport: 'auto',
    ariaLabel: 'Multi-language source code editor', padding: { top: 13, bottom: 16 },
    fixedOverflowWidgets: true, colorDecorators: true, suggestOnTriggerCharacters: true,
    quickSuggestions: { other: true, comments: false, strings: true },
    parameterHints: { enabled: true }, autoClosingBrackets: 'languageDefined',
    autoClosingQuotes: 'languageDefined', linkedEditing: true
  });
  editor.onDidChangeCursorPosition((event) => {
    $('cursorStatus').textContent = `Ln ${event.position.lineNumber}, Col ${event.position.column}`;
  });
  renderFileList();
  updateActiveFileChrome();
  updateProblems();
  try {
    applyTheme(window.localStorage.getItem('tzrender-editor-theme') || 'tzrender-night');
  } catch {
    applyTheme('tzrender-night');
  }
  setSaveState(readDraft() ? 'Saved only on this device' : 'Ready');
  runProject();
}

function resizeEditorPanels(event) {
  if (window.matchMedia('(max-width: 760px)').matches || window.matchMedia('(max-width: 900px)').matches) return;
  const divider = $('paneDivider');
  const workspaceRect = workspace.getBoundingClientRect();
  const sidebarWidth = $('fileSidebar')?.getBoundingClientRect().width || 205;
  const available = workspaceRect.width - sidebarWidth - 7;
  const currentLeft = event.clientX - workspaceRect.left - sidebarWidth;
  const codeWidth = Math.max(280, Math.min(available - 320, currentLeft));
  workspace.style.gridTemplateColumns = `${sidebarWidth}px ${codeWidth}px 7px minmax(320px, 1fr)`;
  editor.layout();
  divider.setAttribute('aria-valuenow', String(Math.round((codeWidth / available) * 100)));
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
    runProject();
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
  $('runProject').addEventListener('click', runProject);
  $('reloadPreview').addEventListener('click', runProject);
  $('autoRun').addEventListener('change', () => {
    if ($('autoRun').checked) runProject();
    else setPreviewStatus('Auto-run paused', 'paused');
  });
  $('downloadFile').addEventListener('click', downloadActiveFile);
  $('exportProject').addEventListener('click', exportProject);
  $('importProject').addEventListener('click', () => $('projectFileInput').click());
  $('projectFileInput').addEventListener('change', async (event) => {
    try { await importProjectFile(event.target.files?.[0]); }
    catch (error) { showToast(error?.message || 'That project file could not be imported.'); }
    finally { event.target.value = ''; }
  });
  $('addFile').addEventListener('click', createFile);
  $('renameFile').addEventListener('click', () => renameActiveFile());
  $('deleteFile').addEventListener('click', deleteActiveFile);
  $('formatCode').addEventListener('click', () => runEditorAction('editor.action.formatDocument', `${activeFileName} formatted.`));
  $('findCode').addEventListener('click', () => runEditorAction('actions.find'));
  $('goToLine').addEventListener('click', () => runEditorAction('editor.action.gotoLine'));
  $('commandPalette').addEventListener('click', () => runEditorAction('editor.action.quickCommand'));
  $('insertColor').addEventListener('click', () => $('colorPicker').click());
  $('colorPicker').addEventListener('input', insertPickedColor);
  $('editorTheme').addEventListener('change', (event) => applyTheme(event.target.value));
  $('fontSize').addEventListener('change', (event) => editor.updateOptions({ fontSize: Number(event.target.value) || 14 }));
  $('tabSize').addEventListener('change', (event) => editor.updateOptions({ tabSize: Number(event.target.value) || 2, insertSpaces: true }));
  $('minimapToggle').addEventListener('change', (event) => editor.updateOptions({ minimap: { enabled: event.target.checked } }));
  $('wordWrapToggle').addEventListener('change', (event) => editor.updateOptions({ wordWrap: event.target.checked ? 'on' : 'off' }));
  $('viewportSize').addEventListener('change', (event) => { $('previewCanvasWrap').dataset.size = event.target.value; });
  $('focusCode').addEventListener('click', () => { setFocusMode('code'); });
  $('focusPreview').addEventListener('click', () => { setFocusMode('preview'); });
  $('fullscreenCode').addEventListener('click', () => requestFullScreen($('codePane')));
  $('fullscreenPreview').addEventListener('click', () => requestFullScreen($('previewPane')));
  $('stopPython').addEventListener('click', () => {
    pythonRunSequence += 1;
    if (pythonRuntime.stop()) appendTerminalLine('Python worker stopped.', 'warning');
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
    resizeEditorPanels({ clientX: bounds.left + 205 + current + (event.key === 'ArrowRight' ? 32 : -32) });
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
    try { window.localStorage.setItem(STORAGE_KEY, serializeProject({ projectName: $('projectName').value, starter: project.starter, activeFile: activeFileName, files: getFiles() })); }
    catch { /* Best-effort synchronous local draft save. */ }
  }
});
