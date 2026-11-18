const HELP_TEXT = `tzrender project terminal — local commands only

  help             Show these commands
  pwd              Show the virtual project path
  ls               List project files
  cat <file>        Print a text file
  run               Run the active file or refresh the website preview
  python [file.py]  Run a Python file in the local worker
  lua [file.lua]    Run a Lua file in the local WebAssembly runtime
  sqlite [file.sql] Run SQL in the local in-memory SQLite runtime
  php [file.php]    Run a PHP file in the local WebAssembly runtime
  java [file.java]  Compile and run a Java file in the local WebAssembly runtime
  preview           Switch to the live preview
  clear             Clear terminal output
  stop              Stop the active language runtime

This is not an operating-system shell. Git, npm/pip installs, pipes, redirection,
network commands and arbitrary host commands are not available. PHP and Java run
inside browser WebAssembly runtimes, not on the host operating system.`;

const SHELL_OPERATORS = /[;&|<>`$\\]/;
const SIMPLE_TOKENS = /"([^"\\]|\\.)*"|'[^']*'|[^\s]+/g;

export function parseTerminalCommand(value) {
  const source = String(value ?? '').trim();
  if (!source) return { command: '', args: [] };
  if (source.length > 180) return { error: 'Commands are limited to 180 characters.' };
  if (SHELL_OPERATORS.test(source)) {
    return { error: 'Shell operators are disabled. Run one local project command at a time.' };
  }
  const tokens = source.match(SIMPLE_TOKENS) || [];
  if (tokens.join(' ') !== source && tokens.length > 1) {
    // Whitespace is normalized below; this branch only rejects unmatched quoting.
    const compact = source.replace(/\s+/g, ' ').trim();
    if (tokens.join(' ') !== compact) return { error: 'Use simple command names and file names; shell quoting is not supported.' };
  }
  const values = tokens.map((token) => token.replace(/^(?:"(.*)"|'(.*)')$/, (_match, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted));
  return { command: (values.shift() || '').toLowerCase(), args: values };
}

export function getTerminalHelp() {
  return HELP_TEXT;
}

export async function executeTerminalCommand(source, context) {
  const parsed = parseTerminalCommand(source);
  if (parsed.error) return { type: 'error', text: parsed.error };
  const [target] = parsed.args;
  const files = context.files();

  switch (parsed.command) {
    case '':
      return { type: 'empty', text: '' };
    case 'help':
      return { type: 'info', text: HELP_TEXT };
    case 'pwd':
      return { type: 'info', text: `/workspace/${context.projectName() || 'untitled'}` };
    case 'ls':
      return { type: 'info', text: files.map((file) => file.name).join('  ') || '(no files)' };
    case 'cat': {
      if (!target) return { type: 'error', text: 'Usage: cat <file>' };
      const file = files.find((item) => item.name === target);
      return file ? { type: 'info', text: file.content } : { type: 'error', text: `File not found: ${target}` };
    }
    case 'run':
      await context.runActive();
      return { type: 'info', text: 'Run request sent.' };
    case 'python': {
      const fileName = target || context.activeFile();
      const file = files.find((item) => item.name === fileName);
      if (!file || !/\.py$/i.test(file.name)) return { type: 'error', text: `Python file not found: ${fileName || 'select a .py file first'}` };
      await context.runPython(file.name, file.content);
      return { type: 'info', text: `Running ${file.name} in the local Python worker…` };
    }
    case 'lua': {
      const fileName = target || context.activeFile();
      const file = files.find((item) => item.name === fileName);
      if (!file || !/\.lua$/i.test(file.name)) return { type: 'error', text: `Lua file not found: ${fileName || 'select a .lua file first'}` };
      await context.runLua(file.name, file.content);
      return { type: 'info', text: `Running ${file.name} in the local Lua WebAssembly runtime…` };
    }
    case 'sqlite':
    case 'sql': {
      const fileName = target || context.activeFile();
      const file = files.find((item) => item.name === fileName);
      if (!file || !/\.sql$/i.test(file.name)) return { type: 'error', text: `SQL file not found: ${fileName || 'select a .sql file first'}` };
      await context.runSql(file.name, file.content);
      return { type: 'info', text: `Running ${file.name} in the local SQLite WebAssembly runtime…` };
    }
    case 'php': {
      const fileName = target || context.activeFile();
      const file = files.find((item) => item.name === fileName);
      if (!file || !/\.php$/i.test(file.name)) return { type: 'error', text: `PHP file not found: ${fileName || 'select a .php file first'}` };
      await context.runPhp(file.name, file.content);
      return { type: 'info', text: `Running ${file.name} in the local PHP WebAssembly runtime…` };
    }
    case 'java': {
      const fileName = target || context.activeFile();
      const file = files.find((item) => item.name === fileName);
      if (!file || !/\.java$/i.test(file.name)) return { type: 'error', text: `Java file not found: ${fileName || 'select a .java file first'}` };
      await context.runJava(file.name, file.content);
      return { type: 'info', text: `Compiling and running ${file.name} in the local Java WebAssembly runtime…` };
    }
    case 'preview':
      context.showPreview();
      return { type: 'info', text: 'Switched to the live preview.' };
    case 'clear':
      context.clear();
      return { type: 'empty', text: '' };
    case 'stop':
      return context.stopRuntime() ? { type: 'info', text: 'Active language runtime stopped.' } : { type: 'info', text: 'No language runtime is running.' };
    case 'npm':
    case 'npx':
    case 'pnpm':
    case 'yarn':
    case 'pip':
    case 'git':
    case 'node':
    case 'bash':
    case 'sh':
      return { type: 'error', text: `${parsed.command} is not available here. This terminal can only run the documented local project commands shown by help.` };
    default:
      return { type: 'error', text: `Unknown local command: ${parsed.command}. Type help for available commands.` };
  }
}
