import { describe, expect, it, vi } from 'vitest';
import { registerRubyIntelligence } from '../site/editor/ruby-intelligence.js';

function setup(project) {
  const providers = {};
  const monaco = { languages: {
    CompletionItemKind: { Keyword: 17, Function: 1, Method: 0, Class: 5, Module: 8, Constant: 17, Snippet: 27, File: 18 },
    CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    registerCompletionItemProvider: vi.fn((language, provider) => { providers.completion = provider; return { dispose: vi.fn() }; }),
    registerHoverProvider: vi.fn((language, provider) => { providers.hover = provider; return { dispose: vi.fn() }; }),
    registerSignatureHelpProvider: vi.fn((language, provider) => { providers.signature = provider; return { dispose: vi.fn() }; })
  } };
  const model = (text, file = 'main.rb') => ({
    getValue: () => text,
    getLineContent: (line) => text.split('\n')[line - 1] || '',
    getWordUntilPosition: (position) => {
      const line = text.split('\n')[position.lineNumber - 1] || '';
      const before = line.slice(0, position.column - 1);
      const match = before.match(/[\w!?=]+$/);
      const word = match?.[0] || '';
      return { word, startColumn: position.column - word.length, endColumn: position.column };
    },
    getWordAtPosition: (position) => {
      const line = text.split('\n')[position.lineNumber - 1] || '';
      const index = position.column - 1;
      const match = [...line.matchAll(/[A-Za-z_][\w!?=]*/g)].find((item) => index >= item.index && index <= item.index + item[0].length);
      return match ? { word: match[0], startColumn: match.index + 1, endColumn: match.index + match[0].length + 1 } : null;
    },
    uri: { path: file }
  });
  return { providers, model, registration: registerRubyIntelligence(monaco, () => project), monaco };
}

const project = {
  activeFile: 'src/main.rb',
  files: [
    { name: 'src/main.rb', content: 'def greet(name, options = {})\nend\nclass Person\nend\nmodule Tools\nend\nANSWER = 42' },
    { name: 'src/lib/greetings.rb', content: 'module Greetings; end' },
    { name: 'lib/other.rb', content: '' }
  ]
};
const pos = (text) => ({ lineNumber: text.split('\n').length, column: text.split('\n').at(-1).length + 1 });

describe('Ruby Monaco intelligence', () => {
  it('offers Ruby keywords, project symbols and snippets', () => {
    const { providers, model } = setup(project);
    const result = providers.completion.provideCompletionItems(model('cla'), pos('cla'));
    const items = result.suggestions;
    expect(items.map((item) => item.label)).toEqual(expect.arrayContaining(['class', 'greet', 'Person', 'Tools', 'ANSWER', 'def']));
    expect(items.find((item) => item.label === 'def (method snippet)')).toMatchObject({ insertTextRules: 4, kind: 27 });
  });

  it('completes require_relative paths against the current file directory', () => {
    const { providers, model } = setup(project);
    const text = 'require_relative "lib/';
    const result = providers.completion.provideCompletionItems(model(text), pos(text));
    expect(result.suggestions.map((item) => item.label)).toContain('lib/greetings');
  });

  it('provides concise documentation for APIs and local symbols', () => {
    const { providers, model } = setup(project);
    const api = providers.hover.provideHover(model('puts'), { lineNumber: 1, column: 2 });
    expect(api.contents.map((item) => item.value).join(' ')).toContain('standard output');
    const local = providers.hover.provideHover(model('greet'), { lineNumber: 1, column: 2 });
    expect(local.contents.map((item) => item.value).join(' ')).toContain('src/main.rb');
  });

  it('resolves API and project signatures and nested argument commas at the cursor', () => {
    const { providers, model } = setup(project);
    const source = 'greet(build(1, 2), { key: [3, 4] }, ';
    const local = providers.signature.provideSignatureHelp(model(source), pos(source));
    expect(local.value.signatures[0].label).toBe('def greet(name, options = {})');
    expect(local.value.activeParameter).toBe(1);
    const apiSource = 'puts("a,b", nested(1, 2), ';
    const api = providers.signature.provideSignatureHelp(model(apiSource), pos(apiSource));
    expect(api.value.signatures[0].label).toBe('puts(*objects) → nil');
  });

  it('disposes each registered provider exactly once', () => {
    const { registration, monaco } = setup(project);
    const handles = monaco.languages.registerCompletionItemProvider.mock.results.map((result) => result.value);
    registration.dispose();
    registration.dispose();
    for (const handle of handles) expect(handle.dispose).toHaveBeenCalledTimes(1);
  });
});
