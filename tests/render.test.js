import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Render from '../index.js';
import { buildPreviewDocument, PREVIEW_CSP } from '../site/preview-document.js';

function response({ ok = true, status = 200, statusText = 'OK', body = '' } = {}) {
  return { ok, status, statusText, text: async () => body };
}

beforeEach(() => {
  document.head.replaceChildren();
  document.body.innerHTML = '<button id="origin">Return focus</button><div id="host"><p>Keep until a successful response.</p></div><button id="menuTrigger">Menu</button>';
  Render.style_loaded = false;
  Render.style__ = null;
  Render.style_promise = null;
  vi.stubGlobal('fetch', vi.fn(async () => response({ body: '/* test component css */' })));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('editor preview document', () => {
  it('keeps the starter content and closes the injected stylesheet', () => {
    const source = buildPreviewDocument({
      html: '<!doctype html><html><head><title>Starter</title></head><body><main><h1>Hello, web.</h1></main></body></html>',
      css: 'body { color: rebeccapurple; }',
      javascript: "console.log('ready');"
    });
    const preview = new DOMParser().parseFromString(source, 'text/html');
    expect(preview.querySelector('main h1')?.textContent).toBe('Hello, web.');
    expect(preview.querySelector('style')?.textContent).toContain('rebeccapurple');
    expect(preview.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content).toBe(PREVIEW_CSP);
    expect(preview.querySelectorAll('style')).toHaveLength(1);
    expect(preview.body.textContent).toContain('Hello, web.');
  });

  it('escapes user closing tags without creating markup and removes navigation/CSP overrides', () => {
    const source = buildPreviewDocument({
      html: '<!doctype html><html><head><base href="https://bad.example/"><meta http-equiv="refresh" content="0;url=https://bad.example/"><meta http-equiv="Content-Security-Policy" content="default-src *"></head><body><p>Preview</p></body></html>',
      css: 'body::after { content: "</style><script>window.pwned = true</script>"; }',
      javascript: "console.log('</script><script>window.pwned = true</script>');"
    });
    const preview = new DOMParser().parseFromString(source, 'text/html');
    expect(preview.querySelectorAll('base, meta[http-equiv="refresh"], meta[http-equiv="Content-Security-Policy"]')).toHaveLength(1);
    expect(preview.querySelectorAll('meta[http-equiv="refresh"], base')).toHaveLength(0);
    expect(preview.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')).toHaveLength(1);
    expect(preview.querySelectorAll('script')).toHaveLength(1);
    expect(preview.querySelector('style')?.textContent).toContain('<\\/style');
    expect(preview.querySelector('script')?.textContent).toContain('<\\/script');
    expect(preview.body.textContent).toContain('Preview');
  });
});

describe('modal dialogs and confirmation', () => {
  it('settles a cancel action once, traps focus, inerts the page, and restores focus', async () => {
    const ui = new Render();
    await ui.ready;
    const trigger = document.querySelector('#origin');
    trigger.focus();
    const onCancel = vi.fn();
    const id = ui.msg_box({ action: { cancel: { callback: onCancel } } });
    const backdrop = document.getElementById(id);
    const close = backdrop.querySelector('.tchzr-msgb-close');
    expect(trigger.inert).toBe(true);
    expect(document.activeElement).toBe(backdrop.querySelector('.tchzr-msgba-confirm'));

    close.focus();
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(backdrop.querySelector('.tchzr-msgba-confirm'));
    close.click();
    close.click();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(document.getElementById(id)).toBeNull();
    expect(trigger.inert).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('accepts incomplete callbacks and can be destroyed without throwing', async () => {
    const ui = new Render();
    await ui.ready;
    const id = ui.msg_box({ action: { cancel: {} } });
    expect(() => document.querySelector('.tchzr-msgba-cancel').click()).not.toThrow();
    expect(() => ui.destroy(id)).not.toThrow();
  });

  it('returns true or false from confirm and invokes an optional callback once', async () => {
    const ui = new Render();
    await ui.ready;
    const accepted = ui.confirm({ confirmText: 'Continue' });
    document.querySelector('.tchzr-msgba-confirm').click();
    await expect(accepted).resolves.toBe(true);

    const onCancel = vi.fn();
    const declined = ui.confirm({ action: { cancel: { callback: onCancel } } });
    document.querySelector('.tchzr-msgba-cancel').click();
    await expect(declined).resolves.toBe(false);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('page loading', () => {
  it('keeps the host unchanged on HTTP failure and sanitizes successful remote markup by default', async () => {
    const ui = new Render();
    await ui.ready;
    const host = document.querySelector('#host');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ ok: false, status: 503, statusText: 'Unavailable' })));
    await expect(ui.page('/fail.html', host)).rejects.toThrow('503');
    expect(host.textContent).toContain('Keep until a successful response.');

    const onLoaded = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ body: '<h2 onclick="alert(1)">Hello</h2><script>alert(1)</script><a href="javascript:alert(1)">Unsafe link</a><img src="https://tracker.example/pixel">' })));
    await ui.page('/safe.html', host, onLoaded);
    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(host.querySelector('h2')?.hasAttribute('onclick')).toBe(false);
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(host.querySelector('img')?.hasAttribute('src')).toBe(false);
    expect(host.textContent).toContain('Hello');
  });

  it('passes AbortSignal to fetch and keeps explicit trusted HTML insertion opt-in', async () => {
    const ui = new Render();
    await ui.ready;
    const controller = new AbortController();
    const mockedFetch = vi.fn().mockResolvedValue(response({ body: '<button onclick="doSomething()">Trusted</button>' }));
    vi.stubGlobal('fetch', mockedFetch);
    await ui.page('/trusted.html', '#host', { signal: controller.signal, trustedHtml: true });
    expect(mockedFetch).toHaveBeenCalledWith('/trusted.html', { signal: controller.signal });
    expect(document.querySelector('#host button')?.getAttribute('onclick')).toBe('doSomething()');
  });
});

describe('navigation components', () => {
  it('opens and closes a drawer with focus containment and background restoration', async () => {
    const ui = new Render();
    await ui.ready;
    const trigger = document.querySelector('#origin');
    trigger.focus();
    const drawer = ui.drawer({ title: 'Help', content: 'Readable text', placement: 'right' });
    const panel = drawer.element.querySelector('[role="dialog"]');
    expect(trigger.inert).toBe(true);
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(drawer.element.textContent).toContain('Readable text');
    drawer.close();
    expect(drawer.element.hidden).toBe(true);
    expect(trigger.inert).toBe(false);
    expect(document.activeElement).toBe(trigger);
    drawer.open();
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(drawer.element.hidden).toBe(true);
    drawer.destroy();
    expect(document.getElementById(drawer.__id)).toBeNull();
  });

  it('supports menu arrow navigation, selection, focus restoration and listener cleanup', async () => {
    const ui = new Render();
    await ui.ready;
    const onSelect = vi.fn();
    const trigger = document.querySelector('#menuTrigger');
    const menu = ui.menu(trigger, { items: [{ label: 'First' }, { label: 'Second', onSelect }] });
    trigger.click();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(menu.element.children[0]);
    menu.element.children[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(menu.element.children[1]);
    menu.element.children[1].click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(menu.element.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
    menu.destroy();
    expect(trigger.hasAttribute('aria-controls')).toBe(false);
  });
});

describe('lifecycle management', () => {
  it('destroyAll only removes components owned by the current instance', async () => {
    const first = new Render();
    const second = new Render();
    await Promise.all([first.ready, second.ready]);
    const firstAlert = first.alert({ timeout: 0, msg: 'first' });
    const secondAlert = second.alert({ timeout: 0, msg: 'second' });
    const toast = first.toast({ message: 'Hello', duration: 0 });
    first.destroyAll();
    expect(document.getElementById(firstAlert)).toBeNull();
    expect(document.getElementById(toast.__id)).toBeNull();
    expect(document.getElementById(secondAlert)).not.toBeNull();
    second.destroyAll();
    expect(document.getElementById(secondAlert)).toBeNull();
  });
});
