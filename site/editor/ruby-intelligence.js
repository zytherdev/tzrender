const KEYWORDS = ['alias', 'and', 'begin', 'break', 'case', 'class', 'def', 'defined?', 'do', 'else', 'elsif', 'end', 'ensure', 'false', 'for', 'if', 'in', 'module', 'next', 'nil', 'not', 'or', 'redo', 'rescue', 'retry', 'return', 'self', 'super', 'then', 'true', 'unless', 'until', 'when', 'while', 'yield'];

const APIS = {
  puts: { signature: 'puts(*objects) → nil', detail: 'Writes each object to standard output, followed by a newline.' },
  print: { signature: 'print(*objects) → nil', detail: 'Writes objects to standard output without adding a newline.' },
  p: { signature: 'p(*objects) → objects', detail: 'Inspects and writes objects; useful for debugging.' },
  require: { signature: 'require(feature) → true or false', detail: 'Loads a feature once. In this editor, project-local Ruby files can be required offline.' },
  require_relative: { signature: 'require_relative(feature) → true or false', detail: 'Loads a project file relative to the current source file.' },
  raise: { signature: 'raise(exception = RuntimeError, message = nil) → never', detail: 'Raises an exception, optionally with a message.' },
  Array: { signature: 'Array(object) → array', detail: 'Converts an object to an array where possible.' },
  Hash: { signature: 'Hash(object) → hash', detail: 'Converts an object to a hash where possible.' },
  String: { signature: 'String(object) → string', detail: 'Converts an object to a string.' },
  Integer: { signature: 'Integer(object, base = 0) → integer', detail: 'Converts an object to an integer.' },
  puts: { signature: 'puts(*objects) → nil', detail: 'Writes each object to standard output, followed by a newline.' },
  gets: { signature: 'gets(separator = $/) → string or nil', detail: 'Reads a line from standard input.' },
  require_relative: { signature: 'require_relative(feature) → true or false', detail: 'Loads a project file relative to the current source file.' }
};

const SNIPPETS = [
  { label: 'def (method snippet)', insertText: 'def ${1:name}(${2:args})\n  $0\nend', detail: 'Define a method', kind: 'Snippet' },
  { label: 'class (snippet)', insertText: 'class ${1:Name}\n  $0\nend', detail: 'Define a class', kind: 'Snippet' },
  { label: 'module (snippet)', insertText: 'module ${1:Name}\n  $0\nend', detail: 'Define a module', kind: 'Snippet' },
  { label: 'do', insertText: 'do |${1:item}|\n  $0\nend', detail: 'Block', kind: 'Snippet' },
  { label: 'if', insertText: 'if ${1:condition}\n  $0\nend', detail: 'Conditional', kind: 'Snippet' },
  { label: 'each', insertText: '.each do |${1:item}|\n  $0\nend', detail: 'Iteration block', kind: 'Snippet' }
];

function getSymbols(snapshot) {
  const symbols = new Map();
  for (const file of snapshot?.files || []) {
    const content = String(file?.content || '');
    const re = /^\s*(?:(?:private|protected|public)\s+)?(?:def\s+(?:self\.)?([a-zA-Z_][\w!?=]*)|class\s+(<\s*)?([A-Z][\w:]*)|module\s+([A-Z][\w:]*)|([A-Z][A-Z0-9_]*)\s*=)/gm;
    let match;
    while ((match = re.exec(content))) {
      const name = match[1] || match[3] || match[4] || match[5];
      const type = match[1] ? 'method' : match[5] ? 'constant' : match[3] ? 'class' : 'module';
      let signature = '';
      if (type === 'method') {
        const line = content.slice(match.index + match[0].length - (match[1] ? match[1].length : 0));
        const lineMatch = content.slice(match.index, content.indexOf('\n', match.index) < 0 ? content.length : content.indexOf('\n', match.index));
        signature = lineMatch.trim().replace(/^def\s+/, 'def ');
      }
      if (!symbols.has(name)) symbols.set(name, { name, type, file: file.name, signature });
    }
  }
  return [...symbols.values()];
}

function beforeCursor(model, position) {
  const lines = [];
  for (let n = 1; n < position.lineNumber; n += 1) lines.push(model.getLineContent(n));
  lines.push(model.getLineContent(position.lineNumber).slice(0, position.column - 1));
  return lines.join('\n');
}

function activePath(snapshot) { return snapshot?.activeFile || ''; }
function dirname(path) { const index = path.lastIndexOf('/'); return index < 0 ? '' : path.slice(0, index); }
function resolvePath(base, path) { return [...(base ? base.split('/') : []), ...path.split('/')].filter(Boolean).reduce((parts, item) => { if (item === '..') parts.pop(); else if (item !== '.') parts.push(item); return parts; }, []).join('/'); }

function pathContext(text) {
  const match = text.match(/\b(require_relative|require)\s*\(?(?:['"])([^'"\n]*)$/);
  return match ? { kind: match[1], prefix: match[2] } : null;
}

function currentCall(text) {
  let quote = null; let escaped = false; const stack = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') stack.push(i);
    else if (ch === ')' && stack.length) stack.pop();
  }
  const open = stack.at(-1);
  if (open == null) return null;
  const prefix = text.slice(0, open);
  const match = prefix.match(/([A-Za-z_][\w!?=]*)\s*$/);
  if (!match) return null;
  let commas = 0; let nested = 0; quote = null; escaped = false;
  for (let i = open + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[' || ch === '{') nested += 1;
    else if (ch === ')' || ch === ']' || ch === '}') nested = Math.max(0, nested - 1);
    else if (ch === ',' && nested === 0) commas += 1;
  }
  return { name: match[1], argumentIndex: commas };
}

export function registerRubyIntelligence(monaco, getProject) {
  if (!monaco?.languages || typeof getProject !== 'function') throw new TypeError('Monaco and getProject are required.');
  const language = 'ruby';
  const disposable = [];
  const completionKind = monaco.languages.CompletionItemKind || {};
  const insertRule = monaco.languages.CompletionItemInsertTextRule || {};
  const triggerCharacters = ['.', ':', '"', "'"];

  disposable.push(monaco.languages.registerCompletionItemProvider(language, {
    triggerCharacters,
    provideCompletionItems(model, position) {
      const snapshot = getProject() || {};
      const text = beforeCursor(model, position);
      const word = model.getWordUntilPosition?.(position) || { startColumn: position.column, endColumn: position.column, word: '' };
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
      const pathCtx = pathContext(text);
      let suggestions = [];
      if (pathCtx) {
        const current = activePath(snapshot);
        const base = pathCtx.kind === 'require_relative' ? dirname(current) : '';
        const resolvedPrefix = resolvePath(base, pathCtx.prefix);
        suggestions = (snapshot.files || []).filter((file) => {
          const name = file.name.replace(/\.(?:rb|rbs)$/i, '');
          return name.startsWith(resolvedPrefix) || name.startsWith(pathCtx.prefix);
        }).map((file) => {
          let path = file.name.replace(/\.(?:rb|rbs)$/i, '');
          if (pathCtx.kind === 'require_relative') {
            const parts = base ? base.split('/') : [];
            const target = path.split('/');
            while (parts.length && target.length && parts[0] === target[0]) { parts.shift(); target.shift(); }
            path = `${'../'.repeat(parts.length)}${target.join('/')}`;
          }
          return { label: path, insertText: path, kind: completionKind.File || 17, detail: `Project file · ${file.name}`, range };
        });
      } else {
        suggestions = [
          ...KEYWORDS.map((label) => ({ label, kind: completionKind.Keyword || 17, insertText: label, range })),
          ...Object.entries(APIS).map(([label, api]) => ({ label, kind: completionKind.Function || 1, insertText: label, detail: api.signature, documentation: api.detail, range })),
          ...getSymbols(snapshot).map((symbol) => ({ label: symbol.name, kind: ({ method: completionKind.Method || 0, class: completionKind.Class || 5, module: completionKind.Module || 8, constant: completionKind.Constant || 17 })[symbol.type], insertText: symbol.name, detail: `${symbol.type} · ${symbol.file}`, range })),
          ...SNIPPETS.map((snippet) => ({ ...snippet, kind: completionKind.Snippet || 27, insertTextRules: insertRule.InsertAsSnippet || 4, range }))
        ];
      }
      const unique = new Map();
      for (const item of suggestions) if (!unique.has(item.label)) unique.set(item.label, item);
      return { suggestions: [...unique.values()] };
    }
  }));

  disposable.push(monaco.languages.registerHoverProvider(language, {
    provideHover(model, position) {
      const word = model.getWordAtPosition?.(position);
      if (!word) return null;
      const api = APIS[word.word];
      if (api) return { range: wordRange(monaco, position, word), contents: [{ value: `**Ruby** · \`${api.signature}\`` }, { value: api.detail }] };
      const symbol = getSymbols(getProject() || {}).find((entry) => entry.name === word.word);
      if (!symbol) return null;
      const signature = symbol.signature ? `\`${symbol.signature}\`` : `\`${symbol.type} ${symbol.name}\``;
      return { range: wordRange(monaco, position, word), contents: [{ value: `**Project ${symbol.type}** · ${signature}` }, { value: `Declared in \`${symbol.file}\`.` }] };
    }
  }));

  disposable.push(monaco.languages.registerSignatureHelpProvider(language, {
    signatureHelpTriggerCharacters: ['(', ','],
    provideSignatureHelp(model, position) {
      const call = currentCall(beforeCursor(model, position));
      if (!call) return null;
      const api = APIS[call.name];
      const symbol = getSymbols(getProject() || {}).find((entry) => entry.name === call.name && entry.type === 'method');
      const signature = api?.signature || symbol?.signature;
      if (!signature) return null;
      const label = signature;
      const parameterMatch = label.match(/\((.*)\)/);
      const params = parameterMatch?.[1] ? splitParameters(parameterMatch[1]) : [];
      return { value: { signatures: [{ label, documentation: api?.detail || `Defined in ${symbol.file}.`, parameters: params.map((name) => ({ label: name })) }], activeSignature: 0, activeParameter: Math.min(call.argumentIndex, Math.max(0, params.length - 1)) }, dispose() {} };
    }
  }));

  let disposed = false;
  return { dispose() { if (disposed) return; disposed = true; for (const item of disposable) item?.dispose?.(); } };
}

function splitParameters(source) {
  const out = []; let start = 0; let depth = 0; let quote = null;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) { if (ch === quote && source[i - 1] !== '\\') quote = null; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    else if (ch === ',' && depth === 0) { out.push(source.slice(start, i).trim()); start = i + 1; }
  }
  const last = source.slice(start).trim(); if (last) out.push(last);
  return out;
}

function wordRange(monaco, position, word) {
  return { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
}
