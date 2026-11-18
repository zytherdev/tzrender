const KEYWORDS = `select from where group by having order limit offset distinct as and or not null is in between like glob escape collate case when then else end cast exists between join inner left right full outer cross natural on using union all intersect except with recursive insert into values update set delete create table view index trigger temporary drop alter add column primary key foreign references unique check default autoincrement constraint begin commit rollback transaction savepoint release pragma explain analyze attach detach vacuum`.split(/\s+/);
const BUILTINS = {
  abs:['X'], changes:[], char:['X,...'], coalesce:['X,...'], count:['X'], date:['TIMESPEC,...'], datetime:['TIMESPEC,...'], 'group_concat':['X','Y'], hex:['X'], ifnull:['X','Y'], instr:['X','Y'], length:['X'], lower:['X'], ltrim:['X','Y'], max:['X,...'], min:['X,...'], nullif:['X','Y'], printf:['FORMAT,...'], quote:['X'], random:[], replace:['X','Y','Z'], round:['X','Y'], rtrim:['X','Y'], substr:['X','Y','Z'], sum:['X'], time:['TIMESPEC,...'], total:['X'], trim:['X','Y'], typeof:['X'], unicode:['X'], upper:['X'], zeroblob:['N'], json:['VALUE'], json_array:['VALUE,...'], json_extract:['JSON,PATH,...'], json_object:['LABEL,VALUE,...'], json_valid:['JSON'], iif:['B1,V1,...'], load_extension:['X','Y'], printf:['FORMAT,...']
};
const SNIPPETS = [
  ['select', 'SELECT ${1:columns}\nFROM ${2:table}\nWHERE ${3:condition};', 'SELECT query'],
  ['create table', 'CREATE TABLE ${1:name} (\n  ${2:id} INTEGER PRIMARY KEY\n);', 'Create a table'],
  ['insert', 'INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values});', 'Insert row'],
  ['join', 'JOIN ${1:table} ON ${2:condition}', 'Join clause']
];
const WORD = /[A-Za-z_][\w$]*/g;
function lex(source) {
  const out = []; let quote = '', lineComment = false, blockComment = false, escaped = false;
  const stack = [];
  for (let i=0;i<source.length;i++) {
    const c=source[i], n=source[i+1];
    if (lineComment) { if(c==='\n') lineComment=false; continue; }
    if (blockComment) { if(c==='*'&&n==='/'){blockComment=false;i++;} continue; }
    if (quote) { if(quote==='\''&&c==='\''&&n==='\''){i++;continue;} if(escaped){escaped=false;continue;} if(c==='\\'){escaped=true;continue;} if(c===quote)quote=''; continue; }
    if(c==='-'&&n==='-'){lineComment=true;i++;continue;} if(c==='/'&&n==='*'){blockComment=true;i++;continue;}
    if(c==="'"||c==='"'||c==='`'){quote=c;continue;}
    if(c==='['){quote=']';continue;}
    if('([{'.includes(c)){stack.push({c,i});out.push({type:'char',char:c,offset:i});} else if(')]}'.includes(c)){const expected={')':'(',']':'[','}':'{'}[c]; if(stack.at(-1)?.c===expected)stack.pop(); else out.push({type:'unexpected',char:c,offset:i});out.push({type:'char',char:c,offset:i});}
    else out.push({type:'char',char:c,offset:i});
  }
  return {out,stack,quote,blockComment};
}
export function analyzeSQL(source='') {
  source=String(source); const {out,stack,quote,blockComment}=lex(source), diagnostics=[];
  for(const item of out) if(item.type==='unexpected') diagnostics.push({message:`Unexpected closing delimiter “${item.char}”.`,severity:'error',offset:item.offset,length:1});
  for(const item of stack) diagnostics.push({message:`Unclosed delimiter “${item.c}”.`,severity:'error',offset:item.i,length:1});
  if(quote) diagnostics.push({message:'Unterminated quoted string or identifier.',severity:'warning',offset:Math.max(0,source.length-1),length:source.length?1:0});
  if(blockComment) diagnostics.push({message:'Unterminated block comment.',severity:'warning',offset:Math.max(0,source.length-2),length:source.length?Math.min(2,source.length):0});
  return diagnostics;
}
function content(model){return model.getValue?.() ?? '';}
function offsetAt(text,pos){return text.split('\n').slice(0,pos.lineNumber-1).reduce((n,l)=>n+l.length+1,0)+pos.column-1;}
function wordAt(text,offset){let start=offset,end=offset;while(start>0&&/[\w$]/.test(text[start-1]))start--;while(end<text.length&&/[\w$]/.test(text[end]))end++;return {word:text.slice(start,end),start,end};}
function codeBefore(text,offset){return lex(text.slice(0,offset)).out.map(x=>x.type==='char'?x.char:' ').join('');}
function symbols(snapshot){const result=[];for(const f of snapshot?.files||[]){const src=String(f.content||'');const re=/\bCREATE\s+(?:TEMP(?:ORARY)?\s+)?(?:TABLE|VIEW|INDEX|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?["`\[]?([\w]+)/ig;let m;while((m=re.exec(src)))result.push({name:m[1],kind:'table',file:f.name,detail:`SQLite ${m[0].replace(/\s+/g,' ').trim()} · ${f.name}`});}return result;}
function importContext(before){return before.match(/(?:\.read|(?:ATTACH(?:\s+DATABASE)?|SOURCE))\s+['"]?([^'"\n]*)$/i);}
function callAt(text,offset){const code=codeBefore(text,offset);let stack=[];for(let i=0;i<code.length;i++){if(code[i]==='(')stack.push(i);else if(code[i]===')')stack.pop();}const open=stack.at(-1);if(open==null)return null;const m=code.slice(0,open).match(/([\w]+)\s*$/);if(!m)return null;let depth=0,commas=0;for(let i=open+1;i<code.length;i++){const c=code[i];if('([{'.includes(c))depth++;else if(')]}'.includes(c))depth=Math.max(0,depth-1);else if(c===','&&depth===0)commas++;}return {name:m[1],parameter:commas};}
export function registerSQLIntelligence(monaco,getProject){
 if(!monaco?.languages||typeof getProject!=='function')throw new TypeError('Monaco and getProject are required.');
 const disposables=[], lang=monaco.languages, kinds=lang.CompletionItemKind||{};
 disposables.push(lang.registerCompletionItemProvider('sql',{triggerCharacters:[' ','.','"',"'"],provideCompletionItems(model,pos){const snap=getProject()||{},text=content(model),offset=offsetAt(text,pos),before=text.slice(0,offset),w=wordAt(text,offset),range={startLineNumber:pos.lineNumber,endLineNumber:pos.lineNumber,startColumn:pos.column-(offset-w.start),endColumn:pos.column+(w.end-offset)},suggestions=[];const add=(label,insertText=label,detail='',kind=kinds.Text??1,extra={})=>suggestions.push({label,insertText,detail,kind,range,...extra});const ctx=importContext(codeBefore(text,offset));if(ctx){for(const f of snap.files||[]){const name=String(f.name||'');if(name.startsWith(ctx[1]))add(name,name,'Project SQL file',kinds.File??17);}return {suggestions};}
 for(const k of KEYWORDS)add(k.toUpperCase(),k.toUpperCase(),'SQLite keyword',kinds.Keyword??17);
 for(const [name,args] of Object.entries(BUILTINS))add(name,`${name}($0)`,`${name}(${args.join(', ')}) · SQLite built-in`,kinds.Function??1,{insertTextRules:lang.CompletionItemInsertTextRule?.InsertAsSnippet??4});
 for(const [label,insertText,detail] of SNIPPETS)add(label,insertText,detail,kinds.Snippet??27,{insertTextRules:lang.CompletionItemInsertTextRule?.InsertAsSnippet??4});
 for(const s of symbols(snap))add(s.name,s.name,s.detail,kinds.Class??5);
 const unique=new Map();for(const item of suggestions)if(!unique.has(item.label))unique.set(item.label,item);return {suggestions:[...unique.values()]};}}));
 disposables.push(lang.registerHoverProvider('sql',{provideHover(model,pos){const text=content(model),off=offsetAt(text,pos),w=wordAt(text,off);if(!w.word)return null;const api=BUILTINS[w.word.toLowerCase()],sym=symbols(getProject()||{}).find(x=>x.name.toLowerCase()===w.word.toLowerCase());const info=api?`SQLite built-in ${w.word}(${api.join(', ')})`:sym?.detail;if(!info)return null;return {contents:[{value:info}],range:{startLineNumber:pos.lineNumber,endLineNumber:pos.lineNumber,startColumn:pos.column-(off-w.start),endColumn:pos.column+(w.end-off)}};}}));
 disposables.push(lang.registerSignatureHelpProvider('sql',{signatureHelpTriggerCharacters:['(',','],provideSignatureHelp(model,pos){const text=content(model),call=callAt(text,offsetAt(text,pos));if(!call)return null;const args=BUILTINS[call.name.toLowerCase()];if(!args)return null;const variadic=args.some(x=>x.endsWith('...'));const params=args.length?args:[''];const sig={label:`${call.name}(${args.join(', ')})`,documentation:'SQLite built-in function',parameters:params.map(label=>({label}))};return {value:{signatures:[sig],activeSignature:0,activeParameter:variadic?call.parameter:Math.min(call.parameter,Math.max(0,params.length-1))},dispose(){}};}}));
 let disposed=false;return {dispose(){if(disposed)return;disposed=true;for(const d of disposables)d?.dispose?.();}};
}
