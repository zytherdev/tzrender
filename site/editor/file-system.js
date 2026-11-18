import { caseFoldPath, isSafeFileName, isSafeFolderName, validateProjectTree } from './project.js';

// All paths are relative to the project root and use '/'. The empty string
// denotes the root only when passed as a target folder.
function prepare(project, forDeletion = false) {
  if (!project || typeof project !== 'object' || Array.isArray(project) || !Array.isArray(project.files)) {
    throw new Error('A project must contain an array of files.');
  }
  const files = project.files.map((file) => ({ ...file }));
  // Editing can temporarily exceed content limits. For deletion only, check
  // the complete input tree with text lengths masked, preserving type checks;
  // finish() still requires the resulting project to satisfy every limit.
  const validationFiles = forDeletion
    ? files.map((file) => ({ ...file, content: typeof file.content === 'string' ? '' : file.content }))
    : files;
  const tree = validateProjectTree(validationFiles, project.folders);
  return {
    ...project,
    files,
    folders: tree.folders,
    activeFile: tree.files.some((file) => file.name === project.activeFile)
      ? project.activeFile : tree.files[0].name
  };
}

function finish(project) {
  // Validate the entire candidate before returning it. The caller's state is
  // never modified, including when a limit or collision is discovered late.
  const tree = validateProjectTree(project.files, project.folders);
  return { ...project, folders: tree.folders };
}

function requirePath(path, isFolder = false) {
  if (!(isFolder ? isSafeFolderName(path) : isSafeFileName(path))) {
    throw new Error(`Unsafe ${isFolder ? 'folder' : 'entry'} path: ${String(path).slice(0, 80)}`);
  }
}

function entryType(project, path) {
  requirePath(path);
  if (project.files.some((file) => file.name === path)) return 'file';
  if (project.folders.includes(path)) return 'folder';
  throw new Error(`Entry does not exist: ${path}`);
}

function requireTargetFolder(project, targetFolder) {
  if (targetFolder === '') return;
  requirePath(targetFolder, true);
  if (!project.folders.includes(targetFolder)) throw new Error(`Target folder does not exist: ${targetFolder}`);
}

function parentOf(path) {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

function baseName(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

function join(folder, name) {
  return folder ? `${folder}/${name}` : name;
}

function isWithin(path, folder) {
  return path === folder || path.startsWith(`${folder}/`);
}

function isWithinIgnoringCase(path, folder) {
  return isWithin(caseFoldPath(path), caseFoldPath(folder));
}

function existingPath(project, path) {
  const key = caseFoldPath(path);
  return project.files.some((file) => caseFoldPath(file.name) === key)
    || project.folders.some((folder) => caseFoldPath(folder) === key);
}

export function createFile(project, path, content = '') {
  const result = prepare(project);
  requirePath(path);
  if (existingPath(result, path)) throw new Error(`An entry already exists at: ${path}`);
  result.files.push({ name: path, content });
  return finish(result);
}

export function createFolder(project, path) {
  const result = prepare(project);
  requirePath(path, true);
  if (existingPath(result, path)) throw new Error(`An entry already exists at: ${path}`);
  result.folders.push(path);
  return finish(result);
}

// destination is a complete project-relative path. Missing ancestors are
// inferred, just as they are when creating or importing a nested entry.
export function renameEntry(project, source, destination) {
  const result = prepare(project);
  const type = entryType(result, source);
  requirePath(destination, type === 'folder');
  if (source === destination) return finish(result);
  if (type === 'folder' && caseFoldPath(destination) !== caseFoldPath(source)
    && isWithinIgnoringCase(destination, source)) {
    throw new Error('A folder cannot be moved inside itself.');
  }

  const renamePath = (path) => destination + path.slice(source.length);
  if (type === 'file') {
    result.files = result.files.map((file) => file.name === source ? { ...file, name: destination } : file);
    if (result.activeFile === source) result.activeFile = destination;
  } else {
    result.files = result.files.map((file) => isWithin(file.name, source)
      ? { ...file, name: renamePath(file.name) } : file);
    result.folders = result.folders.map((folder) => isWithin(folder, source) ? renamePath(folder) : folder);
    if (isWithin(result.activeFile, source)) result.activeFile = renamePath(result.activeFile);
  }
  return finish(result);
}

export function moveEntry(project, source, targetFolder) {
  const state = prepare(project);
  const type = entryType(state, source);
  requireTargetFolder(state, targetFolder);
  if (type === 'folder' && targetFolder && isWithinIgnoringCase(targetFolder, source)) {
    throw new Error('A folder cannot be moved inside itself.');
  }
  return renameEntry(state, source, join(targetFolder, baseName(source)));
}

function copyName(name, number, type) {
  const suffix = number === 1 ? ' copy' : ` copy ${number}`;
  const dot = type === 'file' ? name.lastIndexOf('.') : -1;
  return dot > 0 ? `${name.slice(0, dot)}${suffix}${name.slice(dot)}` : `${name}${suffix}`;
}

export function copyEntry(project, source, targetFolder) {
  const result = prepare(project);
  const type = entryType(result, source);
  requireTargetFolder(result, targetFolder);
  const name = baseName(source);
  let destination = join(targetFolder, name);
  let number = 1;
  while (existingPath(result, destination)) {
    destination = join(targetFolder, copyName(name, number, type));
    if (!(type === 'folder' ? isSafeFolderName(destination) : isSafeFileName(destination))) {
      throw new Error('Cannot create a safe unique copy name: the path is too long.');
    }
    number += 1;
  }
  requirePath(destination, type === 'folder');
  const copiedPath = (path) => destination + path.slice(source.length);
  if (type === 'file') {
    const file = result.files.find((item) => item.name === source);
    result.files.push({ ...file, name: destination });
  } else {
    // Capture the original subtree before appending, including empty folders.
    const files = result.files.filter((file) => isWithin(file.name, source))
      .map((file) => ({ ...file, name: copiedPath(file.name) }));
    const folders = result.folders.filter((folder) => isWithin(folder, source)).map(copiedPath);
    result.files.push(...files);
    result.folders.push(...folders);
  }
  return finish(result);
}

export function deleteEntry(project, path) {
  const result = prepare(project, true);
  const type = entryType(result, path);
  result.files = result.files.filter((file) => type === 'file' ? file.name !== path : !isWithin(file.name, path));
  if (!result.files.length) throw new Error('A project must keep at least one file.');
  if (type === 'folder') result.folders = result.folders.filter((folder) => !isWithin(folder, path));
  if (!result.files.some((file) => file.name === result.activeFile)) result.activeFile = result.files[0].name;
  return finish(result);
}
