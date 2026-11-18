import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupEditorAppearance } from '../site/editor/appearance.js';

describe('editor appearance', () => {
  let editor, monaco;
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = 'dark';
    document.body.innerHTML = `<select id="editorTheme"><option value="tzrender-night">Dark</option><option value="vs">Light</option><option value="hc-black">High contrast</option></select>
      <select id="fontSize"><option>12</option><option>14</option><option>16</option><option>18</option><option>20</option><option>22</option><option>24</option></select>
      <select id="interfaceSize"><option value="normal">Default</option><option value="large">Large</option></select>`;
    editor = { updateOptions: vi.fn(), layout: vi.fn() };
    monaco = { editor: { setTheme: vi.fn() } };
  });
  it('defaults to dark and readable code text', () => {
    setupEditorAppearance(editor, monaco);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(monaco.editor.setTheme).toHaveBeenCalledWith('tzrender-night');
    expect(editor.updateOptions).toHaveBeenCalledWith({ fontSize: 16, lineHeight: 24 });
  });
  it('persists and restores the entire interface theme and font preferences', () => {
    const dispose = setupEditorAppearance(editor, monaco);
    const theme = document.getElementById('editorTheme');
    const font = document.getElementById('fontSize');
    const size = document.getElementById('interfaceSize');
    theme.value = 'vs'; theme.dispatchEvent(new Event('change'));
    font.value = '20'; font.dispatchEvent(new Event('change'));
    size.value = 'large'; size.dispatchEvent(new Event('change'));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.interfaceSize).toBe('large');
    expect(localStorage.getItem('tzrender-editor-font-size')).toBe('20');
    dispose();
    document.documentElement.dataset.theme = 'dark';
    setupEditorAppearance(editor, monaco);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(font.value).toBe('20');
    expect(size.value).toBe('large');
  });
  it('falls back safely for invalid preferences and supports high contrast', () => {
    localStorage.setItem('tzrender-editor-theme', 'invalid');
    localStorage.setItem('tzrender-editor-font-size', '999');
    setupEditorAppearance(editor, monaco);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(editor.updateOptions).toHaveBeenCalledWith({ fontSize: 16, lineHeight: 24 });
    const theme = document.getElementById('editorTheme');
    theme.value = 'hc-black'; theme.dispatchEvent(new Event('change'));
    expect(document.documentElement.dataset.theme).toBe('contrast');
    expect(monaco.editor.setTheme).toHaveBeenLastCalledWith('hc-black');
  });
});
