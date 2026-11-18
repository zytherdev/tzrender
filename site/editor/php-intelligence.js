const KEYWORDS = ['abstract','and','array','as','break','callable','case','catch','class','clone','const','continue','declare','default','die','do','echo','else','elseif','empty','endfor','endforeach','endif','endswitch','endwhile','enum','eval','exit','extends','false','final','finally','fn','for','foreach','function','global','if','implements','include','include_once','instanceof','interface','isset','list','match','namespace','new','null','or','print','private','protected','public','readonly','require','require_once','return','static','switch','throw','trait','true','try','unset','use','var','while','xor','yield'];
const APIS = [
 ['array_map','array_map(callable $callback, array $array, array ...$arrays): array','Applies a callback to elements of one or more arrays.'],
 ['count','count(Countable|array $value, int $mode = COUNT_NORMAL): int','Counts elements in an array or a Countable object.'],
 ['explode','explode(string $separator, string $string, int $limit = PHP_INT_MAX): array','Splits a string by a separator.'],
 ['implode','implode(string $separator, array $array): string','Joins array elements into a string.'],
 ['in_array','in_array(mixed $needle, array $haystack, bool $strict = false): bool','Checks whether a value exists in an array.'],
 ['is_array','is_array(mixed $value): bool','Checks whether a value is an array.'],
 ['json_decode','json_decode(string $json, ?bool $associative = null): mixed','Decodes a JSON string.'],
 ['json_encode','json_encode(mixed $value, int $flags = 0): string|false','Encodes a value as JSON.'],
 ['max','max(mixed $value, mixed ...$values): mixed','Returns the maximum value.'], ['min','min(mixed $value, mixed ...$values): mixed','Returns the minimum value.'],
 ['print_r','print_r(mixed $value, bool $return = false): string|true','Prints or returns human-readable information.'],
 ['sprintf','sprintf(string $format, mixed ...$values): string','Returns a formatted string.'],
 ['str_contains','str_contains(string $haystack, string $needle): bool','Checks whether a string contains another string.'],
 ['strlen','strlen(string $string): int','Returns the byte length of a string.'],
 ['strpos','strpos(string $haystack, string $needle, int $offset = 0): int|false','Finds the position of a substring.'],
 ['str_replace','str_replace(array|string $search, array|string $replace, string|array $subject): string|array','Replaces occurrences in a string.'],
 ['substr','substr(string $string, int $offset, ?int $length = null): string','Returns part of a string.'],
 ['var_dump','var_dump(mixed $value, mixed ...$values): void','Displays structured information about values.'],
 ['array_filter','array_filter(array $array, ?callable $callback = null, int $mode = 0): array','Filters elements of an array.'],
 ['file_get_contents','file_get_contents(string $filename): string|false','Reads a file. In this offline runtime network access is disabled.'],
 ['include','include string $filename','Includes a project file; project-local paths run in the PHP-WASM workspace.'],
 ['require','require string $filename','Requires a project file; project-local paths run in the PHP-WASM workspace.']
];
const SNIPPETS = [
 {label:'function',insertText:'function ${1:name}(${2:args}): ${3:void}\n{\n\t$0\n}',detail:'Define a function'},
 {label:'class',insertText:'class ${1:Name}\n{\n\t$0\n}',detail:'Define a class'},
 {label:'foreach',insertText:'foreach (${1:$items} as ${2:$item}) {\n\t$0\n}',detail:'Iterate over an array'},
 {label:'if',insertText:'if (${1:condition}) {\n\t$0\n}',detail:'Conditional block'},
 {label:'try',insertText:'try {\n\t${1}\n} catch (\\${2:Throwable} $${3:error}) {\n\t$0\n}',detail:'Try/catch block'}
];
const API_MAP = new Map(APIS.map(([name,signature,detail]) => [name,{signature,detail}]));
function projectInfo(getProject) { try { const p=getProject?.()||{}; return {...p,files:Array.isArray(p.files)?p.files:[]}; } catch { return {files:[]}; } }
function symbols(project) {
 const found=new Map();
 for(const file of project.files) { if(typeof file?.content!=='string') continue;
  const clean=maskPHP(file.content);
  const re=/\bfunction\s*&?\s*([A-Za-z_][\w]*)\s*\(([^)]*)\)|\bclass\s+([A-Za-z_][\w]*)|\binterface\s+([A-Za-z_][\w]*)|\btrait\s+([A-Za-z_][\w]*)|\bconst\s+([A-Z_][A-Z_0-9]*)\b|\b(?:public|protected|private|static|readonly|var)\s+\$([A-Za-z_][\w]*)/g;
  let m; while((m=re.exec(clean))) { const name=m[1]||m[3]||m[4]||m[5]||m[6]||m[7]; const type=m[1]?'function':m[3]?'class':m[4]?'interface':m[5]?'trait':m[6]?'constant':'property'; if(!found.has(name)) found.set(name,{name,type,file:file.name,signature:m[1]?`function ${name}(${m[2].trim()})`:''}); }
 }
 return [...found.values()];
}
// Replace comments and literal bodies with spaces while preserving offsets/newlines.
function maskPHP(source) {
 const out=source.split(''); let state='code', escape=false;
 for(let i=0;i<source.length;i++){const c=source[i],n=source[i+1];
  if(state==='line'){if(c==='\n')state='code';else out[i]=' ';continue;}
  if(state==='block'){if(c==='*'&&n==='/'){out[i]=out[i+1]=' ';i++;state='code';}else if(c!=='\n')out[i]=' ';continue;}
  if(state==='single'||state==='double'||state==='backtick'){if(c!=='\n')out[i]=' ';if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if((state==='single'&&c==="'")||(state==='double'&&c==='"')||(state==='backtick'&&c==='`'))state='code';continue;}
  if(c==='/'&&n==='/'){out[i]=out[i+1]=' ';i++;state='line';} else if(c==='#'){out[i]=' ';state='line';} else if(c==='/'&&n==='*'){out[i]=out[i+1]=' ';i++;state='block';} else if(c==="'") {out[i]=' ';state='single';} else if(c==='"'){out[i]=' ';state='double';} else if(c==='`'){out[i]=' ';state='backtick';}
 }
 return out.join('');
}
function getOffset(model,pos){if(typeof model.getOffsetAt==='function')return model.getOffsetAt(pos);const lines=model.getValue().split('\n');let n=pos.column-1;for(let i=0;i<pos.lineNumber-1;i++)n+=(lines[i]||'').length+1;return n;}
function positionAt(source,offset){const head=source.slice(0,offset).split('\n');return {lineNumber:head.length,column:head.at(-1).length+1};}
function callAt(source,offset){const masked=maskPHP(source.slice(0,offset)), stack=[];for(let i=0;i<masked.length;i++){if(masked[i]==='(')stack.push(i);else if(masked[i]===')')stack.pop();}for(let i=stack.length-1;i>=0;i--){const open=stack[i],m=masked.slice(0,open).match(/([A-Za-z_][\w]*)\s*$/);if(!m)continue;let depth=0,commas=0;for(let j=open+1;j<offset;j++){const c=masked[j];if('([{'.includes(c))depth++;else if(')]}'.includes(c))depth=Math.max(0,depth-1);else if(c===','&&depth===0)commas++;}return {name:m[1],argumentIndex:commas};}return null;}
function parameters(signature){const body=signature.slice(signature.indexOf('(')+1,signature.lastIndexOf(')'));const result=[];let start=0,depth=0;for(let i=0;i<body.length;i++){if('([{<'.includes(body[i]))depth++;else if(')]}>'.includes(body[i]))depth--;else if(body[i]===','&&depth===0){result.push(body.slice(start,i).trim());start=i+1;}}if(body.slice(start).trim())result.push(body.slice(start).trim());return result;}
/** Conservative, non-executing checks for definite delimiter and unterminated literal/comment issues. */
export function analyzePHP(source){source=String(source??'');const diagnostics=[],stack=[];let state='code',escape=false,start=0;const pairs={')':'(',']':'[','}':'{'};for(let i=0;i<source.length;i++){const c=source[i],n=source[i+1];if(state==='line'){if(c==='\n')state='code';continue;}if(state==='block'){if(c==='*'&&n==='/'){state='code';i++;}continue;}if(state==='single'||state==='double'||state==='backtick'){if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if((state==='single'&&c==="'")||(state==='double'&&c==='"')||(state==='backtick'&&c==='`'))state='code';continue;}if(c==='#'||(c==='/'&&n==='/')){state='line';if(c==='/')i++;continue;}if(c==='/'&&n==='*'){state='block';start=i;i++;continue;}if(c==="'"||c==='"'||c==='`'){state=c==="'"?'single':c==='"'?'double':'backtick';start=i;continue;}if('([{'.includes(c))stack.push({c,index:i});else if(pairs[c]){if(stack.at(-1)?.c===pairs[c])stack.pop();else diagnostics.push(diag(source,i,`Unexpected closing delimiter “${c}”.`));}}if(state==='block')diagnostics.push(diag(source,start,'Unterminated block comment.'));else if(['single','double','backtick'].includes(state))diagnostics.push(diag(source,start,'Unterminated string literal.'));for(const item of stack)diagnostics.push(diag(source,item.index,`Unclosed delimiter “${item.c}”.`));return diagnostics;}
function diag(source,offset,message){const p=positionAt(source,offset);return {severity:8,message,source:'PHP',startLineNumber:p.lineNumber,startColumn:p.column,endLineNumber:p.lineNumber,endColumn:p.column+1};}
function wordRange(position,word){return {startLineNumber:position.lineNumber,endLineNumber:position.lineNumber,startColumn:word.startColumn,endColumn:word.endColumn};}
function pathContext(text){return text.match(/\b(?:include|include_once|require|require_once)\s*\(?\s*(['"])([^'"\n]*)$/);}
export function registerPHPIntelligence(monaco,getProject){if(!monaco?.languages||typeof getProject!=='function')throw new TypeError('Monaco and getProject are required.');const lang=monaco.languages,kind=lang.CompletionItemKind||{},handles=[];
 handles.push(lang.registerCompletionItemProvider('php',{triggerCharacters:['$','\\','"',"'",'/'],provideCompletionItems(model,pos){const project=projectInfo(getProject),text=model.getValue(),offset=getOffset(model,pos),before=text.slice(0,offset),word=model.getWordUntilPosition?.(pos)||{startColumn:pos.column,endColumn:pos.column,word:''},range={startLineNumber:pos.lineNumber,endLineNumber:pos.lineNumber,startColumn:word.startColumn,endColumn:word.endColumn};const pc=pathContext(before);let suggestions=[];if(pc){const prefix=pc[2],base=project.activeFile?.includes('/')?project.activeFile.slice(0,project.activeFile.lastIndexOf('/')+1):'';suggestions=project.files.filter(f=>typeof f?.name==='string'&&f.name.startsWith(base+prefix)&&f.name!==project.activeFile).map(f=>({label:f.name.slice(base.length),insertText:f.name.slice(base.length),kind:kind.File??17,detail:`Project file · ${f.name}`,range}));}else{suggestions=[...KEYWORDS.map(label=>({label,insertText:label,kind:kind.Keyword??17,range})),...APIS.map(([label,signature,documentation])=>({label,insertText:label,kind:kind.Function??1,detail:signature,documentation,range})),...symbols(project).map(s=>({label:s.name,insertText:s.name,kind:s.type==='function'?(kind.Function??1):kind.Class??5,detail:`${s.type} · ${s.file}${s.signature?` · ${s.signature}`:''}`,range})),...SNIPPETS.map(s=>({...s,kind:kind.Snippet??27,insertTextRules:lang.CompletionItemInsertTextRule?.InsertAsSnippet??4,range}))];}const seen=new Set();return {suggestions:suggestions.filter(s=>{if(seen.has(s.label))return false;seen.add(s.label);return true;})};}}));
 handles.push(lang.registerHoverProvider('php',{provideHover(model,pos){const word=model.getWordAtPosition?.(pos);if(!word)return null;const api=API_MAP.get(word.word),sym=symbols(projectInfo(getProject)).find(s=>s.name===word.word);if(!api&&!sym)return null;const contents=api?[{value:'**PHP built-in** · `'+api.signature+'`'},{value:api.detail}]:[{value:'**Project '+sym.type+'** · `'+(sym.signature||sym.name)+'`'},{value:'Declared in `'+sym.file+'`.'}];return {range:wordRange(pos,word),contents};}}));
 handles.push(lang.registerSignatureHelpProvider('php',{signatureHelpTriggerCharacters:['(',','],signatureHelpRetriggerCharacters:[','],provideSignatureHelp(model,pos){const call=callAt(model.getValue(),getOffset(model,pos));if(!call)return null;const api=API_MAP.get(call.name),sym=symbols(projectInfo(getProject)).find(s=>s.name===call.name&&s.type==='function');const signature=api?.signature||sym?.signature;if(!signature)return null;const params=parameters(signature).map(label=>({label}));const activeParameter=Math.min(call.argumentIndex,Math.max(0,params.length-1));return {value:{signatures:[{label:signature,documentation:api?.detail||`Defined in ${sym.file}.`,parameters}],activeSignature:0,activeParameter},dispose(){}};}}));let disposed=false;return {dispose(){if(disposed)return;disposed=true;for(const h of handles)h?.dispose?.();}};
}
