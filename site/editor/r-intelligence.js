const KEYWORDS = ['if', 'else', 'repeat', 'while', 'function', 'for', 'in', 'next', 'break', 'TRUE', 'FALSE', 'NULL', 'NA', 'NA_integer_', 'NA_real_', 'NA_character_', 'Inf', 'NaN'];
const BASE = [
  ['abs', 'abs(x)', 'Absolute value.'], ['c', 'c(..., recursive = FALSE)', 'Combine values into a vector or list.'], ['cat', 'cat(..., file = "", sep = " ", fill = FALSE)', 'Concatenate and print values.'],
  ['data.frame', 'data.frame(..., row.names = NULL, check.rows = FALSE)', 'Create a data frame.'], ['ifelse', 'ifelse(test, yes, no)', 'Vectorized conditional selection.'], ['length', 'length(x)', 'Get or set the length of an object.'],
  ['library', 'library(package)', 'Load and attach a package.'], ['list', 'list(...)', 'Create a list.'], ['mean', 'mean(x, trim = 0, na.rm = FALSE)', 'Compute the arithmetic mean.'], ['message', 'message(..., domain = NULL)', 'Generate a diagnostic message.'],
  ['names', 'names(x)', 'Get or set object names.'], ['nrow', 'nrow(x)', 'Return the number of rows.'], ['paste', 'paste(..., sep = " ", collapse = NULL)', 'Concatenate strings.'], ['paste0', 'paste0(..., collapse = NULL)', 'Concatenate strings without a separator.'],
  ['plot', 'plot(x, y, ...)', 'Generic plotting function.'], ['print', 'print(x, ...)', 'Print an object.'], ['read.csv', 'read.csv(file, header = TRUE, sep = ",", ...)', 'Read a comma-separated file into a data frame.'],
  ['read.table', 'read.table(file, header = FALSE, sep = "", ...)', 'Read a tabular file.'], ['require', 'require(package)', 'Load a package and report whether it is available.'], ['seq', 'seq(from, to, by, length.out)', 'Generate a sequence.'],
  ['source', 'source(file, local = FALSE, ...)', 'Run R code from a file.'], ['sum', 'sum(..., na.rm = FALSE)', 'Sum values.'], ['summary', 'summary(object, ...)', 'Summarize an object.'], ['str', 'str(object, ...)', 'Display an object structure.'],
  ['subset', 'subset(x, subset, select, ...)', 'Return a subset of an object.'], ['which', 'which(x, arr.ind = FALSE)', 'Return indices of TRUE values.']
];
const SNIPPETS = [
  { label: 'function', insertText: 'function(${1(args)}) {\n\t$0\n}', detail: 'Function definition' },
  { label: 'if', insertText: 'if (${1(condition)}) {\n\t$0\n}', detail: 'If block' },
  { label: 'for', insertText: 'for (${1(item)} in ${2(items)}) {\n\t$0\n}', detail: 'For loop' },
  { label: 'data.frame', insertText: 'data.frame(${1})', detail: 'Data frame' },
  { label: 'library', insertText: 'library(${1(package)})', detail: 'Attach package' }
];
const WORD = /[A-Za-z._][A-Za-z0-9._]*/;

// Walks source through the cursor, ignoring delimiters inside strings/comments.
function scan(source, end = source.length) {
  const stack = []; let quote = ''; let escaped = false; let comment = false;
  for (let i = 0; i < Math.min(end, source.length); i += 1) {
    const ch = source[i];
    if (comment) { if (ch === '\n') comment = false; continue; }
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '#') { comment = true; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if ('([{'.includes(ch)) stack.push({ ch, index: i });
    else if (')]}'.includes(ch)) { const want = { ')': '(', ']': '[', '}': '{' }[ch]; for (let j = stack.length - 1; j >= 0; j -= 1) if (stack[j].ch === want) { stack.length = j; break; } }
  }
  return { stack, quote, comment };
}
function currentCall(source, offset) {
  const { stack } = scan(source, offset);
  for (let i = stack.length - 1; i >= 0; i -= 1) if (stack[i].ch === '(') {
    const before = source.slice(0, stack[i].index).match(/([A-Za-z.][A-Za-z0-9._]*)\s*$/);
    if (!before) return null;
    let commas = 0; let nested = 0; let quote = ''; let escape = false; let comment = false;
    for (let j = stack[i].index + 1; j < offset; j += 1) {
      const ch = source[j];
      if (comment) { if (ch === '\n') comment = false; continue; }
      if (quote) { if (escape) escape = false; else if (ch === '\\') escape = true; else if (ch === quote) quote = ''; continue; }
      if (ch === '#') { comment = true; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
      if ('([{'.includes(ch)) nested += 1;
      else if (')]}'.includes(ch)) nested = Math.max(0, nested - 1);
      else if (ch === ',' && nested === 0) commas += 1;
    }
    return { name: before[1], argument: commas, open: stack[i].index };
  }
  return null;
}
function projectInfo(getProject) {
  try { const p = getProject?.() || {}; return { ...p, files: Array.isArray(p.files) ? p.files : [] }; } catch { return { files: [] }; }
}
function symbols(project) {
  const found = new Map();
  for (const file of project.files) {
    if (typeof file?.content !== 'string') continue;
    const rx = /(?:^|\n)\s*([A-Za-z.][A-Za-z0-9._]*)\s*(?:(?:<-|=)\s*function\s*\(([^)]*)\)|<-|=)/g;
    let m;
    while ((m = rx.exec(file.content))) {
      const isFn = /function\s*\(/.test(m[0]);
      found.set(m[1], { name: m[1], file: file.name, content: isFn ? `function(${m[2] || ''})` : 'local assignment', signature: isFn ? `${m[1]}(${m[2] || ''})` : null, detail: `${isFn ? 'Local function' : 'Local symbol'} · ${file.name}`, documentation: `${isFn ? 'Function' : 'Symbol'} defined in ${file.name}${isFn ? `\n\nSignature: ${m[1]}(${m[2] || ''})` : ''}` });
    }
  }
  return found;
}
function pathContext(before) {
  const m = before.match(/(?:\bsource|\bread\.csv|\bread\.table|\bload|\bfile)\s*\(\s*(['"])([^'"\n]*)$/);
  return m ? { prefix: m[2], quote: m[1] } : null;
}
function basename(path) { return path.split('/').pop(); }

export function registerRIntelligence(monaco, getProject) {
  const disposables = [];
  if (!monaco?.languages?.registerCompletionItemProvider || !monaco.languages.registerHoverProvider || !monaco.languages.registerSignatureHelpProvider) return () => {};
  const kind = monaco.languages.CompletionItemKind || {};
  disposables.push(monaco.languages.registerCompletionItemProvider('r', {
    triggerCharacters: ['$', '@', '"', "'", '/', '.'],
    provideCompletionItems(model, position) {
      const project = projectInfo(getProject); const text = model.getValue();
      const offset = model.getOffsetAt(position); const before = text.slice(0, offset);
      const word = before.match(/[A-Za-z._][A-Za-z0-9._]*$/); const range = word ? { startColumn: position.column - word[0].length, endColumn: position.column } : undefined;
      const files = project.files.map((f) => f.name).filter((n) => typeof n === 'string');
      const pc = pathContext(before);
      if (pc) {
        const matches = files.filter((n) => n.startsWith(pc.prefix));
        return { suggestions: matches.map((name) => ({ label: name, insertText: name, kind: kind.File ?? 17, detail: 'Project file', range })) };
      }
      const local = symbols(project); const suggestions = [];
      for (const label of KEYWORDS) suggestions.push({ label, insertText: label, kind: kind.Keyword ?? 17, range });
      for (const [label, signature, documentation] of BASE) suggestions.push({ label, insertText: label, kind: kind.Function ?? 1, detail: signature, documentation, range });
      for (const symbol of local.values()) suggestions.push({ label: symbol.name, insertText: symbol.name, kind: symbol.signature ? (kind.Function ?? 1) : (kind.Variable ?? 5), detail: symbol.detail, documentation: symbol.documentation, range });
      for (const snippet of SNIPPETS) suggestions.push({ ...snippet, kind: kind.Snippet ?? 27, insertTextRules: monaco.languages.CompletionItemInsertTextRule?.InsertAsSnippet ?? 4, range });
      const seen = new Set();
      for (const file of project.files) {
        if (typeof file.content !== 'string') continue;
        for (const match of file.content.matchAll(/\b(?:library|require|::|:::)\s*\(?\s*['"]?([A-Za-z][A-Za-z0-9.]*)/g)) seen.add(match[1]);
      }
      for (const pkg of seen) suggestions.push({ label: pkg, insertText: pkg, kind: kind.Module ?? 9, detail: 'Package used in project', range });
      return { suggestions };
    }
  }));
  disposables.push(monaco.languages.registerHoverProvider('r', { provideHover(model, position) {
    const text = model.getValue(); const offset = model.getOffsetAt(position); const line = model.getLineContent(position.lineNumber); const start = Math.max(0, position.column - 1);
    let a = start; let b = start; while (a > 0 && /[A-Za-z0-9._]/.test(line[a - 1])) a -= 1; while (b < line.length && /[A-Za-z0-9._]/.test(line[b])) b += 1;
    const name = line.slice(a, b); if (!name) return null;
    const local = symbols(projectInfo(getProject)).get(name); const common = BASE.find((entry) => entry[0] === name);
    const doc = local?.documentation || (common ? `\`${common[1]}\`\n\n${common[2]}` : null); if (!doc) return null;
    return { contents: [{ value: doc }], range: { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: a + 1, endColumn: b + 1 } };
  } }));
  disposables.push(monaco.languages.registerSignatureHelpProvider('r', {
    signatureHelpTriggerCharacters: ['(', ','], signatureHelpRetriggerCharacters: [','],
    provideSignatureHelp(model, position) {
      const text = model.getValue(); const offset = model.getOffsetAt(position); const call = currentCall(text, offset); if (!call) return null;
      const local = symbols(projectInfo(getProject)).get(call.name); const builtin = BASE.find((entry) => entry[0] === call.name);
      const sig = local?.signature || (builtin && builtin[1]); if (!sig) return null;
      const args = sig.slice(sig.indexOf('(') + 1, -1).split(',').map((arg) => arg.trim()).filter(Boolean);
      const params = args.map((label) => ({ label, documentation: '' }));
      return { value: { signatures: [{ label: sig, documentation: local?.documentation || builtin?.[2] || '', parameters: params, activeParameter: Math.min(call.argument, Math.max(0, params.length - 1)) }], activeSignature: 0, activeParameter: Math.min(call.argument, Math.max(0, params.length - 1)) }, dispose() {} };
    }
  }));
  return () => { for (const item of disposables.splice(0)) item?.dispose?.(); };
}
