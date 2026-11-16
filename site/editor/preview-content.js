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

export function buildProjectPreview({ activeFile, files, compiledTypeScript = [] } = {}) {
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

  const htmlFile = files.find((file) => file.name.toLowerCase() === 'index.html')
    || files.find((file) => ['html', 'htm'].includes(file.name.split('.').pop().toLowerCase()));
  if (!htmlFile) throw new Error('Add an .html file before running a website preview.');
  const css = files.filter((file) => file.name.endsWith('.css')).map((file) => file.content).join('\n\n');
  const javascript = [
    ...files.filter((file) => ['js', 'mjs'].includes(file.name.split('.').pop().toLowerCase())).map((file) => file.content),
    ...compiledTypeScript
  ].join('\n\n');
  const path = extension === 'html' || extension === 'htm' ? activeFile.name : htmlFile.name;
  return {
    mode: 'website',
    path,
    srcdoc: buildPreviewDocument({ html: htmlFile.content, css, javascript, maxLength: MAX_PROJECT_CHARS })
  };
}

export function buildPythonInfoPreview(filename) {
  return documentPage(filename, `<h1>Python runs in the Terminal</h1><p>Select <code>${escapeHtml(filename)}</code>, press <strong>Run Python</strong>, or enter <code>python ${escapeHtml(filename)}</code> in the project terminal.</p><p>The code executes in a separate local browser worker. Network access and package installation are disabled.</p>`);
}
