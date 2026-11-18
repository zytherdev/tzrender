const KEYWORDS = 'and break do else elseif end false for function goto if in local nil not or repeat return then true until while'.split(' ');
const APIS = {
  assert: ['assert(v, message?)', 'Raises an error when v is false or nil; otherwise returns its arguments.'],
  collectgarbage: ['collectgarbage(opt?, arg?)', 'Controls the garbage collector.'],
  dofile: ['dofile(filename)', 'Loads and executes a Lua file.'], error: ['error(message, level?)', 'Raises an error.'],
  getmetatable: ['getmetatable(object)', 'Returns the metatable of object.'], ipairs: ['ipairs(table)', 'Iterates integer keys in order.'],
  load: ['load(chunk, chunkname?, mode?, env?)', 'Loads a chunk without executing it.'], loadfile: ['loadfile(filename?, mode?, env?)', 'Loads a chunk from a file.'],
  next: ['next(table, index?)', 'Iterates over table keys.'], pairs: ['pairs(table)', 'Iterates over all keys in a table.'], pcall: ['pcall(f, ...)', 'Calls f protected; returns status and results.'], print: ['print(...)', 'Writes values to standard output.'],
  rawequal: ['rawequal(v1, v2)', 'Tests equality without metamethods.'], rawget: ['rawget(table, index)', 'Gets a table value without metamethods.'], rawset: ['rawset(table, index, value)', 'Sets a table value without metamethods.'],
  require: ['require(modname)', 'Loads a module; project Lua files are available through the in-memory module loader.'], select: ['select(index, ...)', 'Selects arguments from a vararg list.'], setmetatable: ['setmetatable(table, metatable)', 'Sets a table metatable.'], tonumber: ['tonumber(value, base?)', 'Converts a value to a number.'], tostring: ['tostring(value)', 'Converts a value to a string.'], type: ['type(value)', 'Returns the type name of a value.'], xpcall: ['xpcall(f, msgh, ...)', 'Calls f protected with a message handler.'],
  string: ['library string', 'Lua string manipulation library.'], table: ['library table', 'Lua table manipulation library.'], math: ['library math', 'Lua mathematical functions.'], utf8: ['library utf8', 'Lua UTF-8 support library.'], coroutine: ['library coroutine', 'Lua coroutine library.']
};
const SNIPPETS = [
 ['function', 'function ${1:name}(${2:args})\n  $0\nend', 'Define a function'],
 ['local function', 'local function ${1:name}(${2:args})\n  $0\nend', 'Define a local function'],
 ['for', 'for ${1:i} = ${2:1}, ${3:n} do\n  $0\nend', 'Numeric loop'],
 ['pairs', 'for ${1:key}, ${2:value} in pairs(${3:table}) do\n  $0\nend', 'Iterate over table entries'],
 ['if', 'if ${1:condition} then\n  $0\nend', 'Conditional block']
];
const IDENT = '[A-Za-z_][A-Za-z0-9_]*';
function clean(source) {
  let out = '', i = 0;
  while (i < source.length) {
    if (source[i] === '-' && source[i+1] === '-') {
      const m = source.slice(i+2).match(/^\[(=*)\[/);
      if (m) { const close = `]${m[1]}]`; const end = source.indexOf(close, i+2+m[0].length); i = end < 0 ? source.length : end + close.length; }
      else { const end = source.indexOf('\n', i); i = end < 0 ? source.length : end; }
      out += ' '; continue;
    }
    if (source[i] === '[' && (m = source.slice(i).match(/^\[(=*)\[/))) { var m; const close = `]${m[1]}]`; const end = source.indexOf(close, i+m[0].length); i = end < 0 ? source.length : end + close.length; out += ' '; continue; }
    if (`'"\``.includes(source[i])) { const q = source[i++]; let escaped = false; while (i < source.length) { const ch = source[i++]; if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === q) break; } out += ' '; continue; }
    out += source[i++];
  }
  return out;
}
function scanDiagnostics(source) {
  const stack = [], errors = []; let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '-' && source[i+1] === '-') { const m=source.slice(i+2).match(/^\[(=*)\[/); if (m) { const close=`]${m[1]}]`, end=source.indexOf(close,i+2+m[0].length); if(end<0) errors.push({message:'Unterminated long comment',offset:i}); else i=end+close.length; } else { const n=source.indexOf('\n',i); i=n<0?source.length:n; } continue; }
    if (c === '[') { const m=source.slice(i).match(/^\[(=*)\[/); if(m){const close=`]${m[1]}]`,end=source.indexOf(close,i+m[0].length);if(end<0)errors.push({message:'Unterminated long string',offset:i});else i=end+close.length;continue;} }
    if (c === '"' || c === "'") { const start=i++, q=c; let esc=false,closed=false; while(i<source.length){const ch=source[i++];if(esc)esc=false;else if(ch==='\\')esc=true;else if(ch===q){closed=true;break;}else if(ch==='\n')break;}if(!closed)errors.push({message:'Unterminated string',offset:start});continue; }
    if ('([{'.includes(c)) stack.push({c,offset:i});
    else if (')]}'.includes(c)) { const expected={')':'(',']':'[','}':'{'}[c], top=stack.at(-1); if(top?.c===expected) stack.pop(); else errors.push({message:`Unexpected closing delimiter ${c}`,offset:i}); }
    i++;
  }
  for (const item of stack) errors.push({message:`Unclosed delimiter ${item.c}`,offset:item.offset});
  return errors.map(e=>{const before=source.slice(0,e.offset),lineNumber=(before.match(/\n/g)||[]).length+1,column=e.offset-(before.lastIndexOf('\n')+1)+1;return {...e,lineNumber,column,severity:'error'};});
}
export function analyzeLua(source) { return scanDiagnostics(String(source ?? '')); }
function parseParams(text) { return text.trim()?text.split(',').map(x=>x.trim()).filter(Boolean):[]; }
function collect(snapshot) {
 const files=Array.isArray(snapshot?.files)?snapshot.files:[], symbols=new Map();
 for(const f of files){if(typeof f?.content!=='string')continue;const s=clean(f.content);
  const fn=new RegExp(`\\b(?:local\\s+)?function\\s+(${IDENT}(?:\\.${IDENT})*)\\s*\\(([^)]*)\\)`,'g');let m;
  while((m=fn.exec(s)))symbols.set(m[1],{name:m[1],params:parseParams(m[2]),file:f.name,type:'function'});
  const assign=new RegExp(`\\blocal\\s+(${IDENT})(?!\\s*\\()`,'g');while((m=assign.exec(s)))if(!symbols.has(m[1]))symbols.set(m[1],{name:m[1],file:f.name,type:'variable'});
 }
 return {files,symbols};
}
function modelText(model){return model.getValue?.()??'';}
function offsetAt(model,p){return model.getOffsetAt?.(p)??modelText(model).split('\n').slice(0,p.lineNumber-1).reduce((n,l)=>n+l.length+1,0)+p.column-1;}
function wordRange(p,w){return {startLineNumber:p.lineNumber,endLineNumber:p.lineNumber,startColumn:w.startColumn,endColumn:w.endColumn};}
function getWord(model,p){return model.getWordAtPosition?.(p)??null;}
function findCall(text,offset){const src=clean(text.slice(0,offset)), stack=[];for(let i=0;i<src.length;i++){if(src[i]==='(')stack.push(i);else if(src[i]===')')stack.pop();}const open=stack.at(-1);if(open==null)return null;const m=src.slice(0,open).match(/([A-Za-z_][\w.]*)\s*$/);if(!m)return null;let depth=0,commas=0;for(let i=open+1;i<src.length;i++){const c=src[i];if('([{'.includes(c))depth++;else if(')]}'.includes(c))depth=Math.max(0,depth-1);else if(c===','&&depth===0)commas++;}return {name:m[1],argument:commas};}
function fileNames(snapshot){return (snapshot?.files||[]).map(f=>f?.name).filter(n=>typeof n==='string').concat((snapshot?.folders||[]).map(f=>typeof f==='string'?f:f?.name).filter(Boolean));}
function importContext(before){return /\brequire\s*\(\s*(['"])([^'"]*)$/.exec(before);}
export function registerLuaIntelligence(monaco,getProject){
 if(!monaco?.languages||typeof getProject!=='function')throw new TypeError('Monaco and getProject are required.');
 const L=monaco.languages, K=L.CompletionItemKind||{}, R=L.CompletionItemInsertTextRule||{}, ds=[];
 ds.push(L.registerCompletionItemProvider('lua',{triggerCharacters:['.','"',"'",'/'],provideCompletionItems(model,p){const snap=getProject()||{},text=modelText(model),off=offsetAt(model,p),before=text.slice(0,off),line=model.getLineContent(p.lineNumber),w=model.getWordUntilPosition?.(p)||{startColumn:p.column,endColumn:p.column},range={startLineNumber:p.lineNumber,endLineNumber:p.lineNumber,startColumn:w.startColumn,endColumn:w.endColumn};const ic=importContext(before);let suggestions=[];if(ic){const prefix=ic[2];suggestions=fileNames(snap).filter(n=>n.startsWith(prefix)).map(n=>({label:n,insertText:n,kind:K.File??17,detail:'Lua project module/file',range}));}else{const {symbols}=collect(snap);suggestions=[...KEYWORDS.map(label=>({label,insertText:label,kind:K.Keyword??17,range})),...Object.entries(APIS).map(([label,[sig,doc]])=>({label,insertText:label,kind:K.Function??1,detail:sig,documentation:doc,range})),...[...symbols.values()].filter(s=>s.file===snap.activeFile||!snap.activeFile).map(s=>({label:s.name,insertText:s.name,kind:s.type==='function'?(K.Function??1):(K.Variable??5),detail:`${s.type} · ${s.file}`,range})),...SNIPPETS.map(([label,insertText,detail])=>({label:`${label} (snippet)`,insertText,detail,kind:K.Snippet??27,insertTextRules:R.InsertAsSnippet??4,range}))];}const seen=new Set();return {suggestions:suggestions.filter(x=>{if(seen.has(x.label))return false;seen.add(x.label);return true;})};}}));
 ds.push(L.registerHoverProvider('lua',{provideHover(model,p){const w=getWord(model,p);if(!w)return null;const api=APIS[w.word],sym=collect(getProject()||{}).symbols.get(w.word);if(!api&&!sym)return null;const sig=api?.[0]||`${sym.name}(${sym.params?.join(', ')||''})`;const doc=api?.[1]||`Declared in ${sym.file}.`;return {range:wordRange(p,w),contents:[{value:api?`**Lua built-in** · \`${sig}\``:`**Project function** · \`${sig}\``},{value:doc}]};}}));
 ds.push(L.registerSignatureHelpProvider('lua',{signatureHelpTriggerCharacters:['(',','],signatureHelpRetriggerCharacters:[','],provideSignatureHelp(model,p){const call=findCall(modelText(model),offsetAt(model,p));if(!call)return null;const api=APIS[call.name],sym=collect(getProject()||{}).symbols.get(call.name);if(!api&&sym?.type!=='function')return null;const label=api?.[0]||`${sym.name}(${sym.params.join(', ')})`,inside=label.slice(label.indexOf('(')+1,label.lastIndexOf(')')),params=parseParams(inside),active=Math.min(call.argument,Math.max(0,params.length-1));return {value:{signatures:[{label,documentation:api?.[1]||`Defined in ${sym.file}.`,parameters:params.map(label=>({label})),activeParameter:active}],activeSignature:0,activeParameter:active},dispose(){}};}}));
 ds.push(L.registerCodeActionProvider?.('lua',{provideCodeActions(model){const markers=analyzeLua(modelText(model)).map(e=>({severity:monaco.MarkerSeverity?.Error??8,message:e.message,startLineNumber:e.lineNumber,startColumn:e.column,endLineNumber:e.lineNumber,endColumn:e.column+1}));return {actions:[],dispose(){}};}}));
 return {dispose(){for(const d of ds.splice(0))d?.dispose?.();}};
}
