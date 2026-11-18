const YAML_KEYS = ['name', 'version', 'description', 'author', 'license', 'scripts', 'dependencies', 'devDependencies', 'main', 'type', 'jobs', 'services', 'image', 'ports', 'environment', 'steps', 'run', 'uses', 'on', 'branches', 'permissions', 'metadata', 'spec', 'apiVersion', 'kind'];
const YAML_VALUES = ['true', 'false', 'null', '[]', '{}', 'develop', 'production', 'latest'];
const XML_TAGS = ['html', 'head', 'body', 'title', 'meta', 'link', 'script', 'style', 'div', 'main', 'section', 'article', 'header', 'footer', 'nav', 'p', 'a', 'img', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'form', 'label', 'input', 'button', 'svg'];
const XML_ATTRS = ['id', 'class', 'name', 'type', 'href', 'src', 'alt', 'title', 'rel', 'content', 'lang', 'role', 'aria-label', 'placeholder', 'value'];
const MD_SNIPPETS = [
  ['heading', '# ${1:Heading}\n', 'Markdown heading'], ['link', '[${1:text}](${2:path})', 'Markdown link'],
  ['unordered list', '- ${1:item}\n- ${2:item}', 'Unordered list'], ['ordered list', '1. ${1:item}\n2. ${2:item}', 'Ordered list'],
  ['code fence', '``` ${1:language}\n${2:code}\n```', 'Fenced code block'],
  ['table', '| ${1:Column} | ${2:Column} |\n| --- | --- |\n| ${3:Value} | ${4:Value} |', 'Markdown table']
];
const WORD = /[\w:-]+/g;
function modelText(model) { return String(model?.getValue?.() ?? ''); }
function offsetAt(text, pos) { return text.split('\n').slice(0, pos.lineNumber - 1).reduce((n, line) => n + line.length + 1, 0) + pos.column - 1; }
function wordAt(text, offset) { let start=offset,end=offset; while(start>0&&/[\w:-]/.test(text[start-1]))start--; while(end<text.length&&/[\w:-]/.test(text[end]))end++; return {word:text.slice(start,end),start,end}; }
function rangeAt(pos, w, off) { return {startLineNumber:pos.lineNumber,endLineNumber:pos.lineNumber,startColumn:pos.column-(off-w.start),endColumn:pos.column+(w.end-off)}; }
function filesOf(project) { return Array.isArray(project?.files) ? project.files : []; }
function yamlKeys(project) { const keys=new Set(YAML_KEYS); for(const f of filesOf(project)){const re=/^\s*([\w.-]+)\s*:/gm;let m;while((m=re.exec(String(f.content||''))))keys.add(m[1]);} return [...keys]; }
function xmlProjectTags(project) { const names=new Set(); for(const f of filesOf(project)){const re=/<\s*([A-Za-z][\w:-]*)\b/g;let m;while((m=re.exec(String(f.content||''))))names.add(m[1]);} return [...names]; }
function relativeFiles(text, off, project) { const before=text.slice(0,off), m=before.match(/\]\(([^)]*)$/); if(!m)return null; const prefix=m[1]; return filesOf(project).map(f=>String(f.name||'')).filter(n=>n.startsWith(prefix)); }
function commonPrefixRange(text,pos) { const off=offsetAt(text,pos), w=wordAt(text,off); return {off,w,range:rangeAt(pos,w,off)}; }

// Conservative structural checks only; never parse or execute the source.
export function analyzeDocument(language, source='') {
  source=String(source); const out=[];
  const push=(offset,length,message,severity='warning')=>out.push({offset,length,message,severity});
  if(language==='yaml') {
    let base=0; for(const line of source.split('\n')){if(/^\s*\t/.test(line))push(base+line.search(/\t/),1,'YAML indentation should use spaces, not tabs.');base+=line.length+1;}
    let quote='', escaped=false, comment=false; const stack=[];
    for(let i=0;i<source.length;i++){const c=source[i],n=source[i+1]; if(comment){if(c==='\n')comment=false;continue;} if(quote){if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c===quote)quote='';continue;} if(c==='#'){comment=true;continue;} if(c==='"'||c==="'"){quote=c;continue;} if(c==='['||c==='{')stack.push({c,i}); else if(c===']'||c==='}'){const want=c===']'?'[':'{';if(stack.at(-1)?.c===want)stack.pop();}
    }
    // A trailing quote is ambiguous in YAML; report only open structural collection delimiters.
    for(const item of stack)push(item.i,1,`Unclosed YAML delimiter “${item.c}”.`);
  } else if(language==='xml') {
    const stack=[]; const re=/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[^>]*\?>|<![^>]*>|<\s*(\/?)\s*([A-Za-z][\w:.-]*)(?:\s[^<>]*?)?(\/?)\s*>/g; let m;
    while((m=re.exec(source))){const token=m[0];if(token.startsWith('<!--')||token.startsWith('<![CDATA[')||token.startsWith('<?')||token.startsWith('<!'))continue;const closing=!!m[1],name=m[2],self=!!m[3];if(closing){if(stack.at(-1)?.name===name)stack.pop();else push(m.index,token.length,`Unexpected closing tag </${name}>.`);}else if(!self)stack.push({name,offset:m.index,length:token.length});}
    for(const item of stack)push(item.offset,item.length,`Unclosed XML tag <${item.name}>.`);
  } else if(language==='markdown') {
    const stack=[]; let offset=0; for(const line of source.split('\n')){const m=/^\s*(`{3,}|~{3,})/.exec(line);if(m){const marker=m[1];if(stack.length&&stack.at(-1).char===marker[0]&&marker.length>=stack.at(-1).length)stack.pop();else stack.push({char:marker[0],length:marker.length,offset});}offset+=line.length+1;}for(const item of stack)push(item.offset,item.length,`Unclosed Markdown code fence (${item.char.repeat(item.length)}).`);
  }
  return out;
}

const HOVERS = {
 yaml:{name:'A mapping key introduces a key–value pair; indentation determines nesting.',true:'Boolean scalar representing true.',false:'Boolean scalar representing false.',null:'Null scalar; YAML also accepts ~ as null.'},
 xml:{html:'Root element for an HTML document.',head:'Container for document metadata and linked resources.',body:'Container for the visible document content.',div:'Generic block container.',a:'Hyperlink element; href identifies its destination.',img:'Embedded image element; src supplies its source and alt provides text.'},
 markdown:{heading:'A line beginning with # creates a heading; the number of # characters sets its level.',link:'A link uses [label](destination). Relative destinations can refer to project files.','```':'A matching pair of fenced markers encloses a code block.', '-':'A hyphen followed by a space starts an unordered-list item.'}
};

export function registerDocumentIntelligence(monaco,getProject) {
  if(!monaco?.languages||typeof getProject!=='function')throw new TypeError('Monaco and getProject are required.');
  const lang=monaco.languages, kinds=lang.CompletionItemKind||{}, ds=[];
  for(const id of ['yaml','xml','markdown']) {
    ds.push(lang.registerCompletionItemProvider(id,{triggerCharacters:id==='xml'?['<','/',' ','"','=']:id==='markdown'?['[','(','#','`','-',' ']:[':', '\n'],provideCompletionItems(model,pos){
      const text=modelText(model),{off,w,range}=commonPrefixRange(text,pos),project=getProject()||{}, suggestions=[];
      const add=(label,insertText=label,detail='',kind=kinds.Text??1,snippet=false)=>suggestions.push({label,insertText,detail,kind,range,...(snippet?{insertTextRules:lang.CompletionItemInsertTextRule?.InsertAsSnippet??4}:{})});
      if(id==='yaml'){for(const key of yamlKeys(project))add(key,`${key}: `,'Common or project YAML key',kinds.Property??9);for(const val of YAML_VALUES)add(val,val,'YAML scalar value',kinds.Value??12);}
      if(id==='xml'){
        const before=text.slice(0,off), attr=/<[\w:-]+\s+[^<>]*$/.test(before), tag=/<\/?[\w:-]*$/.test(before);
        if(attr){for(const a of XML_ATTRS)add(a,`${a}="$0"`,'Common XML attribute',kinds.Property??9,true);}
        else {for(const name of new Set([...XML_TAGS,...xmlProjectTags(project)])){const voidTag=['meta','link','img','input'].includes(name);add(name,`${name}>${voidTag?'':'$0'}`,voidTag?'XML void element':'XML element (closing tag suggested)',kinds.Struct??5,true);if(!voidTag)add(`${name} (auto-close)`,`${name}>$0</${name}>`,'XML element with closing tag',kinds.Snippet??27,true);}}
      }
      if(id==='markdown'){
        const matching=relativeFiles(text,off,project); if(matching){for(const f of matching)add(f,f,'Project file link',kinds.File??17);return {suggestions};}
        for(const [label,insert,detail] of MD_SNIPPETS)add(label,insert,detail,kinds.Snippet??27,true);
        for(const line of text.split('\n')){const m=/^(#{1,6})\s+(.+)$/.exec(line);if(m)add(m[2],`[${m[2]}](#${m[2].toLowerCase().replace(/[^\w -]/g,'').trim().replace(/\s+/g,'-')})`,'Heading in this document',kinds.Reference??17);}
      }
      const unique=new Map();for(const item of suggestions)if(!unique.has(item.label))unique.set(item.label,item);return {suggestions:[...unique.values()]};
    }}));
    ds.push(lang.registerHoverProvider(id,{provideHover(model,pos){const text=modelText(model),off=offsetAt(text,pos),w=wordAt(text,off),line=text.split('\n')[pos.lineNumber-1]||'';let detail=HOVERS[id]?.[w.word.toLowerCase()];if(id==='yaml'){const key=/^\s*([\w.-]+)\s*:/.exec(line)?.[1];if(key&&yamlKeys(getProject()||{}).includes(key))detail=`YAML mapping key “${key}”; its value follows the colon.`;}if(id==='xml'&&xmlProjectTags(getProject()||{}).includes(w.word)&&!detail)detail=`XML element <${w.word}> used in this project.`;if(id==='markdown'){if(/^\s*#{1,6}\s+/.test(line))detail=HOVERS.markdown.heading;else if(/^\s*[-*+]\s+/.test(line))detail=HOVERS.markdown['-'];else if(line.includes(']('))detail=HOVERS.markdown.link;else if(line.includes('```'))detail=HOVERS.markdown['```'];}if(!detail)return null;return {contents:[{value:detail}],range:w.word?rangeAt(pos,w,off):{startLineNumber:pos.lineNumber,endLineNumber:pos.lineNumber,startColumn:1,endColumn:line.length+1}};}}));
  }
  let disposed=false;return {dispose(){if(disposed)return;disposed=true;for(const d of ds)d?.dispose?.();}};
}
