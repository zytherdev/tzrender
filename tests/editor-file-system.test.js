import { describe, expect, it } from 'vitest';
import { createFile, createFolder, renameEntry, moveEntry, copyEntry, deleteEntry } from '../site/editor/file-system.js';
import { MAX_FILE_CHARS, MAX_FILE_NAME, MAX_PROJECT_CHARS, MAX_PROJECT_FILES, MAX_PROJECT_FOLDERS, serializeProject } from '../site/editor/project.js';

const file = (name, content = '') => ({ name, content });
const sample = () => ({
  projectName: 'Example', starter: 'blank', extra: { selectedPanel: 'files' },
  activeFile: 'src/lib/app.js',
  files: [file('index.html', '<p>hi</p>'), file('src/lib/app.js', 'export default 1'), file('src/readme', 'docs')],
  folders: ['src', 'src/lib', 'src/lib/empty', 'assets', 'assets/empty']
});
const names = (project) => project.files.map(({ name }) => name);
const freeze = (state) => {
  state.files.forEach(Object.freeze);
  Object.freeze(state.files);
  Object.freeze(state.folders);
  return Object.freeze(state);
};

describe('editor file-system operations', () => {
  it('creates files and folders immutably and infers missing ancestors', () => {
    const state = freeze(sample());
    const withFile = createFile(state, 'new/deep/.env', 'A=B');
    expect(withFile.files.at(-1)).toEqual(file('new/deep/.env', 'A=B'));
    expect(withFile.folders).toContain('new');
    expect(withFile.folders).toContain('new/deep');
    expect(withFile.activeFile).toBe(state.activeFile);
    expect(withFile.extra).toBe(state.extra);
    expect(state.files).toHaveLength(3);
    const withFolder = createFolder(withFile, 'other/child/empty');
    expect(withFolder.folders).toEqual(expect.arrayContaining(['other', 'other/child', 'other/child/empty']));
    expect(withFile.folders).not.toContain('other');
    expect(createFile(state, 'new.txt').files.at(-1)).toEqual(file('new.txt'));
  });

  it('recursively renames a folder, including empty descendants and the active file', () => {
    const state = freeze(sample());
    const renamed = renameEntry(state, 'src', 'code/library');
    expect(names(renamed)).toEqual(['index.html', 'code/library/lib/app.js', 'code/library/readme']);
    expect(renamed.folders).toEqual(expect.arrayContaining(['code', 'code/library', 'code/library/lib', 'code/library/lib/empty', 'assets/empty']));
    expect(renamed.folders).not.toContain('src');
    expect(renamed.activeFile).toBe('code/library/lib/app.js');
    expect(renamed.files[1].content).toBe('export default 1');
    expect(state.activeFile).toBe('src/lib/app.js');
  });

  it('allows case-only renames of files and folders without case conflicts', () => {
    const renamedFolder = renameEntry(sample(), 'src', 'SRC');
    expect(renamedFolder.activeFile).toBe('SRC/lib/app.js');
    expect(renamedFolder.folders).toContain('SRC/lib/empty');
    const renamedFile = renameEntry(renamedFolder, 'index.html', 'INDEX.HTML');
    expect(names(renamedFile)).toContain('INDEX.HTML');
    expect(renameEntry(sample(), 'src/lib/app.js', 'src/lib/main.js').activeFile).toBe('src/lib/main.js');
  });

  it('moves files and complete folders into existing targets while tracking the active file', () => {
    const state = freeze(sample());
    const movedFile = moveEntry(state, 'src/lib/app.js', 'assets');
    expect(movedFile.activeFile).toBe('assets/app.js');
    expect(movedFile.files.find((entry) => entry.name === 'assets/app.js').content).toBe('export default 1');
    expect(movedFile.folders).toContain('src/lib/empty');
    const movedFolder = moveEntry(state, 'src/lib', 'assets');
    expect(movedFolder.activeFile).toBe('assets/lib/app.js');
    expect(movedFolder.folders).toEqual(expect.arrayContaining(['src', 'assets/lib', 'assets/lib/empty']));
    expect(movedFolder.folders).not.toContain('src/lib');
    expect(moveEntry(state, 'src/readme', '').files.map((entry) => entry.name)).toContain('readme');
    expect(moveEntry(state, 'src', '').activeFile).toBe(state.activeFile);
  });

  it('copies files to other directories and chooses case-insensitive unique names on conflict', () => {
    let state = sample();
    state = copyEntry(state, 'src/lib/app.js', 'assets');
    expect(state.activeFile).toBe('src/lib/app.js');
    expect(state.files.find((entry) => entry.name === 'assets/app.js').content).toBe('export default 1');
    state = createFile(state, 'assets/APP copy.js', 'other');
    state = copyEntry(state, 'src/lib/app.js', 'assets');
    expect(names(state)).toContain('assets/app copy 2.js');
    state = copyEntry(state, 'src/lib/app.js', 'src/lib');
    expect(names(state)).toContain('src/lib/app copy.js');
    state = createFile(state, '.env', 'x');
    expect(names(copyEntry(state, '.env', ''))).toContain('.env copy');
    state = createFile(state, 'archive.tar.gz', 'x');
    expect(names(copyEntry(state, 'archive.tar.gz', ''))).toContain('archive.tar copy.gz');
    state = createFile(state, 'Straße.txt', 'original');
    state = createFile(state, 'STRASSE copy.txt', 'collision');
    expect(names(copyEntry(state, 'Straße.txt', ''))).toContain('Straße copy 2.txt');
  });

  it('copies an entire subtree and its empty folders as an independent snapshot', () => {
    const state = freeze(sample());
    const copied = copyEntry(state, 'src', '');
    expect(copied.folders).toEqual(expect.arrayContaining(['src copy', 'src copy/lib', 'src copy/lib/empty']));
    expect(copied.files.find((entry) => entry.name === 'src copy/lib/app.js')).toEqual(file('src copy/lib/app.js', 'export default 1'));
    expect(copied.activeFile).toBe('src/lib/app.js');
    const copiedAgain = copyEntry(copied, 'src', '');
    expect(copiedAgain.folders).toContain('src copy 2/lib/empty');
    expect(state.files).toHaveLength(3);
    const nestedCopy = copyEntry(state, 'src', 'src/lib');
    expect(nestedCopy.folders).toContain('src/lib/src/lib/empty');
    expect(nestedCopy.files).toHaveLength(5);
    const copiedEmpty = copyEntry(state, 'assets/empty', '');
    expect(copiedEmpty.folders).toContain('empty');
    expect(copiedEmpty.files).toEqual(state.files);
  });

  it('deletes recursively, preserves unrelated empty folders and selects an existing active file', () => {
    const state = freeze(sample());
    const removed = deleteEntry(state, 'src');
    expect(names(removed)).toEqual(['index.html']);
    expect(removed.activeFile).toBe('index.html');
    expect(removed.folders).toEqual(['assets', 'assets/empty']);
    expect(deleteEntry(state, 'assets/empty').folders).toContain('assets');
    expect(deleteEntry(state, 'index.html').activeFile).toBe('src/lib/app.js');
  });

  it('recovers from an oversized edited file only when the deletion produces a valid project', () => {
    const state = freeze({
      activeFile: 'huge.txt', files: [file('keep.txt', 'keep'), file('huge.txt', 'x'.repeat(MAX_FILE_CHARS + 1))],
      folders: ['empty']
    });
    expect(() => serializeProject(state)).toThrow(/larger|text/i);
    expect(() => deleteEntry(state, 'keep.txt')).toThrow(/larger|text/i);
    expect(() => createFile(state, 'new.txt')).toThrow(/larger|text/i);
    expect(() => renameEntry(state, 'huge.txt', 'renamed.txt')).toThrow(/larger|text/i);
    const recovered = deleteEntry(state, 'huge.txt');
    expect(recovered.files).toEqual([file('keep.txt', 'keep')]);
    expect(recovered.activeFile).toBe('keep.txt');
    expect(recovered.folders).toEqual(['empty']);
    expect(() => serializeProject(recovered)).not.toThrow();
    expect(state.files[1].content).toHaveLength(MAX_FILE_CHARS + 1);
    expect(state.activeFile).toBe('huge.txt');
  });

  it('recovers an oversized total by deleting a folder and keeps remaining boundary-size content', () => {
    const fullFiles = Array.from({ length: MAX_PROJECT_CHARS / MAX_FILE_CHARS }, (_, i) => file(`keep${i}`, 'x'.repeat(MAX_FILE_CHARS)));
    const state = freeze({
      activeFile: 'drop/deep/extra', files: [...fullFiles, file('drop/deep/extra', 'x')],
      folders: ['drop/deep/empty', 'unrelated']
    });
    expect(() => serializeProject(state)).toThrow(/total characters/i);
    expect(() => deleteEntry(state, 'unrelated')).toThrow(/total characters/i);
    const recovered = deleteEntry(state, 'drop');
    expect(recovered.files).toEqual(fullFiles);
    expect(recovered.activeFile).toBe('keep0');
    expect(recovered.folders).toEqual(['unrelated']);
    expect(() => serializeProject(recovered)).not.toThrow();
    expect(state.files).toHaveLength(fullFiles.length + 1);
    expect(state.folders).toEqual(['drop/deep/empty', 'unrelated']);
  });

  it('can remove an oversized file via its folder, but never the last file', () => {
    const huge = 'x'.repeat(MAX_FILE_CHARS + 1);
    const state = freeze({ files: [file('keep', ''), file('drop/huge', huge)], folders: [], activeFile: 'drop/huge' });
    expect(deleteEntry(state, 'drop')).toMatchObject({ files: [file('keep', '')], activeFile: 'keep', folders: [] });
    const last = freeze({ files: [file('drop/huge', huge)], folders: [], activeFile: 'drop/huge' });
    expect(() => deleteEntry(last, 'drop/huge')).toThrow(/at least one file/i);
    expect(() => deleteEntry(last, 'drop')).toThrow(/at least one file/i);
    expect(last.files[0].content).toBe(huge);
  });

  it('rejects unsafe or otherwise corrupt input even if deletion would remove the offending entry', () => {
    const huge = 'x'.repeat(MAX_FILE_CHARS + 1);
    const broken = [
      { files: [file('keep', ''), file('drop/../evil', huge)], folders: [], activeFile: 'keep' },
      { files: [file('keep', ''), file('drop/__proto__/evil', huge)], folders: [], activeFile: 'keep' },
      { files: [file('keep', ''), file('drop/evil', null)], folders: ['drop'], activeFile: 'keep' },
      { files: [file('keep', ''), file('drop/evil', huge), file('DROP/EVIL', '')], folders: ['drop'], activeFile: 'keep' },
      { files: [file('keep', ''), file('drop/evil', huge)], folders: ['drop', 'drop/constructor'], activeFile: 'keep' },
      { files: [file('keep', ''), file('drop/evil', huge)], folders: ['drop/evil'], activeFile: 'keep' }
    ];
    for (const state of broken) {
      freeze(state);
      const snapshot = JSON.stringify(state);
      expect(() => deleteEntry(state, 'drop')).toThrow();
      expect(JSON.stringify(state)).toBe(snapshot);
    }
    const oversized = freeze({ files: [file('keep'), file('drop/huge', huge)], folders: [], activeFile: 'keep' });
    for (const path of ['../drop', 'drop/../keep', '__proto__', 'constructor']) {
      expect(() => deleteEntry(oversized, path)).toThrow(/unsafe/i);
    }
    expect({}.polluted).toBeUndefined();
  });

  it('supports virtual device-like names in file and folder operations', () => {
    let state = createFile(sample(), 'CON/aux.js', 'ok');
    state = createFolder(state, 'LPT1.html');
    state = renameEntry(state, 'CON/aux.js', 'LPT1.html/nul.css');
    expect(names(state)).toContain('LPT1.html/nul.css');
    expect(names(deleteEntry(state, 'LPT1.html'))).not.toContain('LPT1.html/nul.css');
  });

  it('handles prototype-like names as ordinary virtual paths', () => {
    let state = createFile(sample(), 'constructor.js/__proto__.txt', 'safe');
    state = renameEntry(state, 'constructor.js', 'prototype.json');
    expect(names(state)).toContain('prototype.json/__proto__.txt');
    state = copyEntry(state, 'prototype.json', '');
    expect(names(state)).toContain('prototype.json copy/__proto__.txt');
    expect(names(deleteEntry(state, 'prototype.json'))).not.toContain('prototype.json/__proto__.txt');
    expect({}.polluted).toBeUndefined();
  });

  it('rejects unsafe paths, collisions, missing targets, descendant moves and deleting the last file atomically', () => {
    const state = freeze(sample());
    const snapshot = JSON.stringify(state);
    const failures = [
      () => createFile(state, '../secret'),
      () => createFolder(state, 'assets/../no'),
      () => createFile(state, 'SRC'),
      () => createFolder(state, 'INDEX.HTML'),
      () => createFile(state, 'index.html/child'),
      () => renameEntry(state, 'index.html', 'src'),
      () => renameEntry(state, 'src', 'src/lib/inside'),
      () => renameEntry(state, 'index.html', '/absolute'),
      () => moveEntry(state, 'src', 'src/lib'),
      () => moveEntry(state, 'src', 'src'),
      () => moveEntry(state, 'src/lib/app.js', 'missing'),
      () => copyEntry(state, 'unknown', ''),
      () => copyEntry(state, 'index.html', 'missing'),
      () => deleteEntry(state, '../bad'),
      () => deleteEntry({ files: [file('x/a')], folders: ['x'], activeFile: 'x/a' }, 'x')
    ];
    for (const fail of failures) expect(fail).toThrow(Error);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('treats files and folders as a shared namespace when copying or moving', () => {
    let state = createFolder(sample(), 'assets/app.js');
    const copied = copyEntry(state, 'src/lib/app.js', 'assets');
    expect(names(copied)).toContain('assets/app copy.js');
    expect(() => moveEntry(state, 'src/lib/app.js', 'assets')).toThrow(/conflict|duplicate/i);
    state = createFile(state, 'assets/src', 'conflicting file');
    expect(() => moveEntry(state, 'src', 'assets')).toThrow(/conflict|duplicate/i);
  });

  it('validates content, file/folder counts and copy path lengths without changing inputs', () => {
    const state = freeze(sample());
    expect(() => createFile(state, 'bad', 1)).toThrow(/text/i);
    expect(() => createFile(state, 'large', 'x'.repeat(MAX_FILE_CHARS + 1))).toThrow();
    const full = freeze({ files: Array.from({ length: MAX_PROJECT_FILES }, (_, i) => file(`f${i}`)), folders: [], activeFile: 'f0' });
    expect(() => createFile(full, 'overflow')).toThrow();
    expect(() => copyEntry(full, 'f0', '')).toThrow();
    const foldersFull = freeze({ files: [file('file')], folders: Array.from({ length: MAX_PROJECT_FOLDERS }, (_, i) => `d${i}`), activeFile: 'file' });
    expect(() => createFolder(foldersFull, 'overflow')).toThrow(/folders/i);
    const long = 'x'.repeat(MAX_FILE_NAME);
    const longState = freeze({ files: [file(long)], folders: [], activeFile: long });
    expect(() => copyEntry(longState, long, '')).toThrow(/name|long/i);
    expect(full.files).toHaveLength(MAX_PROJECT_FILES);
  });
});
