import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFileExplorer } from '../site/editor/explorer.js';
import { normalizeProject } from '../site/editor/project.js';

function buttonFor(path) {
  return [...document.querySelectorAll('.tree-item')].find((item) => item.dataset.path === path);
}
function dialogField() { return document.querySelector('.explorer-dialog input.explorer-dialog-field') || document.querySelector('.explorer-dialog select.explorer-dialog-field'); }
function acceptDialog() { document.querySelector('.explorer-dialog-actions button:last-child').click(); }
function shortcut(target, key, options = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }));
}

describe('project explorer', () => {
  let state, explorer, toast, opened;
  beforeEach(() => {
    document.body.innerHTML = `<aside id="fileSidebar"><button id="explorerRoot">Project</button>
      <button id="addFile">New file</button><button id="addFolder">New folder</button><button id="pasteFile">Paste</button>
      <button id="importFiles">Import files</button><button id="importFolder">Import folder</button><button id="collapseFolders">Collapse</button>
      <button id="importBackupMobile">Import backup</button><button id="exportBackupMobile">Export backup</button>
      <div id="fileList" role="tree"></div></aside><input id="localFilesInput" type="file" multiple>
      <input id="localFolderInput" type="file" multiple><textarea id="external"></textarea>`;
    state = normalizeProject({ projectName: 'Test', files: [{ name: 'index.html', content: 'hello' }], folders: [], activeFile: 'index.html' });
    toast = vi.fn(); opened = vi.fn();
    explorer = createFileExplorer({
      getProject: () => structuredClone(state),
      applyProject: (next) => { state = structuredClone(next); },
      openFile: opened,
      download: vi.fn(),
      toast
    });
    explorer.render();
  });

  it('creates folders and nested files, and expands them in the tree', () => {
    document.getElementById('addFolder').click(); dialogField().value = 'src'; acceptDialog();
    document.getElementById('addFile').click(); dialogField().value = 'app.js'; acceptDialog();
    expect(state.folders).toContain('src');
    expect(state.files).toContainEqual({ name: 'src/app.js', content: '' });
    expect(state.activeFile).toBe('src/app.js');
    expect(buttonFor('src/app.js')).toBeTruthy();
    buttonFor('src/app.js').click();
    expect(opened).toHaveBeenCalledWith('src/app.js');
  });

  it('keeps invalid names open with an inline error and restores focus on Escape', () => {
    const trigger = document.getElementById('addFile'); trigger.focus(); trigger.click();
    expect(document.activeElement).toBe(dialogField());
    dialogField().value = '../bad'; acceptDialog();
    expect(document.querySelector('.explorer-dialog')).toBeTruthy();
    expect(document.querySelector('[role=alert]').textContent).toBeTruthy();
    shortcut(dialogField(), 'Escape');
    expect(document.querySelector('.explorer-dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it('allows selecting a destination folder when creating and moving', () => {
    state.folders.push('src'); explorer.render();
    document.getElementById('addFile').click();
    dialogField().value = 'main.js'; document.querySelector('select.explorer-dialog-field').value = 'src'; acceptDialog();
    expect(state.files.some((file) => file.name === 'src/main.js')).toBe(true);
    explorer.select('index.html');
    const context = buttonFor('index.html'); context.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 15, clientY: 15 }));
    [...document.querySelectorAll('.context-menu-item')].find((button) => button.textContent.includes('Move to')).click();
    expect(document.querySelector('select.explorer-dialog-field')).toBeTruthy();
    document.querySelector('select.explorer-dialog-field').value = 'src'; acceptDialog();
    expect(state.files.some((file) => file.name === 'src/index.html')).toBe(true);
  });
  it('copies with keyboard shortcuts without overwriting a same-named file', () => {
    explorer.select('index.html');
    shortcut(buttonFor('index.html'), 'c', { ctrlKey: true });
    document.getElementById('explorerRoot').click();
    shortcut(document.getElementById('explorerRoot'), 'v', { ctrlKey: true });
    expect(state.files).toContainEqual({ name: 'index copy.html', content: 'hello' });
    expect(state.files).toHaveLength(2);
  });

  it('cuts and pastes a file into a folder and retains the active file', () => {
    document.getElementById('addFolder').click(); dialogField().value = 'src'; acceptDialog();
    explorer.select('index.html');
    shortcut(buttonFor('index.html'), 'x', { ctrlKey: true });
    explorer.select('src');
    shortcut(buttonFor('src'), 'v', { ctrlKey: true });
    expect(state.files).toEqual([{ name: 'src/index.html', content: 'hello' }]);
    expect(state.activeFile).toBe('src/index.html');
  });

  it('provides a contextual menu and protects the last file from deletion', () => {

    const file = buttonFor('index.html');
    file.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
    const deleteButton = [...document.querySelectorAll('.context-menu-item')].find((item) => item.textContent.includes('Delete'));
    expect(deleteButton).toBeTruthy();
    deleteButton.click();
    expect(document.querySelector('[role=dialog]').getAttribute('aria-labelledby')).toBeTruthy();
    expect(document.querySelector('.is-destructive').textContent).toBe('Delete');
    acceptDialog();
    expect(state.files).toHaveLength(1);
    expect(toast).toHaveBeenCalled();
  });

  it('targets the focused row rather than a previously selected item for keyboard deletion', () => {
    state.files.push({ name: 'script.js', content: 'code' });
    explorer.select('index.html');

    const script = buttonFor('script.js');
    script.focus();
    shortcut(script, 'Delete');
    expect(document.querySelector('.explorer-dialog').textContent).toContain('script.js');
    acceptDialog();
    expect(state.files).toEqual([{ name: 'index.html', content: 'hello' }]);
  });

  it('does not intercept copy and paste in the code or other inputs', () => {
    const event = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true });
    document.getElementById('external').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('keeps focus on a folder after expanding it', () => {
    document.getElementById('addFolder').click(); dialogField().value = 'src'; acceptDialog();
    buttonFor('src').focus();
    buttonFor('src').click();
    expect(document.activeElement.dataset.path).toBe('src');
  });

  it('imports text files in their folder hierarchy as one operation', async () => {
    const content = new TextEncoder().encode('export const value = 1;');
    const input = document.getElementById('localFolderInput');
    Object.defineProperty(input, 'files', { configurable: true, value: [{ name: 'app.js', webkitRelativePath: 'project/src/app.js', size: content.length, arrayBuffer: async () => content.buffer }] });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(state.files.some((file) => file.name === 'project/src/app.js')).toBe(true));
    expect(state.folders).toEqual(expect.arrayContaining(['project', 'project/src']));
  });

  it('rejects a binary import without adding partial files', async () => {
    const input = document.getElementById('localFilesInput');
    const good = new TextEncoder().encode('hello');
    Object.defineProperty(input, 'files', { configurable: true, value: [
      { name: 'new.txt', size: good.length, arrayBuffer: async () => good.buffer },
      { name: 'bad.bin', size: 2, arrayBuffer: async () => new Uint8Array([255, 0]).buffer }
    ] });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    expect(state.files).toEqual([{ name: 'index.html', content: 'hello' }]);
  });
});
