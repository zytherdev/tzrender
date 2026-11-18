const KEYWORDS = 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record sealed permits yield'.split(' ');
const APIS = {
  System: { signature: 'System', detail: 'Provides standard input, output, error streams, and system utilities.' },
  'System.out.println': { signature: 'println(Object value) → void', detail: 'Prints a value followed by a line terminator.' },
  'System.out.print': { signature: 'print(Object value) → void', detail: 'Prints a value without a line terminator.' },
  'System.out.printf': { signature: 'printf(String format, Object... args) → PrintStream', detail: 'Writes formatted output.' },
  'System.err.println': { signature: 'println(Object value) → void', detail: 'Prints a diagnostic value to standard error.' },
  'Integer.parseInt': { signature: 'parseInt(String s) → int', detail: 'Parses a string as a signed decimal integer.' },
  'Double.parseDouble': { signature: 'parseDouble(String s) → double', detail: 'Parses a string as a double.' },
  'Math.max': { signature: 'max(int a, int b) → int', detail: 'Returns the greater of two values.' }, 'Math.min': { signature: 'min(int a, int b) → int', detail: 'Returns the lesser of two values.' }, 'Math.abs': { signature: 'abs(int a) → int', detail: 'Returns the absolute value.' },
  'String.valueOf': { signature: 'valueOf(Object obj) → String', detail: 'Returns the string representation of a value.' }, 'Arrays.toString': { signature: 'toString(Object[] a) → String', detail: 'Returns a readable representation of an array.' },
  'List.of': { signature: 'of(E... elements) → List<E>', detail: 'Creates an unmodifiable list.' }, 'Collections.sort': { signature: 'sort(List<T> list) → void', detail: 'Sorts a list into natural order.' }
};
const SNIPPETS = [
  ['main method', 'public static void main(String[] args) {\n\t$0\n}', 'Java entry point'],
  ['class', 'public class ${1:ClassName} {\n\t$0\n}', 'Declare a class'],
  ['for loop', 'for (int ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++) {\n\t$0\n}', 'Indexed loop'],
  ['for-each loop', 'for (${1:Type} ${2:item} : ${3:items}) {\n\t$0\n}', 'Enhanced for loop'],
  ['if statement', 'if (${1:condition}) {\n\t$0\n}', 'Conditional'],
  ['method', 'public ${1:void} ${2:name}(${3:parameters}) {\n\t$0\n}', 'Declare a method']
];
function scrub(source) {
  return String(source).replace(/"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, m => m.replace(/[^\r\n]/g, ' '));
}
export function analyzeJava(source) {
  const text = scrub(source), stack = [], diagnostics = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ('([{'.includes(c)) stack.push({ c, i });
    else if (pairs[c]) {
      if (stack.at(-1)?.c === pairs[c]) stack.pop();
      else diagnostics.push({ offset: i, length: 1, message: `Unmatched closing delimiter '${c}'.`, severity: 'error' });
    }
  }
  for (const item of stack) diagnostics.push({ offset: item.i, length: 1, message: `Unclosed delimiter '${item.c}'.`, severity: 'error' });
  return diagnostics;
}
function clean(source) { return scrub(source); }
function collect(snapshot) {
  const files = Array.isArray(snapshot?.files) ? snapshot.files.filter(f => f && typeof f.name === 'string' && typeof f.content === 'string') : [];
  const symbols = new Map();
  for (const file of files) {
    const text = clean(file.content);
    for (const m of text.matchAll(/\b(class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/g)) if (!symbols.has(m[2])) symbols.set(m[2], { name: m[2], type: m[1], file: file.name, signature: `${m[1]} ${m[2]}` });
    for (const m of text.matchAll(/\b(?:public|protected|private)?\s*(?:static\s+)?([\w$<>?,.\[\] ]+)\s+([A-Za-z_$][\w$]*)\s*\(([^()]*)\)\s*(?:throws\s+[\w,. ]+)?\s*\{/g)) {
      const name=m[2], prefix=m[1].trim(); if (KEYWORDS.includes(name) || ['if','for','while','switch','catch'].includes(name)) continue;
      const params=m[3].trim() ? splitTop(m[3]).map(p => p.trim()) : [];
      if (!symbols.has(name)) symbols.set(name, { name, type:'method', file:file.name, params, signature:`${prefix} ${name}(${params.join(', ')})` });
    }
    for (const m of text.matchAll(/\b(?:int|long|double|float|boolean|char|String|var)\s+([A-Za-z_$][\w$]*)\b/g)) if (!symbols.has(m[1])) symbols.set(m[1], { name:m[1], type:'variable', file:file.name, signature:`${m[0].trim()}` });
  }
  return { files, symbols };
}
function splitTop(text) { const out=[]; let start=0, depth=0, quote='', esc=false; for(let i=0;i<text.length;i++){const c=text[i]; if(quote){if(esc)esc=false;else if(c==='\\')esc=true;else if(c===quote)quote='';continue;} if(c==='"'||c==="'"){quote=c;continue;} if('([{<'.includes(c))depth++; else if(')]}>'.includes(c))depth=Math.max(0,depth-1); else if(c===','&&depth===0){out.push(text.slice(start,i));start=i+1;}} if(text.slice(start).trim())out.push(text.slice(start)); return out; }
function positionOffset(model,pos) { const lines=model.getValue().split(/\r?\n/); return lines.slice(0,pos.lineNumber-1).reduce((n,l)=>n+l.length+1,0)+pos.column-1; }
function findCall(text, offset) { const stack=[];let quote='',esc=false;for(let i=0;i<offset;i++){const c=text[i];if(quote){if(esc)esc=false;else if(c==='\\')esc=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if('([{'.includes(c))stack.push({c,i});else if(')]}'.includes(c))stack.pop();} const open=[...stack].reverse().find(x=>x.c==='('); if(!open)return null; const before=text.slice(0,open.i), m=before.match(/([A-Za-z_$][\w$]*)\s*$/);if(!m)return null;let n=0;for(const p of splitTop(text.slice(open.i+1,offset)))if(p.trim())n++; return {name:m[1],argumentIndex:Math.max(0,n-1)}; }
function range(pos,word) { return { startLineNumber:pos.lineNumber,endLineNumber:pos.lineNumber,startColumn:word.startColumn,endColumn:word.endColumn }; }
function nameAt(model,pos) { return model.getWordAtPosition?.(pos) || null; }
function apiFor(name) { return APIS[name] || (name==='println' ? APIS['System.out.println'] : name==='print' ? APIS['System.out.print'] : null); }
function projectItems(snapshot, completionKind, rangeValue) { const names=new Set(); for(const f of snapshot.files||[]) { const n=f?.name?.replaceAll('\\','/'); if(n?.endsWith('.java')) { names.add(n.replace(/\.java$/,'')); names.add(n.split('/').at(-1).replace(/\.java$/,'')); } } for(const folder of snapshot.folders||[]) { const n=typeof folder==='string'?folder:folder?.name;if(n)names.add(`${n.replace(/\/$/,'')}/`); } return [...names].map(label=>({label,insertText:label,kind:completionKind.File??completionKind.Module??9,detail:'Java project source'})); }
export function registerJavaIntelligence(monaco,getProject) {
  if(!monaco?.languages||typeof getProject!=='function') throw new TypeError('Monaco and getProject are required.');
  const disposables=[], lang='java', kinds=monaco.languages.CompletionItemKind||{}, snippetRule=monaco.languages.CompletionItemInsertTextRule?.InsertAsSnippet??4;
  disposables.push(monaco.languages.registerCompletionItemProvider(lang,{triggerCharacters:['.','"','/'],provideCompletionItems(model,pos){const snap=getProject()||{}, {symbols}=collect(snap),text=model.getValue(),before=text.slice(0,positionOffset(model,pos)),word=model.getWordUntilPosition?.(pos)||{startColumn:pos.column,endColumn:pos.column,word:''},r={startLineNumber:pos.lineNumber,endLineNumber:pos.lineNumber,startColumn:word.startColumn,endColumn:word.endColumn}; const im=before.match(/\b(?:import|package)\s+[\w.$/]*$/); let items=[];if(im) items=projectItems(snap,kinds,r); else {items=KEYWORDS.map(label=>({label,insertText:label,kind:kinds.Keyword??17,detail:'Java keyword',range:r})); for(const [label,api] of Object.entries(APIS)) items.push({label,insertText:label,kind:kinds.Function??1,detail:api.signature,documentation:api.detail,range:r}); for(const s of symbols.values()) items.push({label:s.name,insertText:s.name,kind:s.type==='method'?(kinds.Method??0):s.type==='class'?(kinds.Class??5):kinds.Variable??5,detail:`${s.signature} · ${s.file}`,range:r}); for(const [label,insertText,detail] of SNIPPETS)items.push({label,insertText,detail,kind:kinds.Snippet??27,insertTextRules:snippetRule,range:r}); } const unique=new Map();for(const i of items){if(!i.range)i.range=r;if(!unique.has(i.label))unique.set(i.label,i);}return {suggestions:[...unique.values()]};}}));
  disposables.push(monaco.languages.registerHoverProvider(lang,{provideHover(model,pos){const w=nameAt(model,pos);if(!w)return null;const line=model.getLineContent?.(pos.lineNumber)||model.getValue().split(/\r?\n/)[pos.lineNumber-1]||'', left=line.slice(0,w.startColumn-1), dotted=left.match(/(?:[A-Za-z_$][\w$]*\.)+[A-Za-z_$][\w$]*$/), qualified=dotted?dotted[0]+w.word:w.word, api=apiFor(qualified)||apiFor(w.word);if(api)return {range:range(pos,w),contents:[{value:`**Java API** · \`${api.signature}\`\n\n${api.detail}`}]};const s=collect(getProject()||{}).symbols.get(w.word);return s?{range:range(pos,w),contents:[{value:`**Project ${s.type}** · \`${s.signature}\`\n\nDeclared in \`${s.file}\`.`}]}:null;}}));
  disposables.push(monaco.languages.registerSignatureHelpProvider(lang,{signatureHelpTriggerCharacters:['(',','],signatureHelpRetriggerCharacters:[','],provideSignatureHelp(model,pos){const text=model.getValue(),call=findCall(text,positionOffset(model,pos));if(!call)return null;const {symbols}=collect(getProject()||{}),sym=symbols.get(call.name),api=apiFor(call.name);if(!sym&& !api)return null;const label=sym?.signature||`${call.name}(${api.signature.replace(/^[^(]*\(/,'').replace(/\).*/,')')}`,inside=label.slice(label.indexOf('(')+1,label.lastIndexOf(')')),params=splitTop(inside).map(x=>x.trim()).filter(Boolean);return {value:{signatures:[{label,documentation:api?.detail||`Defined in ${sym.file}.`,parameters:params.map(label=>({label}))}],activeSignature:0,activeParameter:Math.min(call.argumentIndex,Math.max(0,params.length-1))},dispose(){}};}}));
  disposables.push(monaco.languages.registerDocumentFormattingEditProvider?.(lang,{provideDocumentFormattingEdits(){return [];}}));
  disposables.push(monaco.languages.registerCodeActionProvider?.(lang,{provideCodeActions(model){const diagnostics=analyzeJava(model.getValue()).map(d=>({message:d.message,severity:monaco.MarkerSeverity?.Error??8,startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:2}));return {actions:[],dispose(){},...(diagnostics.length?{diagnostics}:{})};}}));
  let disposed=false;return {dispose(){if(disposed)return;disposed=true;for(const d of disposables.splice(0))d?.dispose?.();}};
}
