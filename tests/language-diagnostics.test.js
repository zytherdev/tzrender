import { describe, expect, it, vi } from 'vitest';
import { findLanguageDiagnostics, updateLanguageDiagnostics } from '../site/editor/language-diagnostics.js';

describe('language diagnostics', () => {
  it.each([
    ['ruby', 'items.each { |item| puts(item) }'],
    ['r', 'result <- list(a = c(1, 2), b = "ok")'],
    ['perl', 'my $x = { a => [1, 2] }; print($x->{a}[0]);'],
  ])('accepts balanced %s source', (language, source) => {
    expect(findLanguageDiagnostics(language, source)).toEqual([]);
  });

  it.each([
    ['ruby', 'puts "( [ { text } ] )" # ) } ]\ncall(1)'],
    ['r', 'x <- "( [ { text } ] )" # ) } ]\ny <- f(1)'],
    ['perl', 'my $x = q{( [ { text } ])}; # ) } ]\nprint($x[0]);'],
    ['perl', 'my $ok = m{[(){}]}; $s = s{a(b)}{c[d]};'],
  ])('ignores comments, strings and Perl quote operators in %s', (language, source) => {
    expect(findLanguageDiagnostics(language, source)).toEqual([]);
  });

  it.each([
    ['ruby', 'call(1))'],
    ['r', 'f(1))'],
    ['perl', 'print($x))'],
  ])('reports a surplus close delimiter in %s at exact position', (language, source) => {
    const [marker] = findLanguageDiagnostics(language, source);
    expect(marker).toMatchObject({
      message: expect.stringContaining('sem abertura'),
      startLineNumber: 1,
      startColumn: source.lastIndexOf(')') + 1,
      endLineNumber: 1,
      endColumn: source.lastIndexOf(')') + 2,
      source: 'tzrender',
    });
  });

  it.each([
    ['ruby', 'def method('],
    ['r', 'x <- list(a = (1 + 2)'],
    ['perl', 'my $x = [1, 2'],
  ])('reports an unclosed delimiter in %s', (language, source) => {
    expect(findLanguageDiagnostics(language, source)).toHaveLength(1);
  });

  it('does not diagnose unsupported IDs and caps diagnostics', () => {
    expect(findLanguageDiagnostics('javascript', 'f(')).toEqual([]);
    expect(findLanguageDiagnostics('r', ')'.repeat(80))).toHaveLength(20);
  });

  it('sets and clears only its own markers with Monaco-compatible data', () => {
    const supported = { getLanguageId: () => 'ruby', getValue: () => 'f(' };
    const unsupported = { getLanguageId: () => 'javascript', getValue: () => ')' };
    const markerCall = vi.fn();
    const monaco = { MarkerSeverity: { Error: 8 }, editor: { setModelMarkers: markerCall } };
    updateLanguageDiagnostics(monaco, new Map([['a.rb', supported], ['a.js', unsupported]]));
    expect(markerCall).toHaveBeenCalledTimes(2);
    expect(markerCall.mock.calls[0][0]).toBe(supported);
    expect(markerCall.mock.calls[0][1]).toBe('tzrender-language-diagnostics');
    expect(markerCall.mock.calls[0][2][0]).toMatchObject({
      severity: 8, source: 'tzrender', startLineNumber: 1, startColumn: 2,
    });
    expect(markerCall.mock.calls[1]).toEqual([unsupported, 'tzrender-language-diagnostics', []]);

    markerCall.mockClear();
    updateLanguageDiagnostics(monaco, new Map([['a.rb', { ...supported, getValue: () => 'f()' }]]));
    expect(markerCall.mock.calls[0][2]).toEqual([]);
  });
});
