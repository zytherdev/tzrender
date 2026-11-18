import { describe, expect, it, vi } from 'vitest';
import { registerRIntelligence } from '../site/editor/r-intelligence.js';

function setup(snapshot) {
  const providers = {};
  const monaco = { languages: {
    CompletionItemKind: { Function: 1, File: 2, Variable: 3, Keyword: 4, Snippet: 5, Module: 6 },
    CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    registerCompletionItemProvider: vi.fn((language, provider) => { providers.completion = provider; return { dispose: vi.fn() }; }),
    registerHoverProvider: vi.fn((language, provider) => { providers.hover = provider; return { dispose: vi.fn() }; }),
    registerSignatureHelpProvider: vi.fn((language, provider) => { providers.signature = provider; return { dispose: vi.fn() }; })
  } };
  const model = (value) => ({
    getValue: () => value,
    getOffsetAt: ({ lineNumber, column }) => value.split('\n').slice(0, lineNumber - 1).join('\n').length + (lineNumber > 1 ? 1 : 0) + column - 1,
    getLineContent: (lineNumber) => value.split('\n')[lineNumber - 1] || ''
  });
  return { monaco, providers, model, dispose: registerRIntelligence(monaco, () => snapshot) };
}

describe('R editor intelligence', () => {
  it('registers all Monaco providers and disposes them', () => {
    const { monaco, dispose } = setup({ activeFile: 'main.R', files: [] });
    expect(monaco.languages.registerCompletionItemProvider).toHaveBeenCalledWith('r', expect.any(Object));
    expect(monaco.languages.registerHoverProvider).toHaveBeenCalledWith('r', expect.any(Object));
    expect(monaco.languages.registerSignatureHelpProvider).toHaveBeenCalledWith('r', expect.any(Object));
    dispose();
    for (const [, provider] of [monaco.languages.registerCompletionItemProvider.mock.calls[0], monaco.languages.registerHoverProvider.mock.calls[0], monaco.languages.registerSignatureHelpProvider.mock.calls[0]]) expect(provider).toBeTruthy();
  });

  it('completes local functions, assignments and project-relative import paths', () => {
    const snapshot = { activeFile: 'src/main.R', files: [
      { name: 'src/main.R', content: 'helper <- function(x, scale = 1) { x * scale }\nanswer <- 42' },
      { name: 'src/helpers.R', content: '' }, { name: 'data/input.csv', content: 'x\n1' }
    ] };
    const { providers, model } = setup(snapshot);
    const code = 'helper <- function(x, scale = 1) { x * scale }\nanswer <- 42\nhel';
    const position = { lineNumber: 3, column: 4 };
    const suggestions = providers.completion.provideCompletionItems(model(code), position).suggestions;
    expect(suggestions.some((entry) => entry.label === 'helper' && entry.detail.includes('src/main.R'))).toBe(true);
    expect(suggestions.some((entry) => entry.label === 'answer')).toBe(true);
    const sourceModel = model('source("src/he');
    const files = providers.completion.provideCompletionItems(sourceModel, { lineNumber: 1, column: 14 }).suggestions;
    expect(files.map((entry) => entry.label)).toContain('src/helpers.R');
    const csvModel = model('read.csv("data/in');
    expect(providers.completion.provideCompletionItems(csvModel, { lineNumber: 1, column: 17 }).suggestions.map((entry) => entry.label)).toContain('data/input.csv');
  });

  it('provides brief hovers for common functions and locally defined symbols', () => {
    const { providers, model } = setup({ activeFile: 'main.R', files: [{ name: 'R/helpers.R', content: 'transform_data <- function(x) x\ncount <- 3' }] });
    const common = providers.hover.provideHover(model('mean(values)'), { lineNumber: 1, column: 2 });
    expect(common.contents[0].value).toContain('Compute the arithmetic mean');
    const local = providers.hover.provideHover(model('transform_data(data)'), { lineNumber: 1, column: 5 });
    expect(local.contents[0].value).toContain('R/helpers.R');
  });

  it('detects nested argument positions and local function signatures', () => {
    const { providers, model } = setup({ activeFile: 'main.R', files: [{ name: 'main.R', content: 'render <- function(data, title = "", ...) data' }] });
    const source = 'render(list(a = c(1, 2)), ';
    const result = providers.signature.provideSignatureHelp(model(source), { lineNumber: 1, column: source.length + 1 });
    expect(result.value.signatures[0].label).toBe('render(data, title = "", ...)');
    expect(result.value.activeParameter).toBe(1);
    const builtinSource = 'read.csv("data.csv", ';
    const builtin = providers.signature.provideSignatureHelp(model(builtinSource), { lineNumber: 1, column: builtinSource.length + 1 });
    expect(builtin.value.signatures[0].label).toContain('read.csv(file, header = TRUE');
    expect(builtin.value.activeParameter).toBe(1);
  });
});
