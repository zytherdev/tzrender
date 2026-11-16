const $ = (id) => document.getElementById(id);
const cards = [...document.querySelectorAll('[data-tool-card]')];
const filters = [...document.querySelectorAll('[data-filter]')];
const root = document.documentElement;
let selectedCategory = 'all';

function setTheme(theme) {
  const value = theme === 'light' ? 'light' : 'dark';
  root.dataset.theme = value;
  try { localStorage.setItem('tzrender-theme', value); } catch { /* Storage can be unavailable in private browsing. */ }
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => button.setAttribute('aria-label', value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'));
}
try { setTheme(localStorage.getItem('tzrender-theme') || 'dark'); } catch { setTheme('dark'); }
document.querySelectorAll('[data-theme-toggle]').forEach((button) => button.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark')));

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function updateStarter() {
  const title = $('starterTitle').value.trim() || 'My first website';
  const description = $('starterDescription').value.trim() || 'A simple website built with HTML, CSS, and JavaScript.';
  $('starterPreviewTitle').textContent = title;
  $('starterOutput').textContent = `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <meta name="description" content="${escapeHtml(description)}">\n  <title>${escapeHtml(title)}</title>\n  <style>\n    * { box-sizing: border-box; }\n    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 2rem; font-family: system-ui, sans-serif; color: #211d31; background: #f6f4fb; }\n    main { width: min(100%, 42rem); padding: 2.5rem; border: 1px solid #ded8ee; border-radius: 1.25rem; background: white; box-shadow: 0 1rem 3rem #24194a18; }\n    h1 { margin-top: 0; }\n    a { color: #6546db; }\n  </style>\n</head>\n<body>\n  <main>\n    <p>YOUR FIRST BUILD</p>\n    <h1>${escapeHtml(title)}</h1>\n    <p>${escapeHtml(description)}</p>\n    <a href="#learn-more">Keep building →</a>\n  </main>\n</body>\n</html>`;
}

function updateGradient() {
  const angle = Number($('gradientAngle').value);
  const css = `linear-gradient(${angle}deg, ${$('gradientStart').value}, ${$('gradientEnd').value})`;
  $('gradientAngleValue').value = `${angle}°`;
  $('gradientPreview').style.background = css;
  $('gradientOutput').textContent = `background: ${css};`;
}

function linearChannel(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const raw = hex.replace('#', '');
  const values = [0, 2, 4].map((index) => parseInt(raw.slice(index, index + 2), 16) / 255).map(linearChannel);
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}
function updateContrast() {
  const foreground = $('contrastForeground').value;
  const background = $('contrastBackground').value;
  $('contrastPreview').style.color = foreground;
  $('contrastPreview').style.background = background;
  const a = luminance(foreground);
  const b = luminance(background);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  $('contrastRatio').textContent = `${ratio.toFixed(2)}:1`;
  const grade = $('contrastGrade');
  grade.classList.toggle('fail', ratio < 3);
  grade.textContent = ratio >= 7 ? 'AAA · Pass' : ratio >= 4.5 ? 'AA · Pass' : ratio >= 3 ? 'Large text only' : 'Needs more contrast';
}

function updateFlex() {
  const direction = $('flexDirection').value;
  const justify = $('flexJustify').value;
  const align = $('flexAlign').value;
  const gap = Number($('flexGap').value);
  const wrap = $('flexWrap').checked ? 'wrap' : 'nowrap';
  const preview = $('flexPreview');
  Object.assign(preview.style, { flexDirection: direction, justifyContent: justify, alignItems: align, gap: `${gap}px`, flexWrap: wrap });
  $('flexGapValue').value = `${gap}px`;
  $('flexOutput').textContent = `display: flex;\nflex-direction: ${direction};\njustify-content: ${justify};\nalign-items: ${align};\nflex-wrap: ${wrap};\ngap: ${gap}px;`;
}

function updateGrid() {
  const columnChoice = $('gridColumns').value;
  const min = $('gridMin').value;
  const gap = Number($('gridGap').value);
  const preview = $('gridPreview');
  const template = columnChoice === 'auto' ? `repeat(auto-fit, minmax(min(100%, ${min}), 1fr))` : `repeat(${Number(columnChoice)}, minmax(0, 1fr))`;
  preview.style.gridTemplateColumns = template;
  preview.style.gap = `${gap}px`;
  const itemCount = columnChoice === 'auto' ? 6 : Math.min(12, Number(columnChoice) * 2);
  preview.replaceChildren(...Array.from({ length: itemCount }, (_, index) => {
    const cell = document.createElement('span');
    cell.textContent = String(index + 1).padStart(2, '0');
    return cell;
  }));
  $('gridGapValue').value = `${gap}px`;
  $('gridOutput').textContent = `display: grid;\ngrid-template-columns: ${template};\ngap: ${gap}px;`;
}

function hexToRgb(hex) {
  const raw = hex.slice(1);
  return [0, 2, 4].map((index) => parseInt(raw.slice(index, index + 2), 16));
}
function updateShadow() {
  const x = Number($('shadowX').value);
  const y = Number($('shadowY').value);
  const blur = Number($('shadowBlur').value);
  const spread = Number($('shadowSpread').value);
  const opacity = Number($('shadowOpacity').value) / 100;
  const [r, g, b] = hexToRgb($('shadowColor').value);
  const shadow = `${x}px ${y}px ${blur}px ${spread}px rgba(${r}, ${g}, ${b}, ${opacity.toFixed(2)})`;
  [['shadowXValue', x], ['shadowYValue', y], ['shadowBlurValue', blur], ['shadowSpreadValue', spread]].forEach(([id, value]) => { $(id).value = `${value}px`; });
  $('shadowOpacityValue').value = `${Math.round(opacity * 100)}%`;
  $('shadowSample').style.boxShadow = shadow;
  $('shadowOutput').textContent = `box-shadow: ${shadow};`;
}

function updateBoxModel() {
  const width = Number($('boxWidth').value);
  const height = Number($('boxHeight').value);
  const padding = Number($('boxPaddingRange').value);
  const border = Number($('boxBorderRange').value);
  const margin = Number($('boxMarginRange').value);
  $('boxContent').style.width = `${width}px`;
  $('boxContent').style.height = `${height}px`;
  $('boxPadding').style.padding = `${padding}px`;
  $('boxBorder').style.borderWidth = `${border}px`;
  $('boxMargin').style.padding = '22px 16px 12px';
  $('boxBorder').style.margin = `${margin}px`;
  $('boxDimensions').textContent = `${width} × ${height}`;
  $('boxWidthValue').value = `${width}px`;
  $('boxHeightValue').value = `${height}px`;
  $('boxPaddingValue').value = `${padding}px`;
  $('boxBorderValue').value = `${border}px`;
  $('boxMarginValue').value = `${margin}px`;
  $('boxModelOutput').textContent = `/* Content-box sizing */\n.content {\n  box-sizing: content-box;\n  width: ${width}px;\n  height: ${height}px;\n  padding: ${padding}px;\n  border: ${border}px solid #8b72ff;\n  margin: ${margin}px;\n}\n\n/* Border-box width = ${width + padding * 2 + border * 2}px, excluding the outer margin */`;
}

function updateSpacing() {
  const base = Number($('spacingBase').value);
  const ratio = Number($('spacingRatio').value);
  const steps = Number($('spacingSteps').value);
  const values = Array.from({ length: steps }, (_, index) => Math.round(base * ratio ** index));
  const preview = $('spacingPreview');
  preview.replaceChildren(...values.map((value, index) => {
    const row = document.createElement('div');
    row.className = 'spacing-row';
    const name = document.createElement('span');
    name.textContent = `space-${index + 1}`;
    const bar = document.createElement('i');
    bar.className = 'spacing-bar';
    bar.style.width = `${Math.min(value, 240)}px`;
    const size = document.createElement('output');
    size.textContent = `${value}px`;
    row.append(name, bar, size);
    return row;
  }));
  $('spacingOutput').textContent = `:root {\n${values.map((value, index) => `  --space-${index + 1}: ${value}px;`).join('\n')}\n}`;
}

const updates = {
  starter: updateStarter,
  gradient: updateGradient,
  contrast: updateContrast,
  flex: updateFlex,
  grid: updateGrid,
  shadow: updateShadow,
  box: updateBoxModel,
  spacing: updateSpacing
};
const controls = {
  starter: ['starterTitle', 'starterDescription'],
  gradient: ['gradientStart', 'gradientEnd', 'gradientAngle'],
  contrast: ['contrastForeground', 'contrastBackground'],
  flex: ['flexDirection', 'flexJustify', 'flexAlign', 'flexGap', 'flexWrap'],
  grid: ['gridColumns', 'gridMin', 'gridGap'],
  shadow: ['shadowX', 'shadowY', 'shadowBlur', 'shadowSpread', 'shadowColor', 'shadowOpacity'],
  box: ['boxWidth', 'boxHeight', 'boxPaddingRange', 'boxBorderRange', 'boxMarginRange'],
  spacing: ['spacingBase', 'spacingRatio', 'spacingSteps']
};
const defaults = {
  starter: ['My first website', 'A simple website built with HTML, CSS, and JavaScript.'],
  gradient: ['#8b72ff', '#54d6b4', '135'],
  contrast: ['#1d1833', '#ffffff'],
  flex: ['row', 'space-around', 'center', '12', false],
  grid: ['3', '200px', '16'],
  shadow: ['0', '16', '32', '0', '#31265a', '18'],
  box: ['240', '100', '24', '4', '16'],
  spacing: ['6', '1.25', '7']
};

function resetTool(name) {
  const values = controls[name];
  if (!values) return;
  values.forEach((id, index) => {
    const element = $(id);
    if (element.type === 'checkbox') element.checked = defaults[name][index];
    else element.value = defaults[name][index];
  });
  updates[name]();
}

function announceCopy(button, message) {
  const original = button.dataset.originalText || button.textContent;
  button.dataset.originalText = original;
  button.textContent = message;
  button.setAttribute('aria-label', `${message} to clipboard`);
  window.setTimeout(() => {
    button.textContent = original;
    button.setAttribute('aria-label', original);
  }, 1400);
}

async function copyOutput(button) {
  const source = $(button.dataset.copy);
  if (!source) return;
  try {
    await navigator.clipboard.writeText(source.textContent);
    announceCopy(button, 'Copied');
  } catch {
    const temporary = document.createElement('textarea');
    temporary.value = source.textContent;
    temporary.setAttribute('readonly', '');
    temporary.style.position = 'fixed';
    temporary.style.opacity = '0';
    document.body.append(temporary);
    temporary.select();
    const copied = document.execCommand('copy');
    temporary.remove();
    announceCopy(button, copied ? 'Copied' : 'Select code');
  }
}

document.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', () => copyOutput(button)));
Object.entries(controls).forEach(([name, ids]) => {
  ids.forEach((id) => {
    const control = $(id);
    const eventName = control.type === 'range' || control.type === 'color' || control.type === 'checkbox' ? 'input' : 'change';
    control.addEventListener(eventName, updates[name]);
  });
});
Object.keys(updates).forEach((name) => {
  resetTool(name);
  const card = cards.find((item) => item.querySelector(`.code-output code#${({starter:'starterOutput',gradient:'gradientOutput',flex:'flexOutput',grid:'gridOutput',shadow:'shadowOutput',box:'boxModelOutput',spacing:'spacingOutput'})[name] || '___'}`)) || (name === 'contrast' ? document.querySelector('#contrastPreview')?.closest('[data-tool-card]') : null);
  const arrow = card?.querySelector('.tool-card-arrow');
  if (arrow) {
    const button = document.createElement('button');
    button.className = 'tool-reset';
    button.type = 'button';
    button.textContent = 'Reset';
    button.setAttribute('aria-label', `Reset ${name} tool to its defaults`);
    button.addEventListener('click', () => resetTool(name));
    arrow.replaceWith(button);
  }
});

filters.forEach((button) => button.addEventListener('click', () => {
  selectedCategory = button.dataset.filter;
  filters.forEach((item) => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  applyFilter();
}));
$('toolSearch').addEventListener('input', applyFilter);
function applyFilter() {
  const query = $('toolSearch').value.trim().toLowerCase();
  let visible = 0;
  cards.forEach((card) => {
    const categoryMatches = selectedCategory === 'all' || card.dataset.category === selectedCategory;
    const queryMatches = !query || `${card.dataset.search} ${card.textContent}`.toLowerCase().includes(query);
    const show = categoryMatches && queryMatches;
    card.hidden = !show;
    if (show) visible += 1;
  });
  $('filterStatus').textContent = `Showing ${visible} ${visible === 1 ? 'tool' : 'tools'}${selectedCategory === 'all' && !query ? ' — all tools.' : ` in this view.`}`;
  $('noTools').hidden = visible > 0;
}
