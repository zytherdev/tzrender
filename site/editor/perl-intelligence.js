const KEYWORDS = 'BEGIN CHECK END INIT UNITCHECK and cmp continue do else elsif eq for foreach ge given goto grep gt if last le local lt map ne next no not or our package redo require return s state sub tr unless until use while xor'.split(' ');
const BUILTINS = {
  print: ['LIST'], say: ['LIST'], sprintf: ['FORMAT', 'LIST'], printf: ['FILEHANDLE', 'FORMAT', 'LIST'], open: ['FILEHANDLE', 'MODE', 'EXPR'], close: ['FILEHANDLE'], push: ['ARRAY', 'LIST'], pop: ['ARRAY'], shift: ['ARRAY'], unshift: ['ARRAY', 'LIST'], splice: ['ARRAY', 'OFFSET', 'LENGTH', 'LIST'], keys: ['HASH'], values: ['HASH'], each: ['HASH'], map: ['BLOCK', 'LIST'], grep: ['BLOCK', 'LIST'], sort: ['SUBNAME', 'LIST'], split: ['PATTERN', 'EXPR', 'LIMIT'], join: ['EXPR', 'LIST'], length: ['EXPR'], substr: ['EXPR', 'OFFSET', 'LENGTH', 'REPLACEMENT'], index: ['STR', 'SUBSTR', 'POSITION'], lc: ['EXPR'], uc: ['EXPR'], chomp: ['VARIABLE'], chop: ['VARIABLE'], die: ['LIST'], warn: ['LIST'], eval: ['EXPR'], ref: ['EXPR'], bless: ['REF', 'CLASS'], defined: ['EXPR'], exists: ['EXPR'], delete: ['EXPR'], scalar: ['EXPR'], require: ['VERSION or EXPR'], use: ['MODULE', 'VERSION', 'LIST'], abs: ['VALUE'], int: ['EXPR'], time: [], localtime: ['EXPR'], our: ['VARIABLE']
};
const PRAGMAS = 'strict warnings feature utf8 bytes constant lib parent base Exporter Carp Data::Dumper File::Basename File::Path File::Spec Getopt::Long JSON::PP List::Util Scalar::Util Test::More'.split(' ');
const SNIPPETS = [
  ['sub', 'sub ${1:name} {\n\t${2:# body}\n}\n', 'Define a subroutine'],
  ['foreach', 'for my $${1:item} (@${2:items}) {\n\t${3:# body}\n}\n', 'Iterate over a list'],
  ['while', 'while (${1:condition}) {\n\t${2:# body}\n}\n', 'While loop'],
  ['package', 'package ${1:Name};\n\nuse strict;\nuse warnings;\n\n1;\n', 'Package boilerplate'],
  ['eval', 'eval {\n\t${1:# risky operation}\n};\nif ($@) {\n\t${2:# handle error}\n}\n', 'Eval with error handling']
];
const wordRE = /[$@%]?\b[A-Za-z_][A-Za-z0-9_]*\b/g;
function wordAt(text, offset) {
  let start = offset, end = offset;
  while (start > 0 && /[\w$@%]/.test(text[start - 1])) start--;
  while (end < text.length && /[\w]/.test(text[end])) end++;
  return { word: text.slice(start, end), start, end };
}
function getText(model, lineNumber) { return model.getValue().split(/\r?\n/)[lineNumber - 1] || ''; }
function findCall(text, offset) {
  const stack = []; let quote = null, escape = false;
  for (let i = 0; i < offset; i++) {
    const c = text[i];
    if (quote) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(') stack.push(i); else if (c === ')') stack.pop();
  }
  const open = stack.at(-1); if (open == null) return null;
  const before = text.slice(0, open).match(/(?:&?)([A-Za-z_]\w*)\s*$/); if (!before) return null;
  let activeParameter = 0; stack.length = 0; quote = null; escape = false;
  for (let i = open + 1; i < offset; i++) {
    const c = text[i];
    if (quote) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '(' || c === '[' || c === '{') stack.push(c);
    else if (c === ')' || c === ']' || c === '}') stack.pop();
    else if (c === ',' && stack.length === 0) activeParameter++;
  }
  return { name: before[1], activeParameter };
}
function collect(snapshot) {
  const files = Array.isArray(snapshot?.files) ? snapshot.files : [];
  const symbols = new Map();
  for (const file of files) {
    const content = String(file.content || '');
    for (const m of content.matchAll(/\bsub\s+([A-Za-z_]\w*(?:::\w+)*)\s*(?:\(([^)]*)\))?/g)) {
      const params = (m[2] || '').split(',').map(x => x.trim()).filter(Boolean);
      symbols.set(m[1], { name: m[1], kind: 'sub', params, file: file.name, detail: `sub ${m[1]}${params.length ? `(${params.join(', ')})` : '()'} — ${file.name}` });
    }
    for (const m of content.matchAll(/\bpackage\s+([A-Za-z_]\w*(?:::\w+)*)/g)) symbols.set(m[1], { name: m[1], kind: 'package', params: [], file: file.name, detail: `package ${m[1]} — ${file.name}` });
    for (const m of content.matchAll(/\b(?:my|our|state)\s+([$@%][A-Za-z_]\w*)/g)) symbols.set(m[1], { name: m[1], kind: 'variable', params: [], file: file.name, detail: `${m[1]} — ${file.name}` });
  }
  return { files, symbols };
}
function importCompletions(snapshot, files) {
  const names = new Set();
  for (const file of files) {
    const name = String(file.name || '').replace(/\\/g, '/').replace(/^\.\//, '');
    if (/\.pm$/i.test(name)) {
      const module = name.replace(/\.pm$/i, '').replaceAll('/', '::'); names.add(module);
    }
    if (name) names.add(name);
  }
  for (const folder of (snapshot?.folders || [])) { const f = typeof folder === 'string' ? folder : folder?.name; if (f) names.add(String(f).replace(/\\/g, '/').replace(/\/$/, '') + '/'); }
  return [...names];
}
function isImportContext(text, offset) { return /(?:^|[;\s])(?:use|require)\s+(?:['"]?)[\w:./-]*$/.test(text.slice(0, offset)); }

export function registerPerlIntelligence(monaco, getProject) {
  const disposables = [];
  const kind = monaco.languages.CompletionItemKind;
  const rangeFor = (model, position) => { const line = getText(model, position.lineNumber); const w = wordAt(line, position.column - 1); return { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: w.start + 1, endColumn: w.end + 1 }; };
  disposables.push(monaco.languages.registerCompletionItemProvider('perl', {
    triggerCharacters: ['$', '@', '%', ':', '/', '\''],
    provideCompletionItems(model, position) {
      const snapshot = getProject?.() || {}, { files, symbols } = collect(snapshot), text = getText(model, position.lineNumber), offset = position.column - 1;
      const range = rangeFor(model, position), items = [], add = (label, insertText = label, detail = '', completionKind = kind?.Text ?? 1, extra = {}) => items.push({ label, insertText, detail, kind: completionKind, range, ...extra });
      if (isImportContext(text, offset)) {
        for (const path of importCompletions(snapshot, files)) add(path, path, 'Project module or file', kind?.Module ?? 9);
        return { suggestions: items };
      }
      for (const label of KEYWORDS) add(label, label, 'Perl keyword', kind?.Keyword ?? 17);
      for (const label of Object.keys(BUILTINS)) add(label, label, `Perl built-in (${BUILTINS[label].join('; ') || 'no arguments'})`, kind?.Function ?? 1);
      for (const label of PRAGMAS) add(label, label, 'Module or pragma', kind?.Module ?? 9);
      for (const [label, insertText, detail] of SNIPPETS) add(label, insertText, detail, kind?.Snippet ?? SnippetKind(monaco), { insertTextRules: monaco.languages.CompletionItemInsertTextRule?.InsertAsSnippet ?? 4 });
      for (const symbol of symbols.values()) add(symbol.name, symbol.name, symbol.detail, symbol.kind === 'sub' ? kind?.Function ?? 1 : symbol.kind === 'package' ? kind?.Module ?? 9 : kind?.Variable ?? 5);
      return { suggestions: items };
    }
  }));
  disposables.push(monaco.languages.registerHoverProvider('perl', { provideHover(model, position) {
    const text = getText(model, position.lineNumber), w = wordAt(text, position.column - 1); if (!w.word) return null;
    const { symbols } = collect(getProject?.() || {}), sym = symbols.get(w.word);
    const value = sym?.detail || (BUILTINS[w.word] ? `Perl built-in: ${w.word}${BUILTINS[w.word].length ? `(${BUILTINS[w.word].join(', ')})` : '()'}` : null);
    return value ? { contents: [{ value: `**${w.word}**\n\n${value}` }], range: { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: w.start + 1, endColumn: w.end + 1 } } : null;
  } }));
  disposables.push(monaco.languages.registerSignatureHelpProvider('perl', { signatureHelpTriggerCharacters: ['(', ','], signatureHelpRetriggerCharacters: [','], provideSignatureHelp(model, position) {
    const text = model.getValue(), lines = text.split(/\r?\n/), offset = lines.slice(0, position.lineNumber - 1).reduce((n, line) => n + line.length + 1, 0) + position.column - 1;
    const call = findCall(text, offset); if (!call) return null;
    const symbol = collect(getProject?.() || {}).symbols.get(call.name), builtIn = BUILTINS[call.name]; if (!symbol && !builtIn) return null;
    const parameters = symbol ? (symbol.params.length ? symbol.params : ['...']) : builtIn;
    const signature = { label: `${call.name}(${parameters.join(', ')})`, documentation: symbol ? symbol.detail : `Perl built-in ${call.name}`, parameters: parameters.map(label => ({ label, documentation: '' })) };
    return { value: { signatures: [signature], activeSignature: 0, activeParameter: Math.min(call.activeParameter, Math.max(0, parameters.length - 1)) }, dispose() {} };
  } }));
  return { dispose() { for (const disposable of disposables.splice(0)) disposable?.dispose?.(); } };
}
function SnippetKind(monaco) { return monaco.languages.CompletionItemKind?.Snippet ?? 27; }
