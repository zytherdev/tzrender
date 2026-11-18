import { describe, expect, it, vi } from 'vitest';
import { analyzeLua, registerLuaIntelligence } from '../site/editor/lua-intelligence.js';

function setup(project) {
  const providers = {}; const handles=[];
  const reg=(key)=>(language,provider)=>{providers[key]=provider;providers.language=language;const handle={dispose:vi.fn()};handles.push(handle);return handle;};
  const monaco={languages:{CompletionItemKind:{Function:1,Keyword:2,File:17,Snippet:27,Variable:5},CompletionItemInsertTextRule:{InsertAsSnippet:4},registerCompletionItemProvider:reg('completion'),registerHoverProvider:reg('hover'),registerSignatureHelpProvider:reg('signature')}};
  const model=(text)=>({getValue:()=>text,getLineContent:n=>text.split('\n')[n-1]||'',getOffsetAt:p=>text.split('\n').slice(0,p.lineNumber-1).reduce((a,l)=>a+l.length+1,0)+p.column-1,getWordUntilPosition:p=>{const l=text.split('\n')[p.lineNumber-1]||'',left=l.slice(0,p.column-1),m=left.match(/[\w.]*$/),word=m?.[0]||'';return {word,startColumn:p.column-word.length,endColumn:p.column};},getWordAtPosition:p=>{const l=text.split('\n')[p.lineNumber-1]||'',i=p.column-1;let a=i,b=i;while(a>0&&/[\w.]/.test(l[a-1]))a--;while(b<l.length&&/[\w.]/.test(l[b]))b++;return a===b?null:{word:l.slice(a,b),startColumn:a+1,endColumn:b+1};}});
  return {providers,handles,model,register:()=>registerLuaIntelligence(monaco,()=>project)};
}
const project={activeFile:'main.lua',files:[{name:'main.lua',content:'local function localFn(a, b)\n return a+b\nend\nlocal count = 1'},{name:'lib/tools.lua',content:'return {}'}]};

describe('Lua local intelligence',()=>{
 it('registers only Lua providers and disposes idempotently',()=>{const s=setup(project),d=s.register();expect(s.providers.language).toBe('lua');expect(Object.keys(s.providers)).toEqual(expect.arrayContaining(['completion','hover','signature']));d.dispose();d.dispose();expect(s.handles).toHaveLength(3);for(const h of s.handles)expect(h.dispose).toHaveBeenCalledTimes(1);});
 it('offers symbols and contextually completes project modules',()=>{const s=setup(project);s.register();const regular=s.providers.completion.provideCompletionItems(s.model('loc'),{lineNumber:1,column:4}).suggestions;expect(regular.some(x=>x.label==='localFn')).toBe(true);expect(regular.some(x=>x.label==='print')).toBe(true);const imported=s.providers.completion.provideCompletionItems(s.model("require('lib/"),{lineNumber:1,column:14}).suggestions;expect(imported.map(x=>x.label)).toContain('lib/tools.lua');});
 it('provides hover for built-ins and local symbols',()=>{const s=setup(project);s.register();expect(s.providers.hover.provideHover(s.model('print(1)'),{lineNumber:1,column:2}).contents[0].value).toContain('Lua built-in');expect(s.providers.hover.provideHover(s.model('localFn()'),{lineNumber:1,column:3}).contents[0].value).toContain('Project function');});
 it('counts only top-level arguments for signature help',()=>{const s=setup(project);s.register();const text='localFn(1, math.max(2, 3), ';const result=s.providers.signature.provideSignatureHelp(s.model(text),{lineNumber:1,column:text.length+1});expect(result.value.signatures[0].label).toBe('localFn(a, b)');expect(result.value.activeParameter).toBe(1);});
 it('diagnoses malformed delimiters but ignores strings and comments',()=>{expect(analyzeLua('local x = (1\n-- )')).toEqual([expect.objectContaining({message:'Unclosed delimiter (',lineNumber:1})]);expect(analyzeLua("local s = 'unterminated")).toEqual([expect.objectContaining({message:'Unterminated string'})]);expect(analyzeLua('local s = "(]" -- {\nprint(s)')).toEqual([]);});
});
