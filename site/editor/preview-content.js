import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { parseDocument as parseYaml } from 'yaml';
import { MAX_PROJECT_CHARS } from './project.js';
import { buildPreviewDocument } from '../preview-document.js';

const DATA_STYLES = `:root{color-scheme:light;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:#272333;background:#f6f4fa}body{margin:0;padding:2rem}main{max-width:900px;margin:auto}h1{font:700 1.6rem system-ui,sans-serif;letter-spacing:-.04em}p,small{font: .85rem/1.7 system-ui,sans-serif;color:#716b7d}pre{overflow:auto;padding:1.2rem;border:1px solid #e4dfed;border-radius:12px;background:#fff;box-shadow:0 10px 32px #251a4910;font-size:.8rem;line-height:1.65}code{font:inherit}a{color:#674bd6}blockquote{margin:1rem 0;padding:.3rem 1rem;border-left:3px solid #8067f7;color:#655d74}table{border-collapse:collapse}td,th{padding:.4rem .7rem;border:1px solid #ddd}`;
const MARKDOWN_STYLES = `${DATA_STYLES}h1,h2,h3,h4{font-family:system-ui,sans-serif;letter-spacing:-.04em}h2{margin-top:2rem}img{max-width:100%;height:auto}pre code{white-space:pre}`;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function documentPage(title, body, css = DATA_STYLES) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body><main>${body}</main></body></html>`;
  return buildPreviewDocument({ html, css, javascript: '', maxLength: MAX_PROJECT_CHARS });
}

function dataPreview(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  let content = file.content;
  if (extension === 'json') {
    content = JSON.stringify(JSON.parse(file.content), null, 2);
  } else if (extension === 'yaml' || extension === 'yml') {
    const document = parseYaml(file.content, { uniqueKeys: true, prettyErrors: true });
    if (document.errors.length) throw new Error(document.errors.map((error) => error.message).join('\n'));
    content = JSON.stringify(document.toJS(), null, 2);
  }
  return documentPage(file.name, `<h1>${escapeHtml(file.name)}</h1><p>Read-only data preview · ${extension.toUpperCase()}</p><pre><code>${escapeHtml(content)}</code></pre>`);
}

function markdownPreview(file) {
  const rendered = String(marked.parse(file.content, { async: false }));
  const safeMarkup = DOMPurify.sanitize(rendered, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'base', 'style'],
    FORBID_ATTR: ['srcset']
  });
  return documentPage(file.name, `<article class="markdown-preview">${safeMarkup}</article>`, MARKDOWN_STYLES);
}

// Project names are canonical relative POSIX paths, not browser URLs. Never let
// malformed project entries make an otherwise unsafe reference resolvable.
function isProjectPath(path) {
  return typeof path === 'string' && path.length > 0 && !/[\\\x00-\x1f\x7f]/.test(path)
    && path.split('/').every((part) => part && part !== '.' && part !== '..');
}

function extensionOf(path) {
  return path.split('.').pop().toLowerCase();
}

function directoryOf(path) {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

const CLASSIC_SCRIPT_TYPES = new Set([
  '', 'application/ecmascript', 'application/javascript', 'application/x-ecmascript', 'application/x-javascript',
  'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2',
  'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript',
  'text/x-ecmascript', 'text/x-javascript'
]);

function isClassicScript(script) {
  const type = script.getAttribute('type');
  const language = script.getAttribute('language');
  const label = type === null && language ? `text/${language}` : (type || '');
  return CLASSIC_SCRIPT_TYPES.has(label.trim().toLowerCase());
}

// Only local project URLs are accepted. A leading single slash anchors to the
// project root; other references resolve from the HTML file's directory.
// Decode segments before checking traversal, separators and schemes.
function resolveProjectReference(reference, pagePath) {
  if (typeof reference !== 'string') return null;
  const raw = reference.trim().split(/[?#]/, 1)[0];
  if (!raw || raw.startsWith('//') || /[\\\x00-\x1f\x7f]/.test(raw)) return null;
  const rootAnchored = raw.startsWith('/');
  const result = !rootAnchored && directoryOf(pagePath) ? directoryOf(pagePath).split('/') : [];
  const parts = (rootAnchored ? raw.slice(1) : raw).split('/');
  for (let index = 0; index < parts.length; index += 1) {
    let part;
    try {
      part = decodeURIComponent(parts[index]);
    } catch {
      return null;
    }
    if (/[\/\\\x00-\x1f\x7f]/.test(part) || (index === 0 && part.includes(':'))) return null;
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!result.length) return null;
      result.pop();
    } else {
      result.push(part);
    }
  }
  return result.length ? result.join('/') : null;
}

function websitePreview(htmlFile, files, compiledTypeScript, executionMode = 'safe', packages = {}) {
  if (!isProjectPath(htmlFile.name)) throw new Error('The HTML file has an unsafe project path.');
  const html = String(htmlFile.content);
  if (html.length > MAX_PROJECT_CHARS) throw new Error('The HTML file is too large to preview.');

  const safeFiles = files.filter((file) => isProjectPath(file?.name) && typeof file.content === 'string');
  const byPath = new Map();
  for (const file of safeFiles) {
    if (!byPath.has(file.name)) byPath.set(file.name, file);
  }
  // The editor compiles all .ts files in file order; associate the otherwise
  // anonymous outputs with those same source paths without recompiling them.
  const compiledByPath = new Map();
  const typeScriptFiles = files.filter((file) => typeof file?.name === 'string' && extensionOf(file.name) === 'ts');
  typeScriptFiles.forEach((file, index) => {
    if (isProjectPath(file.name) && typeof compiledTypeScript[index] === 'string' && !compiledByPath.has(file.name)) {
      compiledByPath.set(file.name, compiledTypeScript[index]);
    }
  });

  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const experimental = executionMode === 'experimental';
  if (experimental) {
    const imports = {};
    const packageNames = [...new Set([...(packages.javascript || []), ...(packages.typescript || [])])]
      .filter((name) => typeof name === 'string' && /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]{0,99}$/i.test(name));
    for (const name of packageNames) {
      const url = `https://esm.sh/${name}`;
      imports[name] = url;
      imports[`${name}/`] = `${url}/`;
    }
    if (Object.keys(imports).length) {
      const importMap = parsed.createElement('script');
      importMap.type = 'importmap';
      importMap.textContent = JSON.stringify({ imports });
      parsed.head.prepend(importMap);
    }
  }
  const stylesheets = [...parsed.querySelectorAll('link[rel~="stylesheet" i]')];
  const externalScripts = [...parsed.querySelectorAll('script[src]')];
  let expandedLength = html.length;
  let delayedScriptIndex = 0;
  const safeInlineText = (text, closingTag) => {
    if (text.length > MAX_PROJECT_CHARS - expandedLength) throw new Error('The expanded HTML is too large to preview.');
    const escaped = text.replace(closingTag, (tag) => `<\\/${tag.slice(2)}`);
    expandedLength += escaped.length;
    if (expandedLength > MAX_PROJECT_CHARS) throw new Error('The expanded HTML is too large to preview.');
    return escaped;
  };

  for (const link of stylesheets) {
    const path = resolveProjectReference(link.getAttribute('href'), htmlFile.name);
    const file = path && byPath.get(path);
    // Alternate/disabled sheets cannot be faithfully enabled as inline styles.
    if (file && extensionOf(file.name) === 'css' && !link.hasAttribute('disabled')
      && !link.rel.toLowerCase().split(/\s+/).includes('alternate')) {
      const style = parsed.createElement('style');
      for (const attribute of ['media', 'title', 'type']) {
        if (link.hasAttribute(attribute)) style.setAttribute(attribute, link.getAttribute(attribute));
      }
      style.textContent = safeInlineText(file.content, /<\/style/gi);
      link.replaceWith(style);
    } else if (experimental && !path && /^https:\/\//i.test(link.getAttribute('href') || '')) {
      // Keep explicitly requested HTTPS stylesheets only after per-run approval.
    } else {
      link.remove();
    }
  }
  for (const source of externalScripts) {
    const path = resolveProjectReference(source.getAttribute('src'), htmlFile.name);
    const file = path && byPath.get(path);
    const extension = file && extensionOf(file.name);
    const code = extension === 'ts' ? compiledByPath.get(file.name)
      : file && ['js', 'mjs'].includes(extension) ? file.content : undefined;
    if (typeof code !== 'string') {
      const remoteUrl = source.getAttribute('src') || '';
      if (experimental && !file && /^https:\/\//i.test(remoteUrl)) continue;
      source.remove();
      continue;
    }
    const script = parsed.createElement('script');
    const attributes = [...source.attributes]
      .filter((attribute) => attribute.name !== 'src' && attribute.name !== 'integrity');
    const delayedClassic = isClassicScript(source) && !source.hasAttribute('nomodule')
      && (source.hasAttribute('defer') || source.hasAttribute('async'));
    if (delayedClassic) {
      // Inline classic scripts ignore defer/async. A module is queued with the
      // browser's deferred modules (or async queue), then inserts the original
      // code as a classic script, retaining its global scope and DOM position.
      let marker;
      let selector;
      do {
        marker = `tzrender-delayed-script-${delayedScriptIndex++}`;
        selector = `script[data-tzrender-delayed="${marker}"]`;
      } while (parsed.querySelector(selector));
      for (const attribute of attributes) script.setAttribute(attribute.name, attribute.value);
      script.type = 'module';
      script.setAttribute('data-tzrender-delayed', marker);
      const savedAttributes = attributes.map(({ name, value }) => [name, value]);
      const wrapper = `const script = document.createElement('script');\n`
        + `for (const [name, value] of ${JSON.stringify(savedAttributes)}) script.setAttribute(name, value);\n`
        + `script.textContent = ${JSON.stringify(code)};\n`
        + `const placeholder = document.querySelector(${JSON.stringify(selector)});\n`
        + `if (placeholder) placeholder.replaceWith(script); else document.head.append(script);`;
      script.textContent = safeInlineText(wrapper, /<\/script/gi);
    } else {
      for (const attribute of attributes) script.setAttribute(attribute.name, attribute.value);
      script.textContent = safeInlineText(code, /<\/script/gi);
    }
    source.replaceWith(script);
  }

  // Legacy pages without style/script elements use assets alongside that page,
  // regardless of how many other HTML pages exist. Decide separately per type;
  // any explicit element (including a missing/external reference) opts out.
  // Use the same first-entry-per-path policy as explicit references.
  const uniqueFiles = [...byPath.values()];
  const sameDirectory = (file) => directoryOf(file.name) === directoryOf(htmlFile.name);
  const useCssFallback = !stylesheets.length && !parsed.querySelector('style');
  const useScriptFallback = !externalScripts.length && !parsed.querySelector('script');
  const css = useCssFallback
    ? uniqueFiles.filter((file) => sameDirectory(file) && extensionOf(file.name) === 'css').map((file) => file.content).join('\n\n') : '';
  const javascript = useScriptFallback
    ? [
      ...uniqueFiles.filter((file) => sameDirectory(file) && ['js', 'mjs'].includes(extensionOf(file.name))).map((file) => file.content),
      ...uniqueFiles.filter((file) => sameDirectory(file) && extensionOf(file.name) === 'ts' && compiledByPath.has(file.name))
        .map((file) => compiledByPath.get(file.name))
    ].join('\n\n') : '';
  const markup = `<!doctype html>\n${parsed.documentElement.outerHTML}`;
  if (markup.length > MAX_PROJECT_CHARS) throw new Error('The expanded HTML is too large to preview.');
  return buildPreviewDocument({ html: markup, css, javascript, maxLength: MAX_PROJECT_CHARS, allowNetwork: experimental });
}

export function buildProjectPreview({ activeFile, files, compiledTypeScript = [], executionMode = 'safe', packages = {} } = {}) {
  if (!activeFile || !Array.isArray(files)) throw new Error('Select a project file to preview.');
  const extension = activeFile.name.split('.').pop().toLowerCase();
  if (extension === 'py') return { mode: 'python', srcdoc: '', path: activeFile.name };
  if (extension === 'md' || extension === 'markdown') {
    return { mode: 'document', srcdoc: markdownPreview(activeFile), path: activeFile.name };
  }
  if (extension === 'json' || extension === 'yaml' || extension === 'yml' || extension === 'txt') {
    return { mode: 'document', srcdoc: dataPreview(activeFile), path: activeFile.name };
  }
  if (!['html', 'htm', 'css', 'js', 'mjs', 'ts'].includes(extension)) {
    throw new Error(`.${extension || 'unknown'} files receive syntax highlighting only; this workspace does not run that file type.`);
  }

  const htmlFile = ['html', 'htm'].includes(extension) ? activeFile
    : files.find((file) => file.name.toLowerCase() === 'index.html')
      || files.find((file) => ['html', 'htm'].includes(file.name.split('.').pop().toLowerCase()));
  if (!htmlFile) throw new Error('Add an .html file before running a website preview.');
  return {
    mode: 'website',
    path: htmlFile.name,
    srcdoc: websitePreview(htmlFile, files, Array.isArray(compiledTypeScript) ? compiledTypeScript : [], executionMode, packages)
  };
}

export function buildPythonInfoPreview(filename, executionMode = 'safe') {
  const modeNotice = executionMode === 'experimental'
    ? 'After per-run confirmation, Python may contact external services and install the configured packages in a disposable worker that is destroyed when execution ends.'
    : 'Network access and package installation are disabled. Project files are mounted locally for imports.';
  return documentPage(filename, `<h1>Python runs in the Terminal</h1><p>Select <code>${escapeHtml(filename)}</code>, press <strong>Run Python</strong>, or enter <code>python ${escapeHtml(filename)}</code> in the project terminal.</p><p>The code executes in a separate local browser worker. ${escapeHtml(modeNotice)}</p>`);
}

export function buildLanguageInfoPreview(filename, language, executionMode = 'safe') {
  const labels = { php: 'PHP', java: 'Java', lua: 'Lua 5.4', sql: 'SQLite / SQL', rb: 'Ruby', r: 'R', pl: 'Perl' };
  const label = labels[language] || language.toUpperCase();
  const detail = language === 'sql'
    ? 'Queries run in an in-memory SQLite WebAssembly database and their rows appear in Preview.'
    : language === 'r'
      ? `R runs locally in the webR WebAssembly runtime. Local source() imports are available.${executionMode === 'experimental' ? ' Only explicitly configured packages precompiled for WebAssembly are fetched from the webR package repository after per-run confirmation; arbitrary network connections remain unavailable.' : ' Network access and package installation are disabled in safe mode.'}`
    : language === 'rb'
      ? 'CRuby 3.4 runs in an isolated WebAssembly worker. Local require/require_relative are available; host OS, network sockets and gem installation are not.'
    : language === 'pl'
      ? 'Perl 5 runs in an isolated WebAssembly worker. Local use/require imports are available; host OS, network and CPAN installation are not supported.'
    : `${label} runs locally in a browser WebAssembly runtime; output appears in Terminal.`;
  return documentPage(filename, `<h1>${label} workspace</h1><p><code>${escapeHtml(filename)}</code> is ready for editing with ${label} syntax highlighting.</p><p>${detail}</p>`);
}
