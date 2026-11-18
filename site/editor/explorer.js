import * as filesystem from './file-system.js';
import { getFileType, MAX_FILE_CHARS } from './project.js';

const parentOf = (path) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
const baseOf = (path) => path.slice(path.lastIndexOf('/') + 1);
const join = (folder, name) => folder ? `${folder}/${name}` : name;
const ICON_PATHS = {
  chevronDown: 'M7 9l5 5 5-5',
  chevronRight: 'M9 6l6 6-6 6',
  more: 'M6 12h.01M12 12h.01M18 12h.01'
};
function createIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'action-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', '0 0 24 24');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  svg.append(path);
  return svg;
}

// The clipboard is intentionally internal to the project, not the system text clipboard.
export function createFileExplorer({ getProject, applyProject, openFile, download, toast }) {
  const list = document.getElementById('fileList');
  const root = document.getElementById('explorerRoot');
  const sidebar = document.getElementById('fileSidebar');
  const pasteButton = document.getElementById('pasteFile');
  const expanded = new Set();
  let selected = '';
  let clipboard = null;
  let menu = null;
  let dragging = null;
  let activeDialog = null;
  function showDialog({ title, description, value = '', folders = null, needsName = false, destructive = false, confirmLabel = 'Save', onConfirm }) {
    const trigger = document.activeElement;
    const overlay = document.createElement('div'); overlay.className = 'explorer-dialog-backdrop';
    const dialog = document.createElement('section'); dialog.className = 'explorer-dialog'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    const id = `explorer-dialog-${Math.random().toString(36).slice(2)}`;
    const heading = document.createElement('h2'); heading.id = `${id}-title`; heading.textContent = title;
    const help = document.createElement('p'); help.id = `${id}-description`; help.textContent = description;
    dialog.setAttribute('aria-labelledby', heading.id); dialog.setAttribute('aria-describedby', help.id); dialog.append(heading, help);
    let field = null, error = null;
    let destinationSelect = null;
    if (folders) {
      destinationSelect = document.createElement('select'); destinationSelect.className = 'explorer-dialog-field'; destinationSelect.setAttribute('aria-label', 'Destination folder');
      const rootOption = document.createElement('option'); rootOption.value = ''; rootOption.textContent = '/ (project root)'; destinationSelect.append(rootOption);
      for (const folder of folders) { const option = document.createElement('option'); option.value = folder; option.textContent = folder; destinationSelect.append(option); }
      destinationSelect.value = value;
    }
    if ((!folders || needsName) && !destructive) {
      field = document.createElement('input'); field.className = 'explorer-dialog-field'; field.type = 'text'; field.value = value; field.autocomplete = 'off'; field.setAttribute('aria-label', 'Name');
    }
    if (field) dialog.append(field);
    if (destinationSelect) dialog.append(destinationSelect);
    error = document.createElement('div'); error.className = 'explorer-dialog-error'; error.setAttribute('role', 'alert'); error.id = `${id}-error`;
    if (field) field.setAttribute('aria-describedby', `${help.id} ${error.id}`);
    if (destinationSelect) destinationSelect.setAttribute('aria-describedby', `${help.id} ${error.id}`);
    dialog.append(error);
    const actions = document.createElement('div'); actions.className = 'explorer-dialog-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'explorer-dialog-button'; cancel.textContent = 'Cancel';
    const accept = document.createElement('button'); accept.type = 'button'; accept.className = `explorer-dialog-button${destructive ? ' is-destructive' : ' is-primary'}`; accept.textContent = confirmLabel;
    actions.append(cancel, accept); dialog.append(actions); overlay.append(dialog); document.body.append(overlay); activeDialog = overlay;
    const close = (restore = true) => { overlay.remove(); if (activeDialog === overlay) activeDialog = null; if (restore && trigger?.isConnected) trigger.focus(); };
    cancel.addEventListener('click', () => close()); overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    const keydown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') { const focusable = [...dialog.querySelectorAll('button,input,select')]; const first = focusable[0], last = focusable.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
    };
    overlay.addEventListener('keydown', keydown);
    accept.addEventListener('click', () => { try { onConfirm(field?.value ?? destinationSelect?.value ?? '', destinationSelect?.value); close(); } catch (e) { { error.textContent = e?.message || 'Unable to complete this operation.'; (field || destinationSelect)?.setAttribute('aria-invalid', 'true'); (field || destinationSelect || accept).focus(); } } });
    (field || accept).focus(); return overlay;
  }

  function isFolder(path, snapshot = getProject()) {
    return path === '' || (snapshot.folders || []).includes(path);
  }
  function destination() {
    const snapshot = getProject();
    return isFolder(selected, snapshot) ? selected : parentOf(selected);
  }
  function closeMenu() {
    menu?.remove();
    menu = null;
  }
  function markFocused(path) {
    selected = path;
    root.classList.toggle('tree-selected', !path);
    for (const row of list.querySelectorAll('.tree-row')) {
      const active = row.querySelector('.tree-item')?.dataset.path === path;
      row.classList.toggle('tree-selected', active);
      row.setAttribute('aria-selected', String(active));
    }
  }
  function reveal(path) {
    let parent = parentOf(path);
    while (parent) {
      expanded.add(parent);
      parent = parentOf(parent);
    }
  }
  function commit(next, message) {
    applyProject(next);
    render();
    if (message) toast(message);
  }
  function run(action) {
    try { action(); } catch (error) { toast(error?.message || 'The file operation failed.'); }
  }
  function create(kind, folder = destination()) {
    const label = kind === 'file' ? 'file' : 'folder';
    showDialog({ title: `Create ${label}`, description: `Choose a name and destination folder for the new ${label}.`, value: kind === 'file' ? 'untitled.txt' : 'New folder', folders: ['', ...(getProject().folders || [])], needsName: true, onConfirm: (name, selectedFolder) => {
      const targetFolder = selectedFolder ?? folder;
      const path = join(targetFolder, name.trim());
      const next = kind === 'file' ? filesystem.createFile(getProject(), path) : filesystem.createFolder(getProject(), path);
      selected = path; reveal(path); if (targetFolder) expanded.add(targetFolder);
      if (kind === 'file') next.activeFile = path; else expanded.add(path);
      commit(next, `${baseOf(path)} created.`);
    }});
    const select = activeDialog?.querySelector('select'); if (select) select.value = folder;
  }
  function rename(path) {
    if (!path) return;
    showDialog({ title: 'Rename item', description: `Enter a new name for ${baseOf(path)}.`, value: baseOf(path), onConfirm: (name) => {
      if (!name.trim()) throw new Error('Name cannot be empty.');
      const target = join(parentOf(path), name.trim());
      const next = filesystem.renameEntry(getProject(), path, target);
      if (clipboard && (clipboard.path === path || clipboard.path.startsWith(`${path}/`))) clipboard.path = target + clipboard.path.slice(path.length);
      for (const item of [...expanded]) if (item === path || item.startsWith(`${path}/`)) { expanded.delete(item); expanded.add(target + item.slice(path.length)); }
      selected = target; reveal(target); commit(next, `Renamed to ${baseOf(target)}.`);
    }});
  }
  function remove(path) {
    if (!path) return;
    const folder = isFolder(path);
    showDialog({ title: `Delete ${folder ? 'folder' : 'file'}?`, description: `${path}${folder ? ' and everything inside it' : ''} will be permanently deleted. This cannot be undone.`, destructive: true, confirmLabel: 'Delete', onConfirm: () => {
      run(() => { const next = filesystem.deleteEntry(getProject(), path); if (clipboard && (clipboard.path === path || clipboard.path.startsWith(`${path}/`))) clipboard = null; selected = parentOf(path); for (const item of [...expanded]) if (item === path || item.startsWith(`${path}/`)) expanded.delete(item); commit(next, `${baseOf(path)} deleted.`); });
    }});
  }
  function copy(path, cut = false) {
    if (!path) return;
    clipboard = { path, cut };
    render();
    toast(`${baseOf(path)} ${cut ? 'cut' : 'copied'}. Choose a folder and paste.`);
  }
  function paste(folder = destination()) {
    if (!clipboard) return toast('Copy or cut a file or folder first.');
    run(() => {
      const { path, cut } = clipboard;
      const snapshot = getProject();
      const next = cut ? filesystem.moveEntry(snapshot, path, folder) : filesystem.copyEntry(snapshot, path, folder);
      if (cut) {
        const target = join(folder, baseOf(path));
        for (const item of [...expanded]) if (item === path || item.startsWith(`${path}/`)) {
          expanded.delete(item); expanded.add(target + item.slice(path.length));
        }
        selected = target;
        clipboard = null;
      } else {
        const oldPaths = new Set([...snapshot.files.map((file) => file.name), ...(snapshot.folders || [])]);
        const added = [...(next.folders || []), ...next.files.map((file) => file.name)]
          .filter((item) => !oldPaths.has(item) && parentOf(item) === folder);
        selected = added[0] || folder;
      }
      if (folder) expanded.add(folder);
      reveal(selected);
      commit(next, cut ? 'Item moved.' : 'Item copied.');
    });
  }
  function move(path) {
    if (!path) return;
    const snapshot = getProject();
    showDialog({ title: 'Move item', description: `Choose a destination folder for ${path}.`, value: parentOf(path), folders: ['', ...(snapshot.folders || []).filter((folder) => folder !== path && !folder.startsWith(`${path}/`))], confirmLabel: 'Move', onConfirm: (folder) => {
      const next = filesystem.moveEntry(getProject(), path, folder);
      selected = join(folder, baseOf(path)); if (folder) expanded.add(folder); reveal(selected); if (clipboard?.path === path) clipboard = null; commit(next, `Moved to ${folder || '/'}.`);
    }});
  }
  function duplicate(path) {
    if (!path) return;
    clipboard = { path, cut: false };
    paste(parentOf(path));
  }
  function openContext(path, x, y) {
    closeMenu();
    selected = path;
    render();
    const folder = isFolder(path);
    const target = folder ? path : parentOf(path);
    const entries = [];
    if (folder) entries.push(['New file', () => create('file', path)], ['New folder', () => create('folder', path)], null);
    if (path) entries.push(['Rename', () => rename(path), 'F2'], ['Cut', () => copy(path, true), 'Ctrl+X'], ['Copy', () => copy(path), 'Ctrl+C']);
    entries.push(['Paste', () => paste(target), 'Ctrl+V', !clipboard]);
    if (path) {
      entries.push(['Duplicate', () => duplicate(path)], ['Move to…', () => move(path)]);
      if (!folder) entries.push(['Download', () => {
        const file = getProject().files.find((item) => item.name === path);
        if (file) download(baseOf(file.name), file.content);
      }]);
      entries.push(null, ['Delete', () => remove(path), 'Del']);
    }
    menu = document.createElement('div');
    menu.className = 'file-context-menu';
    menu.setAttribute('role', 'menu');
    for (const entry of entries) {
      if (!entry) {
        const divider = document.createElement('div'); divider.className = 'context-menu-separator'; menu.append(divider); continue;
      }
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'context-menu-item'; button.setAttribute('role', 'menuitem');
      button.disabled = Boolean(entry[3]);
      const label = document.createElement('span'); label.textContent = entry[0]; button.append(label);
      if (entry[2]) { const shortcut = document.createElement('small'); shortcut.textContent = entry[2]; button.append(shortcut); }
      button.addEventListener('click', () => { closeMenu(); entry[1](); });
      menu.append(button);
    }
    document.body.append(menu);
    menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - menu.offsetWidth - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - menu.offsetHeight - 4))}px`;
    menu.querySelector('button:not(:disabled)')?.focus();
  }
  function addDropTarget(element, folder) {
    element.addEventListener('dragover', (event) => {
      if (!dragging) return;
      event.preventDefault(); event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      element.classList.add('tree-drag-over');
    });
    element.addEventListener('dragleave', () => element.classList.remove('tree-drag-over'));
    element.addEventListener('drop', (event) => {
      element.classList.remove('tree-drag-over');
      if (!dragging) return;
      event.preventDefault(); event.stopPropagation();
      const path = dragging; dragging = null;
      run(() => {
        const next = filesystem.moveEntry(getProject(), path, folder);
        selected = join(folder, baseOf(path));
        if (folder) expanded.add(folder);
        reveal(selected);
        commit(next, `Moved to ${folder || '/'}.`);
      });
    });
  }
  function render() {
    const focusedPath = list.contains(document.activeElement)
      ? document.activeElement.closest('.tree-row')?.querySelector('.tree-item')?.dataset.path
      : null;
    const snapshot = getProject();
    const files = snapshot.files || [];
    const folders = snapshot.folders || [];
    if (selected && !folders.includes(selected) && !files.some((file) => file.name === selected)) selected = '';
    root.classList.toggle('tree-selected', selected === '');
    pasteButton.disabled = !clipboard;
    list.replaceChildren();
    function renderChildren(parent, depth) {
      const children = [
        ...folders.filter((folder) => parentOf(folder) === parent).map((path) => ({ path, folder: true })),
        ...files.filter((file) => parentOf(file.name) === parent).map((file) => ({ path: file.name, folder: false }))
      ].sort((a, b) => Number(b.folder) - Number(a.folder) || baseOf(a.path).localeCompare(baseOf(b.path), undefined, { numeric: true, sensitivity: 'base' }));
      for (const { path, folder } of children) {
        const row = document.createElement('div');
        row.className = `tree-row ${folder ? 'tree-folder' : 'tree-file'}${selected === path ? ' tree-selected' : ''}${clipboard?.cut && (clipboard.path === path || path.startsWith(`${clipboard.path}/`)) ? ' tree-cut' : ''}`;
        row.style.paddingLeft = `${depth * 14}px`;
        row.setAttribute('role', 'treeitem'); row.setAttribute('aria-level', String(depth + 1));
        row.setAttribute('aria-selected', String(selected === path));
        if (folder) row.setAttribute('aria-expanded', String(expanded.has(path)));
        row.draggable = true;
        row.addEventListener('dragstart', (event) => { dragging = path; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', path); });
        row.addEventListener('dragend', () => { dragging = null; document.querySelectorAll('.tree-drag-over').forEach((node) => node.classList.remove('tree-drag-over')); });
        row.addEventListener('contextmenu', (event) => { event.preventDefault(); event.stopPropagation(); openContext(path, event.clientX, event.clientY); });
        if (folder) addDropTarget(row, path);
        const item = document.createElement('button');
        item.type = 'button'; item.className = 'tree-item'; item.dataset.path = path; item.title = path;
        const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true');
        if (folder) { icon.className = 'tree-chevron-button'; icon.append(createIcon(expanded.has(path) ? 'chevronDown' : 'chevronRight')); }
        else { const type = getFileType(path); icon.className = `file-symbol file-${type.category}`; icon.textContent = type.icon; }
        const name = document.createElement('span'); name.className = 'tree-name'; name.textContent = baseOf(path);
        item.append(icon, name);
        item.addEventListener('focus', () => markFocused(path));
        item.addEventListener('click', () => {
          selected = path;
          if (folder) { if (expanded.has(path)) expanded.delete(path); else expanded.add(path); render(); }
          else { openFile(path); render(); }
        });
        const actions = document.createElement('button');
        actions.type = 'button'; actions.className = 'tree-actions'; actions.append(createIcon('more'));
        actions.setAttribute('aria-label', `Actions for ${path}`); actions.title = 'More actions';
        actions.addEventListener('focus', () => markFocused(path));
        actions.addEventListener('click', (event) => { const rect = event.currentTarget.getBoundingClientRect(); openContext(path, rect.left, rect.bottom); });
        row.append(item, actions); list.append(row);
        if (folder && expanded.has(path)) renderChildren(path, depth + 1);
      }
    }
    renderChildren('', 0);
    if (!files.length && !folders.length) {
      const empty = document.createElement('div'); empty.className = 'explorer-empty'; empty.textContent = 'Create a file or folder to get started.'; list.append(empty);
    }
    if (focusedPath && focusedPath === selected) [...list.querySelectorAll('.tree-item')].find((item) => item.dataset.path === focusedPath)?.focus();
  }
  root.addEventListener('click', () => { selected = ''; render(); });
  root.addEventListener('focus', () => markFocused(''));
  root.addEventListener('contextmenu', (event) => { event.preventDefault(); openContext('', event.clientX, event.clientY); });
  list.addEventListener('contextmenu', (event) => { if (event.target === list) { event.preventDefault(); openContext('', event.clientX, event.clientY); } });
  addDropTarget(root, '');
  addDropTarget(list, '');
  document.getElementById('addFile').addEventListener('click', () => create('file'));
  document.getElementById('addFolder').addEventListener('click', () => create('folder'));
  pasteButton.addEventListener('click', () => paste());
  document.getElementById('collapseFolders').addEventListener('click', () => { expanded.clear(); render(); });
  document.getElementById('importFiles').addEventListener('click', () => document.getElementById('localFilesInput').click());
  document.getElementById('importFolder').addEventListener('click', () => document.getElementById('localFolderInput').click());
  document.getElementById('importBackupMobile').addEventListener('click', () => document.getElementById('importProject').click());
  document.getElementById('exportBackupMobile').addEventListener('click', () => document.getElementById('exportProject').click());
  async function importLocalFiles(event) {
    const filesToImport = [...(event.target.files || [])];
    event.target.value = '';
    if (!filesToImport.length) return;
    try {
      const folder = destination();
      const loaded = [];
      for (const file of filesToImport) {
        if (file.size > MAX_FILE_CHARS * 4) throw new Error(`${file.name} is too large to import.`);
        let content;
        try { content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
        catch { throw new Error(`${file.name} must be a UTF-8 text file.`); }
        if (/[\u0000-\u0008\u000b\u000e-\u001f]/.test(content)) throw new Error(`${file.name} is not a supported text file.`);
        loaded.push({ path: file.webkitRelativePath || file.name, content });
      }
      let next = getProject();
      for (const file of loaded) {
        const path = join(folder, file.path);
        const pieces = parentOf(path).split('/').filter(Boolean);
        let current = '';
        for (const piece of pieces) {
          current = join(current, piece);
          if (!(next.folders || []).includes(current)) next = filesystem.createFolder(next, current);
        }
        next = filesystem.createFile(next, path, file.content);
      }
      const firstPath = join(folder, loaded[0].path);
      if (folder) expanded.add(folder);
      selected = firstPath; reveal(selected); next.activeFile = selected;
      commit(next, `${filesToImport.length} file${filesToImport.length === 1 ? '' : 's'} imported.`);
    } catch (error) { toast(error?.message || 'Could not import these files.'); }
  }
  document.getElementById('localFilesInput').addEventListener('change', importLocalFiles);
  document.getElementById('localFolderInput').addEventListener('change', importLocalFiles);
  document.addEventListener('pointerdown', (event) => { if (menu && !menu.contains(event.target)) closeMenu(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && activeDialog) return;
    if (event.key === 'Escape' && menu) { closeMenu(); list.querySelector('.tree-selected .tree-item')?.focus(); return; }
    if (!sidebar.contains(event.target) && !menu?.contains(event.target)) return;
    const focusedRow = event.target.closest?.('.tree-row');
    if (focusedRow) selected = focusedRow.querySelector('.tree-item')?.dataset.path || selected;
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (modifier && ['c', 'x', 'v'].includes(key)) {
      event.preventDefault();
      if (key === 'v') paste(); else copy(selected, key === 'x');
    } else if (event.key === 'F2' && selected) { event.preventDefault(); rename(selected); }
    else if ((event.key === 'Delete' || event.key === 'Backspace') && selected) { event.preventDefault(); remove(selected); }
    else if (event.shiftKey && event.key === 'F10') {
      event.preventDefault(); const rect = event.target.getBoundingClientRect(); openContext(selected, rect.left, rect.bottom);
    } else if (event.target.classList.contains('tree-item') && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const path = event.target.dataset.path;
      const items = [...list.querySelectorAll('.tree-item')];
      const index = items.indexOf(event.target);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const target = items[index + (event.key === 'ArrowDown' ? 1 : -1)];
        if (target) { selected = target.dataset.path; render(); list.querySelectorAll('.tree-item')[index + (event.key === 'ArrowDown' ? 1 : -1)]?.focus(); }
      } else if (isFolder(path) && event.key === 'ArrowRight' && !expanded.has(path)) {
        expanded.add(path); render(); [...list.querySelectorAll('.tree-item')].find((item) => item.dataset.path === path)?.focus();
      } else if (isFolder(path) && event.key === 'ArrowLeft' && expanded.has(path)) {
        expanded.delete(path); render(); [...list.querySelectorAll('.tree-item')].find((item) => item.dataset.path === path)?.focus();
      } else if (event.key === 'ArrowLeft' && parentOf(path)) {
        selected = parentOf(path); render(); [...list.querySelectorAll('.tree-item')].find((item) => item.dataset.path === selected)?.focus();
      }
    }
  });
  return {
    render,
    select(path) { selected = path || ''; reveal(selected); render(); },
    rename,
    remove,
    reset() { selected = ''; clipboard = null; expanded.clear(); closeMenu(); render(); }
  };
}
