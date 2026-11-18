import { createFile, createFolder, renameEntry, copyEntry, deleteEntry } from './file-system.js';
import { isSafeFileName, isSafeFolderName } from './project.js';
const HELP_TEXT = `tzrender project terminal — local commands only
  help                 Show these commands
  pwd                  Show the virtual project path
  ls [folder]          List project files and folders
  cat <file>            Print a text file
  touch <file>          Create an empty file
  mkdir <folder>        Create a folder (parents inferred)
  mv <source> <path>    Rename an entry or move it into a folder
  cp <source> <folder>  Copy an entry into a folder (unique name)
  rm <file|empty-folder> Remove a file or empty folder
  run                  Run the active file or refresh the website preview
  python [file.py]     Run a Python file in the local worker
  lua [file.lua]       Run a Lua file in the local WebAssembly runtime
  ruby [file.rb]       Run a Ruby file in a local WebAssembly worker
  r [file.R]           Run an R file in the local webR runtime
  perl [file.pl]       Run a Perl file in a local WebAssembly worker
  sqlite [file.sql]    Run SQL in the local in-memory SQLite runtime
  php [file.php]       Run a PHP file in the local WebAssembly runtime
  java [file.java]     Compile and run a Java file in the local WebAssembly runtime
  preview              Switch to the live preview
  clear                Clear terminal output
  stop                 Stop the active language runtime

Paths are virtual and project-relative. rm only removes empty folders; it never recursively deletes.
This is not an operating-system shell. Shell operators, Git, arbitrary host commands,
host files and network commands are unavailable.`;
const SHELL_OPERATORS = /[;&|<>`$\\]/;
const SIMPLE_TOKENS = /"([^"\\]|\\.)*"|'[^']*'|[^\s]+/g;
const err = (text) => ({ type: 'error', text });
export function parseTerminalCommand(value) {
  const source = String(value ?? '').trim();
  if (!source) return { command: '', args: [] };
  if (source.length > 180) return { error: 'Commands are limited to 180 characters.' };
  if (SHELL_OPERATORS.test(source)) return { error: 'Shell operators are disabled. Run one local project command at a time.' };
  const tokens = source.match(SIMPLE_TOKENS) || [];
  if (tokens.join(' ') !== source.replace(/\s+/g, ' ').trim()) return { error: 'Use simple command names and file names; shell quoting is not supported.' };
  const values = tokens.map((token) => token.replace(/^(?:"(.*)"|'(.*)')$/, (_m, d, s) => d ?? s));
  return { command: (values.shift() || '').toLowerCase(), args: values };
}
export function getTerminalHelp() { return HELP_TEXT; }
function safe(path, folder = false) { if (!(folder ? isSafeFolderName(path) : isSafeFileName(path))) throw new Error(`Unsafe ${folder ? 'folder' : 'file'} path: ${String(path)}`); }
export async function executeTerminalCommand(source, context) {
  const p = parseTerminalCommand(source);
  if (p.error) return err(p.error);
  const a = p.args, [target] = a, files = context.files();
  const usage = (text, count) => a.length === count ? null : err(`Usage: ${text}`);
  switch (p.command) {
    case '': return { type: 'empty', text: '' };
    case 'help': return usage('help', 0) || { type: 'info', text: HELP_TEXT };
    case 'pwd': return usage('pwd', 0) || { type: 'info', text: `/workspace/${context.projectName() || 'untitled'}` };
    case 'ls': {
      if (a.length > 1) return err('Usage: ls [folder]');
      const folder = target || '', project = context.project();
      try { if (folder) safe(folder, true); } catch (e) { return err(e.message); }
      if (folder && !project.folders.includes(folder)) return err(`Folder not found: ${folder}`);
      const prefix = folder ? `${folder}/` : '';
      const entries = [...project.folders.filter(x => x.startsWith(prefix) && !x.slice(prefix.length).includes('/')).map(x => `${x.slice(prefix.length)}/`), ...files.filter(x => x.name.startsWith(prefix) && !x.name.slice(prefix.length).includes('/')).map(x => x.name.slice(prefix.length))].sort();
      return { type: 'info', text: entries.join('  ') || '(empty folder)' };
    }
    case 'cat': {
      if (a.length !== 1) return err('Usage: cat <file>');
      try { safe(target); } catch (e) { return err(e.message); }
      const f = files.find(x => x.name === target);
      return f ? { type: 'info', text: f.content } : err(`File not found: ${target}`);
    }
    case 'touch': case 'mkdir': {
      if (a.length !== 1) return err(`Usage: ${p.command} <${p.command === 'touch' ? 'file' : 'folder'}>`);
      try { const next = p.command === 'touch' ? createFile(context.project(), target) : createFolder(context.project(), target); context.applyProject(next); return { type: 'info', text: `Created: ${target}` }; } catch (e) { return err(e.message); }
    }
    case 'mv': case 'cp': {
      if (a.length !== 2) return err(`Usage: ${p.command} <source> <${p.command === 'mv' ? 'destination-path' : 'target-folder'}>`);
      try { const next = p.command === 'mv' ? renameEntry(context.project(), a[0], a[1]) : copyEntry(context.project(), a[0], a[1]); context.applyProject(next); return { type: 'info', text: `${p.command === 'mv' ? 'Moved' : 'Copied'} ${a[0]} to ${a[1]}` }; } catch (e) { return err(e.message); }
    }
    case 'rm': {
      if (a.length !== 1) return err('Usage: rm <file|empty-folder>');
      const project = context.project();
      try {
        safe(target);
        if (!project.files.some(x => x.name === target)) {
          safe(target, true);
          if (!project.folders.includes(target)) return err(`Entry does not exist: ${target}`);
          if (project.files.some(x => x.name.startsWith(`${target}/`)) || project.folders.some(x => x.startsWith(`${target}/`))) return err('Folder is not empty; rm never recursively deletes.');
        }
        const next = deleteEntry(project, target); context.applyProject(next); return { type: 'info', text: `Removed: ${target}` };
      } catch (e) { return err(e.message); }
    }
    case 'run': if (a.length) return err('Usage: run'); await context.runActive(); return { type: 'info', text: 'Run request sent.' };
    case 'python': case 'lua': case 'ruby': case 'r': case 'perl': case 'sqlite': case 'sql': case 'php': case 'java': {
      if (a.length > 1) return err(`Usage: ${p.command} [file]`);
      const name = target || context.activeFile(), ext = ({ python: 'py', lua: 'lua', ruby: 'rb', r: 'r', perl: 'pl', sqlite: 'sql', sql: 'sql', php: 'php', java: 'java' })[p.command], f = files.find(x => x.name === name);
      if (!f || !f.name.toLowerCase().endsWith(`.${ext}`)) return err(`${ext.toUpperCase()} file not found: ${name || 'select a matching file first'}`);
      await context[{ py: 'runPython', lua: 'runLua', rb: 'runRuby', r: 'runR', pl: 'runPerl', sql: 'runSql', php: 'runPhp', java: 'runJava' }[ext]](f.name, f.content);
      return { type: 'info', text: `Running ${f.name} in the local ${ext.toUpperCase()} runtime…` };
    }
    case 'preview': if (a.length) return err('Usage: preview'); context.showPreview(); return { type: 'info', text: 'Switched to the live preview.' };
    case 'clear': if (a.length) return err('Usage: clear'); context.clear(); return { type: 'empty', text: '' };
    case 'stop': if (a.length) return err('Usage: stop'); return context.stopRuntime() ? { type: 'info', text: 'Active language runtime stopped.' } : { type: 'info', text: 'No language runtime is running.' };
    case 'npm': case 'npx': case 'pnpm': case 'yarn': case 'pip': case 'git': case 'node': case 'bash': case 'sh': return err(`${p.command} is not available here. This terminal can only run documented local project commands.`);
    default: return err(`Unknown local command: ${p.command}. Type help for available commands.`);
  }
}
