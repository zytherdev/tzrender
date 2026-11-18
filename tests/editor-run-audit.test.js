import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { URI } from '../node_modules/monaco-editor/esm/vs/base/common/uri.js';
import * as projectModule from '../site/editor/project.js';
import * as previews from '../site/editor/preview-content.js';

// Exercise the real controller functions with Monaco and the workers replaced by
// small deterministic doubles. The page and preview builder remain real.
const html = readFileSync(`${process.cwd()}/editor.html`, 'utf8');
let controllerSource = readFileSync(`${process.cwd()}/site/editor.js`, 'utf8')
  .replace(/^import\s+[^'";]+?\s+from\s+['"][^'"]+['"];\s*/gm, '')
  .replace(/^import\s+['"][^'"]+['"];\s*/gm, '');
controllerSource = controllerSource.slice(0, controllerSource.lastIndexOf('\nrestoreLayoutPreferences();'));
const file = (name, content = '') => ({ name, content });
const page = (body) => `<!doctype html><html><head></head><body>${body}</body></html>`;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
let compile, markers, app, mobile;

function harness() {
  markers = vi.fn();
  compile = vi.fn(async (source) => ({ code: `/* COMPILED: ${source} */`, diagnostics: [] }));
  const monaco = {
    Uri: URI,
    MarkerSeverity: { Error: 8, Warning: 4 },
    editor: {
      createModel(content, _language, uri) {
        uri.toString(); // Monaco indexes models by URI and rejects malformed Unicode.
        let value = content;
        const listeners = new Set();
        return {
          uri,
          getValue: () => value,
          setValue(next) { value = next; for (const listener of listeners) listener(); },
          onDidChangeContent(listener) { listeners.add(listener); return { dispose: () => listeners.delete(listener) }; },
          dispose() { listeners.clear(); }
        };
      },
      getModelMarkers: () => [],
      setModelMarkers: markers
    }
  };
  const runtime = { run: vi.fn(), stop: vi.fn(), dispose: vi.fn() };
  const dependencies = {
    monaco, ...projectModule, ...previews,
    editorWorker: class {}, jsonWorker: class {}, cssWorker: class {}, htmlWorker: class {}, tsWorker: class {},
    createPythonRuntime: () => runtime, createPhpRuntime: () => runtime, createJavaRuntime: () => runtime,
    createTypeScriptRuntime: () => ({ compile, dispose: vi.fn() }),
    executeTerminalCommand: vi.fn(), getTerminalHelp: vi.fn(), createFileExplorer: vi.fn(), setupEditorAppearance: vi.fn()
  };
  return new Function(...Object.keys(dependencies), `${controllerSource}\nreturn {
    setProject, setActiveFile, runProject, schedulePreview, saveDraftNow,
    importProjectFile, initializeEventHandlers, snapshotProject, safeFileUri, models, previewTypeScriptIndices,
    languageRuntime: createPythonRuntime()
  };`)(...Object.values(dependencies));
}

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.innerHTML = html.match(/<html[^>]*>([\s\S]*)<\/html>/i)[1];
  window.localStorage.clear();
  mobile = true;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  window.matchMedia = vi.fn((query) => ({ matches: mobile && /max-width/.test(query), addEventListener: vi.fn() }));
  window.confirm = vi.fn(() => true);
  app = harness();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function load(files, activeFile = files[0].name, folders = []) {
  app.setProject({ projectName: 'Test', starter: 'blank', files, activeFile, folders }, { save: false, run: false });
}
function currentPreview() { return document.getElementById('previewFrame').srcdoc; }
function panel() { return document.getElementById('editorWorkspace').dataset.panel; }


describe('editor preview controller', () => {
  it('passes the Program input buffer to Python, PHP and Java runs', async () => {
    const app = harness();
    const input = document.getElementById('programInput');
    input.value = 'Ada\n42\n';
    app.setProject({ projectName: 'Test', starter: 'blank', files: [file('main.py', 'name = input()')], activeFile: 'main.py' }, { save: false, run: false });
    await app.runProject();
    expect(app.languageRuntime.run).toHaveBeenCalledWith('name = input()', { input: 'Ada\n42\n' });
    app.setProject({ projectName: 'Test', starter: 'blank', files: [file('main.php', '<?php echo file_get_contents("php://input");')], activeFile: 'main.php' }, { save: false, run: false });
    await app.runProject();
    expect(app.languageRuntime.run).toHaveBeenCalledWith('main.php', '<?php echo file_get_contents("php://input");', { input: 'Ada\n42\n' });
    app.setProject({ projectName: 'Test', starter: 'blank', files: [file('Main.java', 'class Main {}')], activeFile: 'Main.java' }, { save: false, run: false });
    await app.runProject();
    expect(app.languageRuntime.run).toHaveBeenCalledWith('Main.java', 'class Main {}', { input: 'Ada\n42\n' });
  });

  it('compiles only referenced TypeScript and preserves its original output index', async () => {
    const files = [file('unrelated.ts', 'export const outside = 1'),
      file('pages/page.html', page('<h1>Page</h1><script src="../src/main.ts?v=1"></script>')),
      file('src/main.ts', 'MAIN_SOURCE'), file('other.html', page('other'))];
    load(files, 'pages/page.html');
    await app.runProject();
    expect(compile).toHaveBeenCalledTimes(1);
    expect(compile).toHaveBeenCalledWith('MAIN_SOURCE');
    expect(currentPreview()).toContain('COMPILED: MAIN_SOURCE');
    expect(currentPreview()).not.toContain('outside');
  });

  it('preserves the legacy fallback but only compiles same-directory TypeScript', async () => {
    const files = [file('docs/page.html', page('<h1>Legacy</h1>')), file('docs/app.ts', 'LOCAL_TS'),
      file('other/unrelated.ts', 'export const outside = 1'), file('other/page.html', page('another page'))];
    load(files);
    await app.runProject();
    expect(compile.mock.calls.map(([source]) => source)).toEqual(['LOCAL_TS']);
    expect(currentPreview()).toContain('COMPILED: LOCAL_TS');
    app.models.get('docs/page.html').setValue(page('<script src="https://example.test/app.js"></script>'));
    compile.mockClear();
    await app.runProject();
    expect(compile).not.toHaveBeenCalled();
  });

  it('selecting a page schedules its preview but never switches mobile Auto-run away from code', async () => {
    load([file('index.html', page('FIRST_PAGE')), file('pages/next.html', page('NEXT_PAGE'))]);
    await app.runProject();
    expect(panel()).toBe('editor');
    app.setActiveFile('pages/next.html');
    await vi.advanceTimersByTimeAsync(550);
    expect(currentPreview()).toContain('NEXT_PAGE');
    expect(document.getElementById('previewUrl').textContent).toBe('/pages/next.html');
    expect(panel()).toBe('editor');
    await app.runProject({ openPreview: true });
    expect(panel()).toBe('preview');
    app.setActiveFile('index.html');
    await vi.advanceTimersByTimeAsync(550);
    expect(panel()).toBe('editor');
  });

  it('rejects late output and diagnostics after a newer run and after a model edit while Auto-run is off', async () => {
    const old = deferred();
    const newer = deferred();
    compile.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => newer.promise);
    load([file('a.html', page('<h1>OLD_PAGE</h1><script src="old.ts"></script>')),
      file('old.ts', 'OLD_TS'), file('b.html', page('<h1>NEW_PAGE</h1><script src="new.ts"></script>')),
      file('new.ts', 'NEW_TS')], 'a.html');
    const oldRun = app.runProject();
    app.setActiveFile('b.html');
    const newRun = app.runProject();
    newer.resolve({ code: 'window.NEW_COMPILED = 1;', diagnostics: [] });
    await newRun;
    const latest = currentPreview();
    expect(latest).toContain('NEW_PAGE');
    expect(latest).toContain('window.NEW_COMPILED = 1;');
    old.resolve({ code: 'window.OLD_COMPILED = 1;', diagnostics: [{ category: 1, message: 'stale' }] });
    await oldRun;
    expect(currentPreview()).toBe(latest);
    expect(markers).toHaveBeenCalledTimes(1);
    expect(document.getElementById('previewStatus').textContent).not.toContain('could not run');

    const later = deferred();
    compile.mockImplementationOnce(() => later.promise);
    const staleRun = app.runProject();
    document.getElementById('autoRun').checked = false;
    app.models.get('new.ts').setValue('CHANGED_SOURCE');
    later.reject(new Error('obsolete compilation error'));
    await staleRun;
    expect(currentPreview()).toBe(latest);
    expect(document.getElementById('previewStatus').textContent).toContain('Changes not run yet');
    expect(document.getElementById('consolePanel').textContent).not.toContain('obsolete');
  });

  it('pausing Auto-run cancels a pending update and invalidates an in-flight compilation', async () => {
    app.initializeEventHandlers();
    const pending = deferred();
    compile.mockImplementationOnce(() => pending.promise);
    load([file('index.html', page('<script src="app.ts"></script>')), file('app.ts', 'APP')]);
    const run = app.runProject();
    const toggle = document.getElementById('autoRun');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    pending.resolve({ code: 'window.STALE = 1', diagnostics: [] });
    await run;
    expect(currentPreview()).not.toContain('window.STALE');
    expect(document.getElementById('previewStatus').textContent).toContain('Auto-run paused');
  });
});

describe('editor project backup and persistence', () => {
  it('creates distinct usable Monaco URIs for allowed paths with isolated surrogates', () => {
    const names = ['\ud800.txt', '%ud800.txt', '\ud800%25.txt', '\ud800%.txt', '💻.txt'];
    load(names.map((name) => file(name)));
    const uris = names.map((name) => app.safeFileUri(name).toString());
    expect(new Set(uris).size).toBe(names.length);
    expect(uris.at(-1)).toContain('/tzrender-workspace/');
  });

  it('imports a real exported backup with escaped content, long paths and empty folders above 2 MB', async () => {
    load([file('index.html', page('original'))]);
    expect(app.saveDraftNow()).toBe(true);
    const previousDraft = window.localStorage.getItem(projectModule.STORAGE_KEY);
    const prefix = ['\ud800'.repeat(250), 'b'.repeat(250), 'c'.repeat(250)].join('/');
    const files = Array.from({ length: 10 }, (_, index) => file(`${prefix}/f${index}.txt`, '\u0000'.repeat(100_000)));
    const serialized = projectModule.serializeProject({ projectName: 'Large', files, folders: [`${prefix}/empty`] });
    const pretty = JSON.stringify(JSON.parse(serialized), null, 2);
    const size = Buffer.byteLength(pretty, 'utf8');
    expect(size).toBeGreaterThan(projectModule.MAX_PROJECT_CHARS * 2);
    await app.importProjectFile({ size, text: async () => pretty });
    expect(app.models.size).toBe(10);
    expect(app.models.get(files[9].name).getValue()).toBe(files[9].content);
    expect(app.snapshotProject().folders).toContain(`${prefix}/empty`);
    // jsdom's 5-million-code-unit storage quota is below this valid backup.
    expect(window.localStorage.getItem(projectModule.STORAGE_KEY)).toBe(previousDraft);
    expect(document.getElementById('saveState').classList.contains('is-error')).toBe(true);
    expect(document.getElementById('siteToast').textContent).toContain('Could not save draft');
  });

  it('imports UTF-8 content exceeding 2 MB even when its string length does not', async () => {
    load([file('index.html', page('original'))]);
    const files = Array.from({ length: 10 }, (_, index) => file(`f${index}.txt`, '中'.repeat(100_000)));
    const pretty = JSON.stringify(JSON.parse(projectModule.serializeProject({ files })), null, 2);
    const size = Buffer.byteLength(pretty, 'utf8');
    expect(size).toBeGreaterThan(projectModule.MAX_PROJECT_CHARS * 2);
    await app.importProjectFile({ size, text: async () => pretty });
    expect(app.models.size).toBe(10);
    expect(window.localStorage.getItem(projectModule.STORAGE_KEY)).toContain('中');
    expect(document.getElementById('siteToast').textContent).toContain('imported and saved');
  });

  it('accepts exported maximum counts with long JSON-escaped file and folder paths', async () => {
    load([file('index.html', page('original'))]);
    const prefix = Array(3).fill('\ud800'.repeat(250)).join('/');
    const suffix = '\ud801'.repeat(240);
    const files = Array.from({ length: projectModule.MAX_PROJECT_FILES }, (_, index) =>
      file(`${prefix}/${suffix}f${index}`, index < 10 ? '\u0000'.repeat(projectModule.MAX_FILE_CHARS) : ''));
    const folders = Array.from({ length: projectModule.MAX_PROJECT_FOLDERS - 3 }, (_, index) => `${prefix}/${suffix}d${index}`);
    const pretty = JSON.stringify(JSON.parse(projectModule.serializeProject({ files, folders })), null, 2);
    const size = Buffer.byteLength(pretty, 'utf8');
    expect(size).toBeGreaterThan(12_000_000);
    await app.importProjectFile({ size, text: async () => pretty });
    expect(app.models.size).toBe(projectModule.MAX_PROJECT_FILES);
    expect(app.snapshotProject().folders).toHaveLength(projectModule.MAX_PROJECT_FOLDERS);
  });

  it('rejects over-limit bytes before reading and preserves the old saved project if a draft is invalid', async () => {
    load([file('index.html', page('original'))]);
    expect(app.saveDraftNow()).toBe(true);
    const original = window.localStorage.getItem(projectModule.STORAGE_KEY);
    const read = vi.fn();
    await expect(app.importProjectFile({ size: 100_000_000, text: read })).rejects.toThrow(/bytes/);
    expect(read).not.toHaveBeenCalled();
    app.models.get('index.html').setValue('x'.repeat(projectModule.MAX_FILE_CHARS + 1));
    expect(app.saveDraftNow()).toBe(false);
    expect(window.localStorage.getItem(projectModule.STORAGE_KEY)).toBe(original);
    expect(document.getElementById('saveState').textContent).toContain('Local save unavailable');
    expect(document.getElementById('saveState').classList.contains('is-error')).toBe(true);
    expect(document.getElementById('siteToast').textContent).toContain('100,000');
  });
});
