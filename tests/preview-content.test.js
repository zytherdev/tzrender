import { describe, expect, it, vi } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildProjectPreview } from '../site/editor/preview-content.js';
import { STARTERS, MAX_PROJECT_CHARS } from '../site/editor/project.js';
import { PREVIEW_CSP } from '../site/preview-document.js';

const file = (name, content) => ({ name, content });
const page = (body, head = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const preview = (activeFile, files, compiledTypeScript) => buildProjectPreview({ activeFile, files, compiledTypeScript });
const parse = (srcdoc) => new DOMParser().parseFromString(srcdoc, 'text/html');
const occurrences = (text, needle) => text.split(needle).length - 1;

describe('project website previews', () => {
  it('renders the active HTML/HTM itself, not the root index or another page with the same basename', () => {
    const root = file('index.html', page('<h1>Root</h1>'));
    const nested = file('docs/index.html', page('<h1>Docs</h1>'));
    const other = file('docs/guide.HTM', page('<h1>Guide</h1>'));
    const files = [root, nested, other];
    for (const [active, title] of [[root, 'Root'], [nested, 'Docs'], [other, 'Guide']]) {
      const result = preview(active, files);
      expect(result.mode).toBe('website');
      expect(result.path).toBe(active.name);
      expect(parse(result.srcdoc).querySelector('h1').textContent).toBe(title);
    }
    // The active editor content is authoritative, even if files has a stale copy.
    expect(parse(preview(file('docs/index.html', page('<h1>Unsaved</h1>')), files).srcdoc).querySelector('h1').textContent).toBe('Unsaved');
  });

  it('uses the root index, then the first HTML file, when a non-HTML website file is active', () => {
    const css = file('assets/site.css', 'body { color: blue }');
    const nested = file('pages/nested.htm', page('nested'));
    const root = file('index.html', page('root'));
    expect(preview(css, [nested, root, css]).path).toBe('index.html');
    expect(preview(css, [nested, css]).path).toBe('pages/nested.htm');
    expect(() => preview(css, [css])).toThrow('Add an .html file');
  });

  it('resolves page-relative references, preserving stylesheet cascade and script order', () => {
    const html = file('pages/docs/guide.html', page(
      `<script>window.order = ['inline-before']</script>
       <script src="../../js/first.js?v=1#frag"></script>
       <script>window.order.push('inline-middle')</script>
       <script src="./scripts/main%20file.mjs"></script>`,
      `<style>.sample { color: black }</style>
       <link rel="preload STYLESHEET" href="../../css/base.css?version=2" media="screen">
       <style>.sample { color: green }</style>
       <link rel="stylesheet" href="./theme/../theme/final.css#x">`
    ));
    const files = [html,
      file('css/base.css', '.sample { color: red }'),
      file('pages/docs/theme/final.css', '.sample { color: blue }'),
      file('js/first.js', "window.order.push('first')"),
      file('pages/docs/scripts/main file.mjs', "window.order.push('second')"),
      file('js/unreferenced.js', "window.order.push('unreferenced')"),
      file('css/unreferenced.css', '.sample { color: pink }')
    ];
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    try {
      const result = preview(html, files);
      const document = parse(result.srcdoc);
      const styles = [...document.querySelectorAll('style')].map((style) => style.textContent);
      expect(styles.slice(0, 4)).toEqual([
        '.sample { color: black }', '.sample { color: red }',
        '.sample { color: green }', '.sample { color: blue }'
      ]);
      expect(document.querySelectorAll('style')[1].getAttribute('media')).toBe('screen');
      expect(result.srcdoc).not.toContain('unreferenced');
      expect(document.querySelectorAll('script[src], link[rel~="stylesheet" i]')).toHaveLength(0);
      const dom = new JSDOM(result.srcdoc, { runScripts: 'dangerously' });
      try {
        expect(Array.from(dom.window.order)).toEqual(['inline-before', 'first', 'inline-middle', 'second']);
      } finally {
        dom.window.close();
      }
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not load absolute URLs, schemes, traversal, encoded separators, bad escapes or absent files', () => {
    const refs = [
      'https://example.test/evil.js', '//example.test/evil.js', '/evil.js', 'javascript:evil.js', 'data:text/javascript,evil',
      '../../../evil.js', '%2e%2e/%2e%2e/%2e%2e/evil.js', '%2fevil.js', 'nested%2fevil.js',
      '..%5cevil.js', '\\evil.js', 'http%3a/evil.js', 'bad%zz.js', 'missing.js', ''
    ];
    const links = ['https://example.test/a.css', '/evil.css', '../../../evil.css', '%2e%2e/%2e%2e/%2e%2e/evil.css', 'missing.css'];
    const html = file('pages/docs/index.html', page(
      refs.map((ref) => `<script src="${ref}"></script>`).join(''),
      links.map((ref) => `<link rel="stylesheet" href="${ref}">`).join('')
    ));
    const files = [html, file('evil.js', 'window.EVIL = true'), file('evil.css', '/* EVIL_CSS */'),
      file('pages/docs/unrelated.js', 'window.FALLBACK = true'), file('pages/docs/unrelated.css', '/* FALLBACK_CSS */'),
      file('../evil.js', 'window.INVALID_PATH = true')];
    const result = preview(html, files);
    const parsed = parse(result.srcdoc);
    expect(result.srcdoc).not.toMatch(/EVIL|FALLBACK|INVALID_PATH/);
    expect(parsed.querySelectorAll('script[src], link[rel~="stylesheet" i]')).toHaveLength(0);
    expect(parsed.querySelectorAll('script')).toHaveLength(1); // bridge only
    expect(parsed.querySelector('meta[http-equiv="Content-Security-Policy"]').content).toBe(PREVIEW_CSP);
  });

  it('allows parent traversal within the project but never resolves above its root', () => {
    const html = file('docs/guide.html', page('<script src="../app.js"></script><script src="../../app.js"></script>'));
    const result = preview(html, [html, file('app.js', 'window.LOCAL_MARKER = 1')]);
    expect(occurrences(result.srcdoc, 'window.LOCAL_MARKER = 1')).toBe(1);
    expect(parse(result.srcdoc).querySelectorAll('script[src]')).toHaveLength(0);
    expect(() => preview(file('../index.html', page('unsafe')), [])).toThrow('unsafe project path');
  });

  it('accepts only matching local asset types and associates compiled TypeScript with its source path', () => {
    const html = file('pages/index.html', page(
      '<script src="../src/app.ts"></script><script src="not-js.css"></script><script src="missing.ts"></script>',
      '<link rel="stylesheet" href="not-css.js">'
    ));
    const files = [html, file('other/app.ts', 'first source'), file('src/app.ts', 'second source'),
      file('pages/not-js.css', 'window.WRONG_SCRIPT = 1'), file('pages/not-css.js', '/* WRONG_CSS */')];
    const result = preview(html, files, ['window.OTHER_TS = 1', 'window.MATCHED_TS = 1']);
    expect(result.srcdoc).toContain('window.MATCHED_TS = 1');
    expect(result.srcdoc).not.toMatch(/OTHER_TS|WRONG_SCRIPT|WRONG_CSS/);
    const noCompiled = preview(html, files);
    expect(noCompiled.srcdoc).not.toContain('second source');
  });

  it('keeps real starter fallbacks working with additional pages, including precompiled TypeScript', () => {
    for (const starter of ['landing', 'profile', 'typescript', 'blank']) {
      const files = [...STARTERS[starter].files, file('docs/other.html', page('other')),
        file('docs/other.css', '/* OTHER_FOLDER_CSS */'), file('docs/other.js', 'window.OTHER_FOLDER_JS = true')];
      const html = files.find((entry) => entry.name === 'index.html');
      const compiled = starter === 'typescript' ? ["console.log('COMPILED_STARTER');"] : [];
      const result = preview(html, files, compiled);
      const document = parse(result.srcdoc);
      expect(document.querySelector('style').textContent).toContain(files.find((entry) => entry.name === 'styles.css').content);
      const marker = starter === 'typescript' ? 'COMPILED_STARTER' : files.find((entry) => entry.name === 'script.js').content;
      expect(occurrences(result.srcdoc, marker)).toBe(1);
      expect(result.srcdoc).not.toMatch(/OTHER_FOLDER/);
    }
  });

  it('never appends referenced assets a second time and does not execute unrelated files', () => {
    const html = file('index.html', page('<script src="app.js"></script>', '<link rel="stylesheet" href="styles.css">'));
    const files = [html, file('app.js', 'window.APP_ONCE = 1'), file('other.js', 'window.OTHER = 1'),
      file('styles.css', '/* STYLE_ONCE */'), file('other.css', '/* OTHER_STYLE */')];
    const result = preview(html, files);
    expect(occurrences(result.srcdoc, 'window.APP_ONCE = 1')).toBe(1);
    expect(occurrences(result.srcdoc, 'STYLE_ONCE')).toBe(1);
    expect(result.srcdoc).not.toMatch(/window\.OTHER|OTHER_STYLE/);
  });

  it('limits each page fallback to its own directory and resource types without explicit markup', () => {
    const html = file('docs/index.html', page('<h1>Legacy</h1>'));
    const files = [html, file('docs/site.css', '/* LOCAL_CSS */'), file('docs/app.js', 'window.LOCAL_JS = true'),
      file('elsewhere/site.css', '/* REMOTE_FOLDER_CSS */'), file('elsewhere/app.js', 'window.REMOTE_FOLDER_JS = true')];
    const legacy = preview(html, files).srcdoc;
    expect(legacy).toContain('LOCAL_CSS');
    expect(legacy).toContain('LOCAL_JS');
    expect(legacy).not.toMatch(/REMOTE_FOLDER/);
    const multiple = preview(html, [...files, file('other.html', page('other'))]).srcdoc;
    expect(occurrences(multiple, 'LOCAL_CSS')).toBe(1);
    expect(occurrences(multiple, 'LOCAL_JS')).toBe(1);
    expect(multiple).not.toMatch(/REMOTE_FOLDER/);
    const intentional = file('docs/index.html', page('<script>window.INLINE = true</script>', '<style>/* INLINE */</style>'));
    const inline = preview(intentional, [intentional, ...files.slice(1)]).srcdoc;
    expect(inline).not.toMatch(/LOCAL_CSS|LOCAL_JS/);
    expect(inline).toContain('window.INLINE = true');
  });

  it('resolves per-page fallback independently and ignores duplicate paths', () => {
    const root = file('index.html', page('root'));
    const nested = file('docs/index.html', page('nested'));
    const files = [root, nested, file('app.css', '/* ROOT_CSS */'), file('app.js', 'window.ROOT_JS = true'),
      file('docs/app.css', '/* DOCS_CSS */'), file('docs/app.js', 'window.DOCS_JS = true'),
      file('docs/app.css', '/* DUPLICATE_CSS */'), file('docs/app.js', 'window.DUPLICATE_JS = true')];
    const rootPreview = preview(root, files).srcdoc;
    const docsPreview = preview(nested, files).srcdoc;
    expect(rootPreview).toMatch(/ROOT_CSS/);
    expect(rootPreview).toMatch(/ROOT_JS/);
    expect(rootPreview).not.toMatch(/DOCS_|DUPLICATE_/);
    expect(occurrences(docsPreview, 'DOCS_CSS')).toBe(1);
    expect(occurrences(docsPreview, 'DOCS_JS')).toBe(1);
    expect(docsPreview).not.toMatch(/ROOT_|DUPLICATE_/);
  });

  it('decides CSS and script fallback independently even with multiple pages', () => {
    const cssFallback = file('docs/css.html', page('<script src="app.js"></script>'));
    const jsFallback = file('docs/js.html', page('page', '<link rel="stylesheet" href="site.css">'));
    const missing = file('docs/missing.html', page('<script src="missing.js"></script>', '<link rel="stylesheet" href="missing.css">'));
    const files = [cssFallback, jsFallback, missing, file('docs/site.css', '/* PAGE_STYLE */'),
      file('docs/app.js', 'window.PAGE_SCRIPT = true')];
    for (const active of [cssFallback, jsFallback]) {
      const result = preview(active, files).srcdoc;
      expect(occurrences(result, 'PAGE_STYLE')).toBe(1);
      expect(occurrences(result, 'PAGE_SCRIPT')).toBe(1);
    }
    expect(preview(missing, files).srcdoc).not.toMatch(/PAGE_STYLE|PAGE_SCRIPT/);
  });

  it('executes legacy fallback once after the body and before DOMContentLoaded', async () => {
    const html = file('index.html', page('<button id="ready">Ready</button>'));
    const files = [html, file('another.html', page('another')), file('script.js', `
      window.legacyOrder = [document.querySelector('#ready') ? 'body-ready' : 'body-missing'];
      document.addEventListener('DOMContentLoaded', () => window.legacyOrder.push('dom-ready'));
      console.log('LEGACY_LOG');
    `)];
    const result = preview(html, files);
    const document = parse(result.srcdoc);
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
    expect(document.body.lastElementChild.tagName).toBe('SCRIPT');
    const postMessage = vi.fn();
    const dom = new JSDOM(result.srcdoc, {
      runScripts: 'dangerously', virtualConsole: new VirtualConsole(),
      beforeParse(window) { window.postMessage = postMessage; }
    });
    try {
      await new Promise((resolve) => dom.window.addEventListener('load', resolve, { once: true }));
      expect(Array.from(dom.window.legacyOrder)).toEqual(['body-ready', 'dom-ready']);
      expect(postMessage.mock.calls.filter(([message]) => message.message === 'LEGACY_LOG')).toHaveLength(1);
    } finally {
      dom.window.close();
    }
  });

  it('installs one bridge after CSP and before head scripts, forwarding early logs and errors in page order', () => {
    const html = file('index.html', page(
      "<script>window.order.push('body'); console.info('BODY_LOG')</script>",
      `<script>window.order = ['head-inline']; console.log('HEAD_LOG')</script>
       <script src="app.js"></script>
       <script>throw new Error('HEAD_FAILURE')</script>`
    ));
    const result = preview(html, [html, file('app.js', "window.order.push('head-local'); console.warn('LOCAL_LOG')")]);
    const document = parse(result.srcdoc);
    const headElements = [...document.head.children];
    const scripts = [...document.querySelectorAll('script')];
    expect(headElements[0].getAttribute('http-equiv')).toBe('Content-Security-Policy');
    expect(headElements[0].content).toBe(PREVIEW_CSP);
    expect(headElements[1]).toBe(scripts[0]);
    expect(scripts[0].textContent).toContain("channel: 'tzrender-preview'");
    expect(occurrences(result.srcdoc, "channel: 'tzrender-preview'")).toBe(1);

    const postMessage = vi.fn();
    const dom = new JSDOM(result.srcdoc, {
      runScripts: 'dangerously',
      virtualConsole: new VirtualConsole(),
      beforeParse(window) { window.postMessage = postMessage; }
    });
    try {
      expect(Array.from(dom.window.order)).toEqual(['head-inline', 'head-local', 'body']);
      const messages = postMessage.mock.calls.map(([message]) => message);
      expect(messages.filter((message) => message.type === 'console').map(({ level, message }) => [level, message]))
        .toEqual([['log', 'HEAD_LOG'], ['warn', 'LOCAL_LOG'], ['info', 'BODY_LOG']]);
      expect(messages.some((message) => message.type === 'error' && message.message.includes('HEAD_FAILURE'))).toBe(true);
      expect(messages.every((message) => message.channel === 'tzrender-preview')).toBe(true);
    } finally {
      dom.window.close();
    }
  });

  it.skipIf(!existsSync(process.env.CHROMIUM_PATH || '/usr/bin/chromium'))('preserves deferred classic scripts and module order in a sandboxed browser', () => {
    const html = file('index.html', page(
      `<div id="target"></div><script>window.order.push(document.getElementById('deferred-a') ? 'body' : 'script-missing');
       addEventListener('DOMContentLoaded', () => window.order.push('dom'));
       addEventListener('load', () => console.log('ORDER:' + JSON.stringify(window.order)))</script>`,
      `<script>window.order = ['head']; console.log('EARLY_HEAD')</script>
       <script type="module">window.order.push('module-before')</script>
       <script id="deferred-a" defer src="a.js"></script>
       <script defer src="b.js"></script>
       <script type="module">window.order.push('module-after')</script>`
    ));
    const result = preview(html, [html,
      file('a.js', `var deferredGlobal = 42;
        window.order.push(document.querySelector('#target') ? document.currentScript.id : 'too-early');
        addEventListener('DOMContentLoaded', () => window.order.push('defer-dom'));
        console.warn('DEFERRED_LOG');`),
      file('b.js', "window.order.push('global-' + window.deferredGlobal)")]);
    const directory = mkdtempSync(join(tmpdir(), 'tzrender-preview-'));
    try {
      const source = result.srcdoc.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const harness = join(directory, 'index.html');
      writeFileSync(harness, `<!doctype html><pre id="result"></pre>
        <script>addEventListener('message', event => {
          document.getElementById('result').textContent += JSON.stringify(event.data) + '\\n';
        })</script><iframe sandbox="allow-scripts" srcdoc="${source}"></iframe>`);
      const browser = spawnSync(process.env.CHROMIUM_PATH || '/usr/bin/chromium', [
        '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
        '--disable-background-networking', '--virtual-time-budget=2000', '--dump-dom', pathToFileURL(harness).href
      ], { encoding: 'utf8', timeout: 15000 });
      expect(browser.status, browser.stderr).toBe(0);
      const resultDocument = new JSDOM(browser.stdout).window.document;
      const messages = resultDocument.querySelector('#result').textContent.trim().split('\n').map((line) => JSON.parse(line));
      const consoleMessages = messages.filter((message) => message.type === 'console').map((message) => message.message);
      expect(consoleMessages).toContain('EARLY_HEAD');
      expect(consoleMessages).toContain('DEFERRED_LOG');
      const order = consoleMessages.find((message) => message.startsWith('ORDER:'));
      expect(JSON.parse(order.slice('ORDER:'.length))).toEqual([
        'head', 'body', 'module-before', 'deferred-a', 'global-42', 'module-after', 'dom', 'defer-dom'
      ]);
      expect(messages.filter((message) => message.type === 'error')).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 20000);

  it('escapes closing tags in inlined local resources and retains the original security policy', () => {
    const html = file('index.html', page('<script src="app.js"></script>',
      '<base href="https://bad.example/"><meta http-equiv="refresh" content="0;url=https://bad.example/"><meta http-equiv="Content-Security-Policy" content="default-src *"><link rel="stylesheet" href="style.css">'));
    const files = [html,
      file('app.js', `console.log('</script><script id="evil">window.PWNED = 1</script>');`),
      file('style.css', `body::after { content: '</style><script id="evil-css">window.PWNED = 2</script>'; }`)];
    const document = parse(preview(html, files).srcdoc);
    expect(document.querySelectorAll('base, meta[http-equiv="refresh"]')).toHaveLength(0);
    expect(document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')).toHaveLength(1);
    expect(document.querySelector('meta[http-equiv="Content-Security-Policy"]').content).toBe(PREVIEW_CSP);
    expect(document.querySelector('#evil, #evil-css')).toBeNull();
    expect(document.querySelectorAll('script')).toHaveLength(2);
    expect(document.querySelector('style').textContent).toContain('<\\/style');
    expect([...document.querySelectorAll('script')][1].textContent).toContain('<\\/script');
  });

  it('rejects excessive expanded documents rather than silently truncating executable content', () => {
    const html = file('index.html', page('<script src="app.js"></script>'.repeat(12)));
    expect(() => preview(html, [html, file('app.js', 'x'.repeat(MAX_PROJECT_CHARS / 10))])).toThrow('expanded HTML is too large');
  });
});
