const OWNER = 'tzrender-language-diagnostics';
const SUPPORTED = new Set(['ruby', 'r', 'perl']);
const MAX_DIAGNOSTICS = 20;
const OPEN_TO_CLOSE = { '(': ')', '[': ']', '{': '}' };

function locationAt(text, offset) {
  const before = text.slice(0, offset);
  const line = before.split('\n').length;
  const lastNewline = before.lastIndexOf('\n');
  return { line, column: offset - lastNewline };
}

function isWord(char) {
  return !!char && /[\w]/.test(char);
}

// Mask comments/quoted regions while preserving offsets and newlines. Intentionally
// conservative around Perl's context-sensitive quote/regex syntax: uncertain forms
// are skipped rather than interpreted as source delimiters.
function maskNonCode(text, language) {
  const chars = text.split('');
  const blank = (i) => { if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' '; };
  const length = text.length;
  for (let i = 0; i < length;) {
    const c = text[i];
    if (c === "'" || c === '"' || (language === 'r' && c === '`')) {
      const quote = c;
      const start = i++;
      let closed = false;
      while (i < length) {
        if (text[i] === '\\') { i += Math.min(2, length - i); continue; }
        if (text[i] === quote) { i++; closed = true; break; }
        if ((language === 'r' || language === 'ruby') && text[i] === '\n' && quote === "'") break;
        i++;
      }
      // Unterminated strings are not diagnosed: leave their contents masked.
      for (let j = start; j < i; j++) blank(j);
      if (!closed) return chars.join('');
      continue;
    }
    if (c === '#') {
      while (i < length && text[i] !== '\n') blank(i++);
      continue;
    }
    if (language === 'perl') {
      // Perl POD documentation is plain text through its =cut directive.
      if (c === '=' && (i === 0 || text[i - 1] === '\n') && /^=(?:pod|begin)\b/.test(text.slice(i))) {
        const endMatch = /^(?:=cut|=end\b).*$/m.exec(text.slice(i));
        const end = endMatch ? i + endMatch.index + endMatch[0].length : length;
        for (let j = i; j < end; j++) blank(j);
        i = end;
        continue;
      }
      // Treat quote-like operators only when clearly used as operators (word boundary).
      const op = /^(?:qw|qq|qx|qr|q|m|s|tr|y)(?![\w])/.exec(text.slice(i));
      if (op && (i === 0 || !isWord(text[i - 1]))) {
        let j = i + op[0].length;
        while (j < length && /\s/.test(text[j])) j++;
        const open = text[j];
        if (open && !/[\w\s]/.test(open)) {
          const pairs = { '(': ')', '[': ']', '{': '}', '<': '>' };
          const close = pairs[open] || open;
          const paired = open !== close;
          let depth = 1;
          j++;
          while (j < length && depth) {
            if (text[j] === '\\') { j += Math.min(2, length - j); continue; }
            if (paired && text[j] === open) depth++;
            else if (text[j] === close) depth--;
            j++;
          }
          // s/// and tr/// have a second delimiter-delimited section.
          if (depth === 0 && ['s', 'tr', 'y'].includes(op[0])) {
            while (j < length && /[a-z]/i.test(text[j])) j++;
            if (text[j] && !/[\s\w]/.test(text[j])) {
              const secondOpen = text[j];
              const secondClose = pairs[secondOpen] || secondOpen;
              let secondDepth = 1; j++;
              while (j < length && secondDepth) {
                if (text[j] === '\\') { j += Math.min(2, length - j); continue; }
                if (secondOpen !== secondClose && text[j] === secondOpen) secondDepth++;
                else if (text[j] === secondClose) secondDepth--;
                j++;
              }
            }
          }
          if (j > i + op[0].length + 1) {
            for (let k = i; k < j; k++) blank(k);
            i = j;
            continue;
          }
        }
      }
      // Slash-delimited regex literals (common /.../ and s/.../.../ handled above).
      if (c === '/' && (i === 0 || /[=(:,;!~?{}\[\]\s]/.test(text[i - 1]))) {
        let j = i + 1;
        while (j < length && text[j] !== '\n') {
          if (text[j] === '\\') { j += Math.min(2, length - j); continue; }
          if (text[j++] === '/') { while (/[a-z]/i.test(text[j] || '')) j++; break; }
        }
        if (j > i + 1 && text[j - 1] !== '\n') {
          for (let k = i; k < j; k++) blank(k);
          i = j; continue;
        }
      }
    }
    i++;
  }
  return chars.join('');
}

export function findLanguageDiagnostics(language, text) {
  if (!SUPPORTED.has(language) || typeof text !== 'string') return [];
  const code = maskNonCode(text, language);
  const stack = [];
  const errors = [];
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (OPEN_TO_CLOSE[c]) {
      stack.push({ char: c, offset: i });
    } else if (c === ')' || c === ']' || c === '}') {
      const top = stack[stack.length - 1];
      if (top && OPEN_TO_CLOSE[top.char] === c) stack.pop();
      else {
        const { line, column } = locationAt(text, i);
        errors.push({ offset: i, message: `Delimitador “${c}” sem abertura correspondente.` , line, column });
      }
    }
    if (errors.length >= MAX_DIAGNOSTICS) return errors.map(toDiagnostic);
  }
  for (const item of stack) {
    const { line, column } = locationAt(text, item.offset);
    errors.push({ offset: item.offset, message: `Delimitador “${item.char}” não foi fechado (esperado “${OPEN_TO_CLOSE[item.char]}”).`, line, column });
    if (errors.length >= MAX_DIAGNOSTICS) break;
  }
  return errors.map(toDiagnostic);
}

function toDiagnostic(error) {
  return {
    message: error.message,
    startLineNumber: error.line,
    startColumn: error.column,
    endLineNumber: error.line,
    endColumn: error.column + 1,
    source: 'tzrender',
  };
}

export function updateLanguageDiagnostics(monaco, models) {
  for (const model of models.values()) {
    const language = model.getLanguageId();
    const diagnostics = SUPPORTED.has(language)
      ? findLanguageDiagnostics(language, model.getValue()).map((marker) => ({
          ...marker,
          severity: monaco.MarkerSeverity.Error,
        }))
      : [];
    monaco.editor.setModelMarkers(model, OWNER, diagnostics);
  }
}
