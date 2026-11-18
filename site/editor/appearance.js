const THEME_KEY = 'tzrender-editor-theme';
const FONT_SIZE_KEY = 'tzrender-editor-font-size';
const INTERFACE_SIZE_KEY = 'tzrender-editor-interface-size';

const THEMES = {
  'tzrender-night': 'dark',
  vs: 'light',
  'hc-black': 'contrast'
};
const DEFAULT_THEME = 'tzrender-night';
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_INTERFACE_SIZE = 'normal';

function readPreference(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePreference(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage can be unavailable or full; appearance still works for this session.
  }
}

function validTheme(value) {
  return Object.hasOwn(THEMES, value) ? value : DEFAULT_THEME;
}

function validFontSize(value, control) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 12 || number > 32) return DEFAULT_FONT_SIZE;
  // A saved value that is no longer offered must not leave a select blank.
  if (control?.options && !Array.from(control.options).some((option) => Number(option.value) === number)) {
    return DEFAULT_FONT_SIZE;
  }
  return number;
}

function validInterfaceSize(value) {
  return value === 'large' ? 'large' : DEFAULT_INTERFACE_SIZE;
}

/**
 * Apply and bind editor appearance controls after Monaco has been created and
 * the application's tzrender-night theme has been registered. Returns a
 * cleanup function for callers that replace or dispose of the editor.
 */
export function setupEditorAppearance(editor, monaco) {
  const themeControl = document.getElementById('editorTheme');
  const fontControl = document.getElementById('fontSize');
  const interfaceControl = document.getElementById('interfaceSize');
  const root = document.documentElement;

  function applyTheme(value, persist = false) {
    const theme = validTheme(value);
    if (themeControl) themeControl.value = theme;
    root.dataset.theme = THEMES[theme];
    monaco.editor.setTheme(theme);
    if (persist) writePreference(THEME_KEY, theme);
  }

  function applyFontSize(value, persist = false) {
    const size = validFontSize(value, fontControl);
    if (fontControl) fontControl.value = String(size);
    // The editor is created with a fixed line height; update it along with the
    // font to avoid clipping at larger sizes.
    editor.updateOptions({ fontSize: size, lineHeight: Math.round(size * 1.5) });
    if (persist) writePreference(FONT_SIZE_KEY, size);
  }

  function applyInterfaceSize(value, persist = false) {
    const size = validInterfaceSize(value);
    if (interfaceControl) interfaceControl.value = size;
    root.dataset.interfaceSize = size;
    if (persist) writePreference(INTERFACE_SIZE_KEY, size);
    editor.layout?.();
  }

  const onThemeChange = () => applyTheme(themeControl.value, true);
  const onFontChange = () => applyFontSize(fontControl.value, true);
  const onInterfaceChange = () => applyInterfaceSize(interfaceControl.value, true);

  applyTheme(readPreference(THEME_KEY));
  applyFontSize(readPreference(FONT_SIZE_KEY));
  applyInterfaceSize(readPreference(INTERFACE_SIZE_KEY));

  themeControl?.addEventListener('change', onThemeChange);
  fontControl?.addEventListener('change', onFontChange);
  interfaceControl?.addEventListener('change', onInterfaceChange);

  return () => {
    themeControl?.removeEventListener('change', onThemeChange);
    fontControl?.removeEventListener('change', onFontChange);
    interfaceControl?.removeEventListener('change', onInterfaceChange);
  };
}
