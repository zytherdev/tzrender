import { resolveMount } from '../components.js';

function text(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value);
}

function callback(fn, ...args) {
  if (typeof fn !== 'function') return;
  try { fn(...args); }
  catch (error) { console.error('tzrender: component callback failed.', error); }
}

function createRoot(owner, options, tag, className) {
  const mount = resolveMount(options.container);
  const id = owner.__id();
  const element = document.createElement(tag);
  element.id = id;
  element.className = className;
  mount.append(element);
  return { id, element };
}

function register(owner, id, element, cleanup = () => {}) {
  owner.__registerCleanup(id, () => { cleanup(); element.remove(); });
  return { __id: id, element, destroy: () => owner.destroy(id) };
}

export function createCopyButton(owner, options = {}) {
  const { id, element: root } = createRoot(owner, options, 'div', `tzr-copy ${options.theme === 'dark' ? 'tzr-copy--dark' : 'tzr-copy--light'}`);
  let value = text(options.text ?? options.value, '');
  let copied = false;
  let destroyed = false;
  let timer = 0;
  let pending = null;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tzr-copy__button';
  button.textContent = text(options.label, 'Copy');
  button.setAttribute('aria-label', text(options.ariaLabel, `Copy ${text(options.description, 'text')}`));
  button.disabled = options.disabled === true;
  const status = document.createElement('span');
  status.className = 'tzr-copy__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = '';
  root.append(button, status);

  function setCopied(next) {
    copied = Boolean(next);
    root.dataset.copied = String(copied);
    status.textContent = copied ? text(options.copiedLabel, 'Copied') : '';
    button.textContent = copied ? text(options.copiedLabel, 'Copied') : text(options.label, 'Copy');
    clearTimeout(timer);
    if (copied && Number(options.resetAfter ?? 1800) > 0) {
      timer = window.setTimeout(() => setCopied(false), Math.min(30_000, Number(options.resetAfter ?? 1800)));
    }
  }
  async function copy() {
    if (destroyed || button.disabled) return false;
    if (pending) return pending;
    pending = (async () => {
      try {
        if (!globalThis.navigator?.clipboard?.writeText) throw new Error('Clipboard access is unavailable. Use a secure HTTPS page and try again.');
        await globalThis.navigator.clipboard.writeText(value);
        if (destroyed) return false;
        setCopied(true);
        callback(options.onCopy, value, handle);
        return true;
      } catch (error) {
        if (!destroyed) {
          status.textContent = text(options.errorLabel, 'Could not copy.');
          callback(options.onError, error, handle);
        }
        return false;
      } finally {
        pending = null;
      }
    })();
    return pending;
  }
  const onClick = () => { void copy(); };
  button.addEventListener('click', onClick);
  const handle = register(owner, id, root, () => {
    destroyed = true;
    clearTimeout(timer);
    button.removeEventListener('click', onClick);
  });
  return {
    ...handle,
    copy,
    setText(next) { value = text(next, ''); setCopied(false); return value; },
    get text() { return value; },
    get copied() { return copied; },
    set disabled(next) { button.disabled = Boolean(next); },
    get disabled() { return button.disabled; }
  };
}

function safeImageSource(source, allowCrossOrigin) {
  if (typeof source !== 'string' || !source.trim()) return null;
  try {
    const url = new URL(source.trim(), document.baseURI);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!allowCrossOrigin && url.origin !== location.origin) return null;
    return url.href;
  } catch {
    return null;
  }
}

function initials(name) {
  const parts = text(name, 'Avatar').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => [...part][0]?.toLocaleUpperCase() || '').join('') || '?';
}

export function createAvatar(owner, options = {}) {
  const { id, element: root } = createRoot(owner, options, 'span', `tzr-avatar tzr-avatar--${options.shape === 'square' ? 'square' : 'circle'}`);
  const name = text(options.name ?? options.alt, 'Avatar').trim() || 'Avatar';
  const size = Math.min(256, Math.max(24, Math.round(Number(options.size) || 48)));
  root.style.setProperty('--tzr-avatar-size', `${size}px`);
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', name);
  const fallback = document.createElement('span');
  fallback.className = 'tzr-avatar__fallback';
  fallback.setAttribute('aria-hidden', 'true');
  const image = document.createElement('img');
  image.className = 'tzr-avatar__image';
  image.alt = '';
  image.referrerPolicy = 'no-referrer';
  image.decoding = 'async';
  image.hidden = true;
  root.append(fallback, image);
  let currentName = name;
  let currentSource = null;
  const updateFallback = () => { fallback.textContent = initials(currentName); };
  updateFallback();
  function setName(next) {
    currentName = text(next, 'Avatar').trim() || 'Avatar';
    root.setAttribute('aria-label', currentName);
    updateFallback();
    return currentName;
  }
  function setSource(next) {
    const url = safeImageSource(next, options.allowCrossOrigin === true);
    if (!url && next) return false;
    currentSource = url;
    image.hidden = !url;
    fallback.hidden = Boolean(url);
    image.removeAttribute('src');
    if (url) image.src = url;
    return true;
  }
  const onImageError = () => {
    image.hidden = true;
    fallback.hidden = false;
    image.removeAttribute('src');
    currentSource = null;
  };
  image.addEventListener('error', onImageError);
  const handle = register(owner, id, root, () => image.removeEventListener('error', onImageError));
  if (options.src) setSource(options.src);
  return {
    ...handle,
    setName,
    setSource,
    get name() { return currentName; },
    get src() { return currentSource; }
  };
}

export function createBadge(owner, options = {}) {
  const variants = ['neutral', 'primary', 'success', 'warning', 'danger', 'info'];
  const sizes = ['small', 'medium', 'large'];
  const themeClass = options.theme === 'light' || options.theme === 'dark' ? ` tzr-badge--${options.theme}` : '';
  const { id, element: badge } = createRoot(owner, options, 'span', `tzr-badge${themeClass}`);
  let variant = variants.includes(options.variant) ? options.variant : 'neutral';
  let size = sizes.includes(options.size) ? options.size : 'medium';
  badge.classList.add(`tzr-badge--${variant}`, `tzr-badge--${size}`);
  badge.textContent = text(options.text ?? options.label, 'Status');
  if (options.announce === true) {
    badge.setAttribute('role', options.assertive === true ? 'alert' : 'status');
    badge.setAttribute('aria-live', options.assertive === true ? 'assertive' : 'polite');
  }
  function setVariant(next) {
    variant = variants.includes(next) ? next : 'neutral';
    for (const item of variants) badge.classList.toggle(`tzr-badge--${item}`, item === variant);
    return variant;
  }
  function setSize(next) {
    size = sizes.includes(next) ? next : 'medium';
    for (const item of sizes) badge.classList.toggle(`tzr-badge--${item}`, item === size);
    return size;
  }
  const handle = register(owner, id, badge);
  return {
    ...handle,
    setText(next) { badge.textContent = text(next, ''); return badge.textContent; },
    setVariant,
    setSize,
    setVisible(visible) { badge.hidden = !visible; },
    get text() { return badge.textContent; },
    get variant() { return variant; },
    get size() { return size; },
    get visible() { return !badge.hidden; }
  };
}
