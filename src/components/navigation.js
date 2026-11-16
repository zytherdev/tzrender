import { resolveMount } from '../components.js';

function text(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value);
}

function invoke(fn, ...args) {
  if (typeof fn !== 'function') return;
  try { fn(...args); }
  catch (error) { console.error('tzrender: component callback failed.', error); }
}

function makeRoot(owner, options, tag, className) {
  const mount = resolveMount(options.container);
  const id = owner.__id();
  const element = document.createElement(tag);
  element.id = id;
  element.className = className;
  mount.append(element);
  return { id, element };
}

function makeHandle(owner, id, element, cleanup = () => {}) {
  owner.__registerCleanup(id, () => { cleanup(); element.remove(); });
  return { __id: id, element, destroy: () => owner.destroy(id) };
}

function resolveElement(target) {
  if (typeof target === 'string') {
    const element = document.querySelector(target);
    if (!element) throw new Error(`tzrender: popover trigger not found: ${target}`);
    return element;
  }
  if (!(target instanceof Element)) throw new TypeError('tzrender: popover trigger must be a CSS selector or Element.');
  return target;
}

function safeHref(value) {
  if (typeof value !== 'string') return null;
  const href = value.trim();
  if (!href || href.startsWith('//') || /[\u0000-\u001f\u007f]/.test(href)) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(href) && !/^https?:/i.test(href)) return null;
  return href;
}

export function createPopover(owner, target, options = {}) {
  const trigger = resolveElement(target);
  const id = owner.__id();
  const original = {
    expanded: trigger.getAttribute('aria-expanded'),
    haspopup: trigger.getAttribute('aria-haspopup'),
    controls: trigger.getAttribute('aria-controls')
  };
  const panel = document.createElement('section');
  panel.id = id;
  panel.className = `tzr-popover tzr-popover--${options.theme === 'light' ? 'light' : 'dark'}`;
  panel.setAttribute('role', 'dialog');
  panel.tabIndex = -1;
  const title = text(options.title, '');
  if (title) {
    const heading = document.createElement('h2');
    heading.className = 'tzr-popover__title';
    heading.id = `${id}-title`;
    heading.textContent = title;
    panel.setAttribute('aria-labelledby', heading.id);
    panel.append(heading);
  } else {
    panel.setAttribute('aria-label', text(options.label, 'Popover'));
  }
  const body = document.createElement('div');
  body.className = 'tzr-popover__body';
  if (options.content instanceof Node) body.append(options.content.cloneNode(true));
  else body.textContent = text(options.content, '');
  panel.append(body);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'tzr-popover__close';
  closeButton.setAttribute('aria-label', text(options.closeLabel, 'Close popover'));
  closeButton.textContent = '×';
  panel.append(closeButton);
  panel.hidden = true;
  resolveMount(options.container).append(panel);

  const placement = ['top', 'right', 'bottom', 'left'].includes(options.placement) ? options.placement : 'bottom';
  const offset = Math.min(32, Math.max(0, Number(options.offset) || 8));
  let opened = false;
  let destroyed = false;
  const previousFocus = () => trigger.focus?.({ preventScroll: true });

  function position() {
    const rect = trigger.getBoundingClientRect();
    const popover = panel.getBoundingClientRect();
    const gap = offset;
    let top = placement === 'top' ? rect.top - popover.height - gap
      : placement === 'bottom' ? rect.bottom + gap
        : rect.top + (rect.height - popover.height) / 2;
    let left = placement === 'left' ? rect.left - popover.width - gap
      : placement === 'right' ? rect.right + gap
        : rect.left + (rect.width - popover.width) / 2;
    if (placement === 'top' && top < 8) top = rect.bottom + gap;
    if (placement === 'bottom' && top + popover.height > window.innerHeight - 8) top = Math.max(8, rect.top - popover.height - gap);
    if (placement === 'left' && left < 8) left = rect.right + gap;
    if (placement === 'right' && left + popover.width > window.innerWidth - 8) left = Math.max(8, rect.left - popover.width - gap);
    panel.style.top = `${Math.max(8, Math.min(window.innerHeight - popover.height - 8, top))}px`;
    panel.style.left = `${Math.max(8, Math.min(window.innerWidth - popover.width - 8, left))}px`;
  }

  function setOpen(value, restore = false) {
    opened = Boolean(value) && !destroyed;
    panel.hidden = !opened;
    trigger.setAttribute('aria-expanded', String(opened));
    if (opened) {
      position();
      const focusable = panel.querySelector('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])');
      (focusable || panel).focus({ preventScroll: true });
    } else if (restore) previousFocus();
    return opened;
  }

  const onTriggerClick = () => setOpen(!opened);
  const onCloseClick = () => setOpen(false, true);
  const onDocumentPointer = (event) => {
    if (opened && !panel.contains(event.target) && !trigger.contains(event.target)) setOpen(false);
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape' && opened && options.closeOnEscape !== false) {
      event.preventDefault();
      setOpen(false, true);
    }
  };
  const onResize = () => { if (opened) position(); };
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-controls', id);
  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', onTriggerClick);
  closeButton.addEventListener('click', onCloseClick);
  document.addEventListener('pointerdown', onDocumentPointer, true);
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onResize, true);
  const handle = makeHandle(owner, id, panel, () => {
    destroyed = true;
    if (opened) previousFocus();
    trigger.removeEventListener('click', onTriggerClick);
    closeButton.removeEventListener('click', onCloseClick);
    document.removeEventListener('pointerdown', onDocumentPointer, true);
    document.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onResize, true);
    for (const [attribute, value] of [['aria-expanded', original.expanded], ['aria-haspopup', original.haspopup], ['aria-controls', original.controls]]) {
      if (value === null) trigger.removeAttribute(attribute);
      else trigger.setAttribute(attribute, value);
    }
  });
  return {
    ...handle,
    open() { return setOpen(true); },
    close() { return setOpen(false, true); },
    toggle() { return setOpen(!opened); },
    get isOpen() { return opened; }
  };
}

function clampPage(value, total) {
  const page = Math.trunc(Number(value));
  if (!Number.isFinite(page)) return 1;
  return Math.min(total, Math.max(1, page));
}

function pageSequence(current, total, boundaryCount, siblingCount) {
  const selected = new Set();
  for (let page = 1; page <= Math.min(total, boundaryCount); page += 1) selected.add(page);
  for (let page = Math.max(1, total - boundaryCount + 1); page <= total; page += 1) selected.add(page);
  for (let page = Math.max(1, current - siblingCount); page <= Math.min(total, current + siblingCount); page += 1) selected.add(page);
  const sorted = [...selected].sort((a, b) => a - b);
  const output = [];
  for (const page of sorted) {
    const previous = output.at(-1);
    if (typeof previous === 'number' && page - previous === 2) output.push(page - 1);
    else if (typeof previous === 'number' && page - previous > 2) output.push('ellipsis');
    output.push(page);
  }
  return output;
}

export function createPagination(owner, options = {}) {
  const pageSize = Math.max(1, Math.trunc(Number(options.pageSize) || 10));
  const initialTotal = options.totalPages !== undefined
    ? Math.trunc(Number(options.totalPages))
    : Math.ceil(Math.max(0, Number(options.totalItems) || 0) / pageSize);
  let totalPages = Math.max(1, Math.min(1_000_000, Number.isFinite(initialTotal) ? initialTotal : 1));
  let currentPage = clampPage(options.currentPage ?? options.page ?? 1, totalPages);
  const { id, element: nav } = makeRoot(owner, options, 'nav', `tzr-pagination ${options.theme === 'dark' ? 'tzr-pagination--dark' : 'tzr-pagination--light'}`);
  nav.setAttribute('aria-label', text(options.label, 'Pagination'));
  const list = document.createElement('div');
  list.className = 'tzr-pagination__list';
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', text(options.label, 'Pagination'));
  nav.append(list);
  const boundaryCount = Math.min(3, Math.max(0, Math.trunc(Number(options.boundaryCount ?? 1)) || 0));
  const siblingCount = Math.min(3, Math.max(0, Math.trunc(Number(options.siblingCount ?? 1)) || 0));
  let handle;

  function moveTo(page, { user = false, focus = false } = {}) {
    const next = clampPage(page, totalPages);
    if (next === currentPage) return false;
    currentPage = next;
    render();
    if (focus) list.querySelector(`[data-page="${next}"]`)?.focus();
    if (user) callback(options.onChange, currentPage, handle);
    return true;
  }
  function button(label, page, disabled, kind = 'page') {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `tzr-pagination__button tzr-pagination__button--${kind}`;
    item.textContent = label;
    item.disabled = disabled;
    item.setAttribute('aria-label', label);
    if (kind === 'page') {
      item.dataset.page = String(page);
      item.setAttribute('aria-label', `Page ${page}`);
      if (page === currentPage) item.setAttribute('aria-current', 'page');
    }
    item.addEventListener('click', () => moveTo(page, { user: true, focus: true }));
    list.append(item);
  }
  function render() {
    list.replaceChildren();
    if (options.showFirstLast === true) button(text(options.firstLabel, 'First'), 1, currentPage === 1, 'boundary');
    button(text(options.previousLabel, 'Previous'), currentPage - 1, currentPage === 1, 'previous');
    for (const page of pageSequence(currentPage, totalPages, boundaryCount, siblingCount)) {
      if (page === 'ellipsis') {
        const dots = document.createElement('span');
        dots.className = 'tzr-pagination__ellipsis';
        dots.setAttribute('aria-hidden', 'true');
        dots.textContent = '…';
        list.append(dots);
      } else button(String(page), page, page === currentPage);
    }
    button(text(options.nextLabel, 'Next'), currentPage + 1, currentPage === totalPages, 'next');
    if (options.showFirstLast === true) button(text(options.lastLabel, 'Last'), totalPages, currentPage === totalPages, 'boundary');
  }
  function setTotalPages(value) {
    const number = Math.trunc(Number(value));
    if (!Number.isFinite(number) || number < 1) return false;
    totalPages = Math.min(1_000_000, number);
    currentPage = clampPage(currentPage, totalPages);
    render();
    return true;
  }
  handle = makeHandle(owner, id, nav);
  render();
  return {
    ...handle,
    setPage(value) { return moveTo(value); },
    setTotalPages,
    get page() { return currentPage; },
    get totalPages() { return totalPages; },
    get pageSize() { return pageSize; }
  };
}

export function createBreadcrumb(owner, options = {}) {
  const { id, element: nav } = makeRoot(owner, options, 'nav', `tzr-breadcrumb ${options.theme === 'dark' ? 'tzr-breadcrumb--dark' : 'tzr-breadcrumb--light'}`);
  nav.setAttribute('aria-label', text(options.label, 'Breadcrumb'));
  const list = document.createElement('ol');
  list.className = 'tzr-breadcrumb__list';
  nav.append(list);
  let items = [];

  function normalize(itemsValue) {
    if (!Array.isArray(itemsValue) || itemsValue.length < 1 || itemsValue.length > 20) throw new TypeError('tzrender: breadcrumb requires between 1 and 20 items.');
    return itemsValue.map((item, index) => ({
      label: text(item?.label, `Step ${index + 1}`),
      href: safeHref(item?.href),
      current: item?.current === true
    }));
  }
  function render() {
    list.replaceChildren();
    const declared = items.findIndex((item) => item.current);
    const currentIndex = declared >= 0 ? declared : items.length - 1;
    items.forEach((item, index) => {
      const row = document.createElement('li');
      row.className = 'tzr-breadcrumb__item';
      const current = index === currentIndex;
      if (current) {
        const currentLabel = document.createElement('span');
        currentLabel.textContent = item.label;
        currentLabel.setAttribute('aria-current', 'page');
        row.append(currentLabel);
      } else if (item.href) {
        const link = document.createElement('a');
        link.href = item.href;
        link.textContent = item.label;
        row.append(link);
      } else {
        const label = document.createElement('span');
        label.textContent = item.label;
        row.append(label);
      }
      list.append(row);
      if (index < items.length - 1) {
        const separator = document.createElement('li');
        separator.className = 'tzr-breadcrumb__separator';
        separator.setAttribute('aria-hidden', 'true');
        separator.textContent = text(options.separator, '/');
        list.append(separator);
      }
    });
  }
  function setItems(nextItems) {
    items = normalize(nextItems);
    render();
    return items.map((item) => ({ ...item }));
  }
  const handle = makeHandle(owner, id, nav);
  setItems(options.items || []);
  return { ...handle, setItems, get items() { return items.map((item) => ({ ...item })); } };
}
