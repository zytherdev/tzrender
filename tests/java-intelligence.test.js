import { describe, expect, it, vi } from 'vitest';
import { analyzeJava, registerJavaIntelligence } from '../site/editor/java-intelligence.js';

function setup(project) {
  const providers={};
  const monaco={languages:{CompletionItemKind:{Keyword:17,Function:1,Method:0,Class:5,Variable:5,Module:9,File:18,Snippet:27},CompletionItemInsertTextRule:{InsertAsSnippet:4},registerCompletionItemProvider:vi.fn((l,p)=>{providers.completion=p;return{dispose:vi.fn()};}),registerHoverProvider:vi.fn((l,p)=>{providers.hover=p;return{dispose:vi.fn()};}),registerSignatureHelpProvider:vi.fn((l,p)=>{providers.signature=p;return{dispose:vi.fn()};})}};
  const model=text=>({getValue:()=>text,getLineContent:n=>text.split('\n')[n-1]||'',getWordUntilPosition:pos=>{const line=text.split('\n')[pos.lineNumber-1]||'',before=line.slice(0,pos.column-1),m=before.match(/[\w$]+$/),word=m?.[0]||'';return{word,startColumn:pos.column-word.length,endColumn:pos.column};},getWordAtPosition:pos=>{const line=text.split('\n')[pos.lineNumber-1]||'',i=pos.column-1,m=[...line.matchAll(/[A-Za-z_$][\w$]*/g)].find(x=>i>=x.index&&i<=x.index+x[0].length);return m?{word:m[0],startColumn:m.index+1,endColumn:m.index+m[0].length+1}:null;}});
  return {providers,model,monaco,registration:registerJavaIntelligence(monaco,()=>project)};
}
const project={activeFile:'src/Main.java',files:[{name:'src/Main.java',content:'class Main { static int sum(int a, int b) { return a+b; } }'},{name:'src/Helper.java',content:'package src; public class Helper {}'}]};
const pos=text=>({lineNumber:text.split('\n').length,column:text.split('\n').at(-1).length+1});

describe('Java Monaco intelligence',()=>{
  it('registers Java providers and disposes each once',()=>{const {registration,monaco}=setup(project);expect(monaco.languages.registerCompletionItemProvider).toHaveBeenCalledWith('java',expect.any(Object));const handles=[...monaco.languages.registerCompletionItemProvider.mock.results,...monaco.languages.registerHoverProvider.mock.results,...monaco.languages.registerSignatureHelpProvider.mock.results].map(r=>r.value);registration.dispose();registration.dispose();for(const h of handles)expect(h.dispose).toHaveBeenCalledTimes(1);});
  it('completes local declarations and project paths in imports',()=>{const {providers,model}=setup(project);const all=providers.completion.provideCompletionItems(model(''),{lineNumber:1,column:1}).suggestions;expect(all.map(x=>x.label)).toContain('sum');expect(all.map(x=>x.label)).toContain('System.out.println');const imports=providers.completion.provideCompletionItems(model('import src.He'),pos('import src.He')).suggestions;expect(imports.map(x=>x.label)).toContain('src/Helper');});
  it('provides hover documentation for APIs and local symbols',()=>{const {providers,model}=setup(project);expect(providers.hover.provideHover(model('System.out.println'),{lineNumber:1,column:15}).contents[0].value).toContain('Prints a value');expect(providers.hover.provideHover(model('sum'),{lineNumber:1,column:2}).contents[0].value).toContain('src/Main.java');});
  it('reports argument index while ignoring nested commas',()=>{const {providers,model}=setup(project);const text='sum(Math.max(1, 2), new int[] {3, 4}, ';const result=providers.signature.provideSignatureHelp(model(text),pos(text));expect(result.value.signatures[0].label).toContain('sum(int a, int b)');expect(result.value.activeParameter).toBe(1);});
  it('diagnoses only unmatched delimiters outside comments and literals',()=>{expect(analyzeJava('class A { String s = "}"; /* { */ void f() {')).toHaveLength(2);expect(analyzeJava('class A { // }\n String s="("; }')).toEqual([]);});
});
