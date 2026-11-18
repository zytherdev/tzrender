import { describe, expect, it } from 'vitest';
import {
  createStarterProject, FILE_TYPES, getFileType, isSafeFileName, isSafeFolderName,
  LEGACY_STORAGE_KEY, loadSavedProject, MAX_FILE_CHARS, MAX_FILE_NAME,
  MAX_PATH_LENGTH, MAX_PROJECT_CHARS, MAX_PROJECT_FILES, MAX_PROJECT_FOLDERS,
  normalizeProject, serializeProject, STARTERS, STORAGE_KEY
} from '../site/editor/project.js';

const storage = (values) => ({ getItem: (key) => values[key] ?? null });
const file = (name, content = '') => ({ name, content });

describe('project paths and validation', () => {
  it('supports nested, extensionless, Unicode, spaced and hidden names', () => {
    for (const path of ['README', '.env', '.git/config', 'src/Olá mundo.abc', 'a-b/_test.file', 'src/file+name@v2',
      'CON', 'aux.txt', 'LPT1.html', 'nul.css', 'prn/COM9.js', 'constructor.js', 'prototype.json', '__proto__.txt']) {
      expect(isSafeFileName(path), path).toBe(true);
      expect(isSafeFolderName(path), path).toBe(true);
    }
    expect(getFileType('weird.unknown').language).toBe('plaintext');
    expect(getFileType('constructor').language).toBe('plaintext');
    expect(getFileType('src/app.TS').language).toBe('typescript');
  });

  it('rejects traversal, absolute, control, dangerous and non-portable names', () => {
    const bad = ['', '.', '..', '../secret', 'a/../b', 'a/./b', '/etc/passwd', 'a//b', 'a/',
      'C:\\secret', 'C:/secret', 'a\\b', 'a/\0b', 'name\nfile', 'foo\u202ebar',
      'x/__proto__/a', 'constructor', 'x/PROTOTYPE', 'file.', 'file ',
      'x/'.concat('a'.repeat(MAX_FILE_NAME + 1)), 'a/'.repeat(Math.ceil(MAX_PATH_LENGTH / 2)) + 'b'];
    for (const path of bad) {
      expect(isSafeFileName(path), JSON.stringify(path)).toBe(false);
      expect(isSafeFolderName(path), JSON.stringify(path)).toBe(false);
      expect(() => normalizeProject({ files: [file(path)] }), JSON.stringify(path)).toThrow();
    }
    expect(isSafeFolderName(null)).toBe(false);
  });

  it('infers all ancestors while preserving explicitly empty folders', () => {
    const project = normalizeProject({
      files: [file('src/components/app.ts', 'hello')], folders: ['assets/icons/empty', '.config'], activeFile: 'src/components/app.ts'
    });
    expect(project.folders).toEqual(['assets', 'assets/icons', 'assets/icons/empty', '.config', 'src', 'src/components']);
    expect(project.activeFile).toBe('src/components/app.ts');
    expect(normalizeProject({ files: [file('root')], folders: ['a/b', 'a'] }).folders).toEqual(['a', 'a/b']);
  });

  it('rejects case-insensitive conflicts between files, folders and inferred ancestors', () => {
    const bad = [
      { files: [file('A.txt'), file('a.TXT')] },
      { files: [file('Straße'), file('STRASSE')] },
      { files: [file('σ.txt'), file('ς.TXT')] },
      { files: [file('café'), file('cafe\u0301')] },
      { files: [file('a')], folders: ['A'] },
      { files: [file('a'), file('A/b')] },
      { files: [file('A/b'), file('a/c')] },
      { files: [file('x')], folders: ['Dir', 'dir'] },
      { files: [file('x')], folders: ['Dir/sub', 'dir/other'] },
      { files: [file('x')], folders: ['x/sub'] },
      { files: [file('x')], folders: ['same', 'same'] }
    ];
    for (const input of bad) expect(() => normalizeProject(input)).toThrow(/conflict|duplicate/i);
  });

  it('validates content types, lengths, numbers and folders', () => {
    expect(() => normalizeProject({ files: [] })).toThrow();
    expect(() => normalizeProject({ files: [file('x', null)] })).toThrow(/text/i);
    expect(() => normalizeProject({ files: [file('x', 'a'.repeat(MAX_FILE_CHARS + 1))] })).toThrow();
    const fileCount = Array.from({ length: MAX_PROJECT_FILES + 1 }, (_, i) => file(`file${i}`));
    expect(() => normalizeProject({ files: fileCount })).toThrow();
    const oversized = Array.from({ length: MAX_PROJECT_CHARS / MAX_FILE_CHARS + 1 }, (_, i) => file(`file${i}`, 'x'.repeat(MAX_FILE_CHARS)));
    expect(() => normalizeProject({ files: oversized })).toThrow(/total characters/i);
    const tooManyFolders = Array.from({ length: MAX_PROJECT_FOLDERS + 1 }, (_, i) => `folder${i}`);
    expect(() => normalizeProject({ files: [file('x')], folders: tooManyFolders })).toThrow(/folders/i);
    expect(() => normalizeProject({ files: [file('x')], folders: null })).toThrow(/array/i);
    expect(() => normalizeProject({ files: [file('x')], folders: ['../no'] })).toThrow(/unsafe/i);
  });
});

describe('project persistence and old versions', () => {
  it('round-trips nested files, empty folders and active file through v2 JSON and draft', () => {
    const project = { projectName: 'Test', starter: 'blank', activeFile: 'src/app.xyz', files: [file('src/app.xyz', 'hello')], folders: ['src', 'empty/sub'] };
    const serialized = serializeProject(project);
    const exported = JSON.parse(serialized);
    expect(exported.version).toBe(2);
    expect(exported.folders).toEqual(['src', 'empty', 'empty/sub']);
    expect(normalizeProject(exported)).toMatchObject({ ...project, folders: exported.folders });
    expect(loadSavedProject(storage({ [STORAGE_KEY]: serialized }))).toEqual(normalizeProject(exported));
  });

  it('restores old v2 arrays and old v1 objects, including active legacy key', () => {
    const v2 = { version: 2, projectName: 'Old', activeFile: 'main.py', files: [file('main.py', 'print(1)')] };
    expect(loadSavedProject(storage({ [STORAGE_KEY]: JSON.stringify(v2) }))).toMatchObject({ activeFile: 'main.py', folders: [] });
    const v1 = { version: 1, projectName: 'Legacy', activeFile: 'css', files: { html: '<p>x</p>', css: 'p{}', js: 'ok()' } };
    expect(loadSavedProject(storage({ [LEGACY_STORAGE_KEY]: JSON.stringify(v1) }))).toMatchObject({
      projectName: 'Legacy', activeFile: 'styles.css', folders: [],
      files: [file('index.html', '<p>x</p>'), file('styles.css', 'p{}'), file('script.js', 'ok()')]
    });
    expect(normalizeProject(v1).activeFile).toBe('styles.css');
  });

  it('loads and preserves old v2 drafts with Windows device-like file names', () => {
    const files = [file('con.txt', 'console'), file('aux.js', 'const aux = 1;'),
      file('LPT1.html', '<p>printer</p>'), file('nul.css', 'body {}')];
    const draft = { version: 2, projectName: 'Old device names', starter: 'blank', activeFile: 'aux.js', files };
    const legacy = { version: 1, files: { html: 'fallback' } };
    const loaded = loadSavedProject(storage({
      [STORAGE_KEY]: JSON.stringify(draft), [LEGACY_STORAGE_KEY]: JSON.stringify(legacy)
    }));
    expect(loaded).toEqual({ projectName: draft.projectName, starter: 'blank', activeFile: 'aux.js', files, folders: [] });
    expect(loadSavedProject(storage({ [STORAGE_KEY]: serializeProject(loaded) }))).toEqual(loaded);
  });

  it('restores prototype-like file names without admitting dangerous path segments', () => {
    const files = [file('constructor.js', 'first'), file('prototype.json', '{"ok":true}'), file('__proto__.txt', 'third')];
    const draft = { version: 2, projectName: 'Safe names', activeFile: 'prototype.json', files };
    const loaded = loadSavedProject(storage({ [STORAGE_KEY]: JSON.stringify(draft) }));
    expect(loaded).toMatchObject({ projectName: draft.projectName, activeFile: draft.activeFile, files, folders: [] });
    expect(loadSavedProject(storage({ [STORAGE_KEY]: serializeProject(loaded) }))).toEqual(loaded);
    const asMap = Object.fromEntries(files.map(({ name, content }) => [name, content]));
    expect(loadSavedProject(storage({ [STORAGE_KEY]: JSON.stringify({ ...draft, files: asMap }) })).files).toEqual(files);
    expect({}.polluted).toBeUndefined();
  });

  it('loads representative v2 names across every character and extension admitted by the old validator', () => {
    const firstChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const restChars = `${firstChars}._-`;
    const names = [
      ...Array.from(firstChars, (ch) => `${ch}.js`),
      ...Array.from(restChars, (ch) => `a${ch}z.js`),
      ...Object.keys(FILE_TYPES).flatMap((extension) => [
        extension, extension.toUpperCase(), `constructor.${extension}`, `prototype.${extension.toUpperCase()}`,
        `${'a'.repeat(62 - extension.length)}.${extension}`
      ])
    ];
    const oldPattern = /^(?!\.{1,2}$)[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;
    const legacy = { version: 1, files: { html: 'fallback' } };
    for (const name of names) {
      expect(oldPattern.test(name), name).toBe(true);
      expect(Object.hasOwn(FILE_TYPES, name.split('.').pop().toLowerCase()), name).toBe(true);
      const draft = { version: 2, projectName: 'Original', activeFile: name, files: [file(name, 'old content')] };
      const loaded = loadSavedProject(storage({ [STORAGE_KEY]: JSON.stringify(draft), [LEGACY_STORAGE_KEY]: JSON.stringify(legacy) }));
      expect(loaded, name).toMatchObject({ projectName: 'Original', activeFile: name, files: draft.files });
    }
  });

  it('rejects v2 drafts with traversal or prototype-pollution paths', () => {
    for (const path of ['../con.txt', 'aux.js/../safe', 'x/__proto__/polluted', 'x/constructor/a', 'PROTOTYPE']) {
      const draft = { version: 2, files: [file('con.txt', 'ok'), file(path, 'bad')] };
      expect(loadSavedProject(storage({ [STORAGE_KEY]: JSON.stringify(draft) })), path).toBeNull();
    }
    expect({}.polluted).toBeUndefined();
  });

  it('recovers the older draft when the current draft is malformed', () => {
    const old = { version: 1, files: { html: 'ok' }, folders: ['old/empty'] };
    expect(loadSavedProject(storage({ [STORAGE_KEY]: '{', [LEGACY_STORAGE_KEY]: JSON.stringify(old) }))).toMatchObject({
      files: [file('index.html', 'ok')], folders: ['old', 'old/empty']
    });
    expect(loadSavedProject(storage({ [STORAGE_KEY]: JSON.stringify({ version: 3 }) }))).toBeNull();
    expect(loadSavedProject(storage({ [STORAGE_KEY]: JSON.stringify({ version: 2, files: [file('../bad')] }) }))).toBeNull();
  });

  it('restores strings with worst-case JSON escaping at the content limit', () => {
    const files = Array.from({ length: 10 }, (_, i) => file(`f${i}`, '\u0000'.repeat(MAX_FILE_CHARS)));
    const serialized = serializeProject({ files, folders: ['empty'] });
    expect(serialized.length).toBeGreaterThan(MAX_PROJECT_CHARS * 2);
    expect(loadSavedProject(storage({ [STORAGE_KEY]: serialized })).files).toEqual(files);
  });

  it('initializes starter folders independently and handles file maps', () => {
    const first = createStarterProject();
    const second = createStarterProject();
    first.folders.push('empty');
    expect(second.folders).toEqual([]);
    expect(normalizeProject({ files: { 'nested/noext': 'text' } })).toMatchObject({
      files: [file('nested/noext', 'text')], folders: ['nested']
    });
    expect(createStarterProject('constructor').starter).toBe('landing');
  });

  it('preserves explicit empty folders and infers ancestors for a starter', () => {
    STARTERS.nestedTest = { name: 'Nested', files: [file('src/deep/app')], folders: ['empty/child'] };
    try {
      expect(createStarterProject('nestedTest')).toMatchObject({
        starter: 'nestedTest', activeFile: 'src/deep/app',
        folders: ['empty', 'empty/child', 'src', 'src/deep']
      });
    } finally {
      delete STARTERS.nestedTest;
    }
  });
});
