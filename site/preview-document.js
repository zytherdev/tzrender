export const PREVIEW_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export const EXPERIMENTAL_PREVIEW_CSP = "default-src 'none'; script-src 'unsafe-inline' https: blob:; style-src 'unsafe-inline' https:; img-src data: blob: https:; font-src data: https:; media-src data: blob: https:; connect-src https: wss:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

export function buildPreviewDocument({ html = '', css = '', javascript = '', maxLength = 100_000, allowNetwork = false } = {}) {
  const limit = Number.isFinite(Number(maxLength)) ? Math.max(0, Number(maxLength)) : 100_000;
  const markup = String(html).slice(0, limit);
  const stylesheet = String(css).slice(0, limit);
  const scriptText = String(javascript).slice(0, limit);
  const parsed = new DOMParser().parseFromString(markup, 'text/html');
  parsed.querySelectorAll('base, script[src], link[rel~="stylesheet" i], meta[http-equiv="Content-Security-Policy" i], meta[http-equiv="refresh" i]').forEach((node) => {
    const remote = node.matches('script[src]') ? node.getAttribute('src')
      : node.matches('link[rel~="stylesheet" i]') ? node.getAttribute('href') : '';
    if (allowNetwork === true && /^https:\/\//i.test(remote || '')) return;
    node.remove();
  });

  const policy = document.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = allowNetwork === true ? EXPERIMENTAL_PREVIEW_CSP : PREVIEW_CSP;
  parsed.head.prepend(policy);

  const style = document.createElement('style');
  style.textContent = stylesheet.replace(/<\/style/gi, '<\\/style');
  parsed.head.append(style);

  const bridge = `\n(() => {\n  const send = (data) => { try { parent.postMessage({ channel: 'tzrender-preview', ...data }, '*'); } catch {} };\n  const printable = (value) => { if (typeof value === 'string') return value; if (value instanceof Error) return value.stack || value.message; try { const result = JSON.stringify(value); return result === undefined ? String(value) : result; } catch { return String(value); } };\n  for (const level of ['log', 'info', 'warn', 'error']) {\n    const original = console[level].bind(console);\n    console[level] = (...args) => { original(...args); send({ type: 'console', level, message: args.map(printable).join(' ') }); };\n  }\n  addEventListener('error', (event) => send({ type: 'error', message: event.message || 'Script error', line: event.lineno || 0 }));\n  addEventListener('unhandledrejection', (event) => send({ type: 'error', message: printable(event.reason) }));\n  addEventListener('securitypolicyviolation', (event) => send({ type: 'console', level: 'warn', message: 'Preview blocked external resource: ' + (event.violatedDirective || 'network policy') }));\n  addEventListener('load', () => send({ type: 'ready' }), { once: true });\n})();\n`;
  const bridgeScript = document.createElement('script');
  bridgeScript.textContent = bridge;
  // CSP must precede the bridge, which must precede every user script, including
  // scripts in <head>. Do not move any of the page's scripts relative to each other.
  policy.after(bridgeScript);

  if (scriptText) {
    const script = document.createElement('script');
    script.textContent = scriptText.replace(/<\/script/gi, '<\\/script');
    parsed.body.append(script);
  }

  // User-authored closing-tag text was escaped above. Keep this real style end tag
  // intact so the browser does not parse the rest of the document as stylesheet text.
  return `<!doctype html>\n${parsed.documentElement.outerHTML}`;
}
