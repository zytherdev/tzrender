import { describe, it, expect } from 'vitest';
import { registerPerlIntelligence } from '../site/editor/perl-intelligence.js';

function setup() {
  const providers = { completion: [], hover: [], signature: [] }, disposed = [];
  const register = (key) => (_language, provider) => { providers[key].push(provider); return { dispose() { disposed.push(key); } }; };
  const monaco = { languages: {
    CompletionItemKind: { Text: 1, Function: 2, Variable: 5, Module: 9, Keyword: 17, Snippet: 27 },
    CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    registerCompletionItemProvider: register('completion'), registerHoverProvider: register('hover'), registerSignatureHelpProvider: register('signature')
  } };
  return { monaco, providers, disposed };
}
const model = (value) => ({ getValue: () => value });
const pos = (text, needle, occurrence = 0) => { let at = -1; while (occurrence-- >= 0) at = text.indexOf(needle, at + 1); const before = text.slice(0, at); const lines = before.split('\n'); return { lineNumber: lines.length, column: lines.at(-1).length + 1 }; };

describe('Perl intelligence', () => {
  it('registers completion, hover and signature providers and disposes them', () => {
    const { monaco, providers, disposed } = setup();
    const registration = registerPerlIntelligence(monaco, () => ({ activeFile: 'main.pl', files: [] }));
    expect(providers.completion).toHaveLength(1); expect(providers.hover).toHaveLength(1); expect(providers.signature).toHaveLength(1);
    registration.dispose(); expect(disposed).toHaveLength(3);
  });
  it('offers local symbols and project modules/files in import context', () => {
    const { monaco, providers } = setup();
    const project = { activeFile: 'main.pl', files: [{ name: 'main.pl', content: 'package Main;\nsub greet { }\nmy $count;' }, { name: 'lib/Util.pm', content: 'package Util;' }, { name: 'data/input.txt', content: '' }] };
    registerPerlIntelligence(monaco, () => project);
    let text = 'use U';
    let suggestions = providers.completion[0].provideCompletionItems(model(text), pos(text, 'U')).suggestions;
    expect(suggestions.map(x => x.label)).toContain('lib::Util'); expect(suggestions.map(x => x.label)).toContain('lib/Util.pm');
    text = 'greet'; suggestions = providers.completion[0].provideCompletionItems(model(text), pos(text, 'greet')).suggestions;
    expect(suggestions.map(x => x.label)).toContain('greet'); expect(suggestions.map(x => x.label)).toContain('$count'); expect(suggestions.map(x => x.label)).toContain('sub');
  });
  it('provides hover for built-ins and local symbols', () => {
    const { monaco, providers } = setup();
    registerPerlIntelligence(monaco, () => ({ files: [{ name: 'main.pl', content: 'sub greet ($name) { }' }] }));
    expect(providers.hover[0].provideHover(model('print "hi"'), { lineNumber: 1, column: 2 }).contents[0].value).toContain('Perl built-in');
    expect(providers.hover[0].provideHover(model('greet()'), { lineNumber: 1, column: 3 }).contents[0].value).toContain('sub greet');
  });
  it('returns signature help with correct nested argument index for local and built-in calls', () => {
    const { monaco, providers } = setup();
    registerPerlIntelligence(monaco, () => ({ files: [{ name: 'main.pl', content: 'sub combine ($a, $b, $c) { }' }] }));
    let text = 'combine(1, nested(2, 3), ';
    let result = providers.signature[0].provideSignatureHelp(model(text), { lineNumber: 1, column: text.length + 1 });
    expect(result.value.signatures[0].label).toContain('$a, $b, $c'); expect(result.value.activeParameter).toBe(2);
    text = 'push(@items, 4'; result = providers.signature[0].provideSignatureHelp(model(text), { lineNumber: 1, column: text.length + 1 });
    expect(result.value.signatures[0].label).toBe('push(ARRAY, LIST)'); expect(result.value.activeParameter).toBe(1);
  });
});
