const VALID_THEMES = new Set(['light', 'dark']);
const VALID_PLACEMENTS = new Set(['top', 'right', 'bottom', 'left']);
const VALID_POSITIONS = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);

function themeClass(theme) {
  return VALID_THEMES.has(theme) ? theme : 'dark';
}

function resolveMount(target) {
  if (!target) return document.body;
  if (typeof target === 'string') {
    const element = document.querySelector(target);
    if (!element) throw new Error(`tzrender: mount target not found: ${target}`);
    return element;
  }
  if (target instanceof Element) return target;
  throw new TypeError('tzrender: container must be a CSS selector or an Element.');
}

function appendContent(container, content) {
  if (content instanceof Node) {
    container.append(content.cloneNode(true));
  } else {
    container.textContent = String(content ?? '');
  }
}

export function createToast(owner, options = {}) {
  const id = owner.__id();
  const variant = ['info', 'success', 'warning', 'error'].includes(options.variant) ? options.variant : 'info';
  const position = VALID_POSITIONS.has(options.position) ? options.position : 'bottom-right';
  const theme = themeClass(options.theme);
  const duration = Math.max(0, Number(options.duration ?? options.timeout ?? 4000) || 0);
  let region = document.querySelector(`.tzr-toast-region[data-position="${position}"]`);

  if (!region) {
    region = document.createElement('div');
    region.className = `tzr-toast-region tzr-toast-region--${position}`;
    region.dataset.position = position;
    region.setAttribute('aria-label', 'Notifications');
    document.body.append(region);
  }

  const toast = document.createElement('article');
  toast.id = id;
  toast.className = `tzr-toast tzr-toast--${theme} tzr-toast--${variant}`;
  toast.setAttribute('role', variant === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', variant === 'error' ? 'assertive' : 'polite');

  const content = document.createElement('div');
  content.className = 'tzr-toast__content';
  if (options.title) {
    const heading = document.createElement('strong');
    heading.className = 'tzr-toast__title';
    heading.textContent = String(options.title);
    content.append(heading);
  }

  const message = document.createElement('p');
  message.className = 'tzr-toast__message';
  message.textContent = String(options.message ?? options.msg ?? '');
  content.append(message);
  toast.append(content);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'tzr-toast__close';
  closeButton.setAttribute('aria-label', options.closeLabel || 'Dismiss notification');
  closeButton.textContent = '×';
  toast.append(closeButton);

  if (options.action && typeof options.action.onClick === 'function') {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'tzr-toast__action';
    action.textContent = String(options.action.label || 'Action');
    action.addEventListener('click', options.action.onClick);
    toast.append(action);
  }

  let timer = null;
  let remaining = duration;
  let startedAt = 0;
  let hovered = false;
  let focused = false;
  const dismiss = () => owner.destroy(id);
  const startTimer = () => {
    if (remaining <= 0 || timer !== null) return;
    startedAt = Date.now();
    timer = window.setTimeout(dismiss, remaining);
  };
  const pauseTimer = () => {
    if (timer === null) return;
    window.clearTimeout(timer);
    timer = null;
    remaining = Math.max(0, remaining - (Date.now() - startedAt));
  };

  const resumeIfInactive = () => { if (!hovered && !focused) startTimer(); };
  const onPointerEnter = () => { hovered = true; pauseTimer(); };
  const onPointerLeave = () => { hovered = false; resumeIfInactive(); };
  const onFocusIn = () => { focused = true; pauseTimer(); };
  const onFocusOut = (event) => {
    if (!toast.contains(event.relatedTarget)) {
      focused = false;
      resumeIfInactive();
    }
  };
  toast.addEventListener('pointerenter', onPointerEnter);
  toast.addEventListener('pointerleave', onPointerLeave);
  toast.addEventListener('focusin', onFocusIn);
  toast.addEventListener('focusout', onFocusOut);
  closeButton.addEventListener('click', dismiss);
  region.append(toast);
  startTimer();

  owner.__registerCleanup(id, () => {
    pauseTimer();
    toast.removeEventListener('pointerenter', onPointerEnter);
    toast.removeEventListener('pointerleave', onPointerLeave);
    toast.removeEventListener('focusin', onFocusIn);
    toast.removeEventListener('focusout', onFocusOut);
    toast.remove();
    if (region.isConnected && region.childElementCount === 0) region.remove();
  });

  return { __id: id, element: toast, dismiss, destroy: dismiss };
}

export function createTooltip(owner, target, options = {}) {
  const trigger = typeof target === 'string' ? document.querySelector(target) : target;
  if (!(trigger instanceof Element)) {
    throw new TypeError('tzrender.tooltip: target must be a CSS selector or an Element.');
  }

  const id = owner.__id();
  const placement = VALID_PLACEMENTS.has(options.placement) ? options.placement : 'top';
  const tooltip = document.createElement('div');
  tooltip.id = id;
  tooltip.className = `tzr-tooltip tzr-tooltip--${placement}`;
  tooltip.setAttribute('role', 'tooltip');
  tooltip.textContent = String(options.content ?? options.text ?? '');
  tooltip.hidden = true;
  document.body.append(tooltip);

  const previousDescription = trigger.getAttribute('aria-describedby');
  const describedBy = new Set((previousDescription || '').split(/\s+/).filter(Boolean));
  describedBy.add(id);
  trigger.setAttribute('aria-describedby', Array.from(describedBy).join(' '));
  let visible = false;
  let hovering = false;
  let focused = false;

  const positionTooltip = () => {
    if (!visible) return;
    const rect = trigger.getBoundingClientRect();
    const tip = tooltip.getBoundingClientRect();
    const gap = 10;
    let top = rect.top - tip.height - gap;
    let left = rect.left + rect.width / 2 - tip.width / 2;
    if (placement === 'bottom') top = rect.bottom + gap;
    if (placement === 'left') {
      top = rect.top + rect.height / 2 - tip.height / 2;
      left = rect.left - tip.width - gap;
    }
    if (placement === 'right') {
      top = rect.top + rect.height / 2 - tip.height / 2;
      left = rect.right + gap;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - tip.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - tip.height - 8));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };
  const show = () => {
    visible = true;
    tooltip.hidden = false;
    tooltip.classList.add('tzr-tooltip--visible');
    positionTooltip();
  };
  const hide = () => {
    visible = false;
    tooltip.hidden = true;
    tooltip.classList.remove('tzr-tooltip--visible');
  };
  const onPointerEnter = () => { hovering = true; show(); };
  const onPointerLeave = () => { hovering = false; if (!focused) hide(); };
  const onFocus = () => { focused = true; show(); };
  const onBlur = () => { focused = false; if (!hovering) hide(); };
  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      focused = false;
      hide();
    }
  };
  const onPositionChange = () => positionTooltip();
  trigger.addEventListener('pointerenter', onPointerEnter);
  trigger.addEventListener('pointerleave', onPointerLeave);
  trigger.addEventListener('focus', onFocus);
  trigger.addEventListener('blur', onBlur);
  trigger.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onPositionChange);
  window.addEventListener('scroll', onPositionChange, true);

  owner.__registerCleanup(id, () => {
    trigger.removeEventListener('pointerenter', onPointerEnter);
    trigger.removeEventListener('pointerleave', onPointerLeave);
    trigger.removeEventListener('focus', onFocus);
    trigger.removeEventListener('blur', onBlur);
    trigger.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onPositionChange);
    window.removeEventListener('scroll', onPositionChange, true);
    const remaining = new Set((trigger.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    remaining.delete(id);
    if (remaining.size) trigger.setAttribute('aria-describedby', Array.from(remaining).join(' '));
    else trigger.removeAttribute('aria-describedby');
    tooltip.remove();
  });

  return { __id: id, element: tooltip, show, hide, destroy: () => owner.destroy(id) };
}

export function createAccordion(owner, options = {}) {
  const items = Array.isArray(options.items) ? options.items : [];
  if (!items.length) throw new TypeError('tzrender.accordion: provide at least one item.');
  const id = owner.__id();
  const root = document.createElement('div');
  root.id = id;
  root.className = `tzr-accordion tzr-accordion--${themeClass(options.theme)}`;
  root.setAttribute('data-tzr-accordion', '');
  const multiple = options.multiple === true;
  const entries = [];

  items.forEach((item, index) => {
    const entryId = `${id}-item-${index + 1}`;
    const entry = document.createElement('section');
    entry.className = 'tzr-accordion__item';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tzr-accordion__trigger';
    button.id = `${entryId}-trigger`;
    button.setAttribute('aria-controls', `${entryId}-panel`);
    button.setAttribute('aria-expanded', 'false');
    button.textContent = String(item.title ?? `Item ${index + 1}`);

    const panel = document.createElement('div');
    panel.className = 'tzr-accordion__panel';
    panel.id = `${entryId}-panel`;
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-labelledby', button.id);
    panel.hidden = true;
    appendContent(panel, item.content);

    button.addEventListener('click', () => {
      const shouldOpen = button.getAttribute('aria-expanded') !== 'true';
      if (shouldOpen && !multiple) entries.forEach((other) => setOpen(other, false));
      setOpen(entries[index], shouldOpen);
    });
    entry.append(button, panel);
    root.append(entry);
    entries.push({ button, panel });
  });

  function setOpen(entry, open) {
    if (!entry) return;
    entry.button.setAttribute('aria-expanded', String(open));
    entry.panel.hidden = !open;
    entry.panel.classList.toggle('tzr-accordion__panel--open', open);
  }

  items.forEach((item, index) => {
    if (item.open && (multiple || !entries.some((entry, prior) => prior < index && items[prior].open))) setOpen(entries[index], true);
  });
  resolveMount(options.container).append(root);
  owner.__registerCleanup(id, () => root.remove());

  return {
    __id: id,
    element: root,
    open: (index) => {
      if (!multiple) entries.forEach((entry, entryIndex) => { if (entryIndex !== index) setOpen(entry, false); });
      setOpen(entries[index], true);
    },
    close: (index) => setOpen(entries[index], false),
    destroy: () => owner.destroy(id)
  };
}

export function createTabs(owner, options = {}) {
  const items = Array.isArray(options.items) ? options.items : [];
  if (!items.length) throw new TypeError('tzrender.tabs: provide at least one tab.');
  const id = owner.__id();
  const root = document.createElement('div');
  root.id = id;
  root.className = `tzr-tabs tzr-tabs--${themeClass(options.theme)}`;
  const tablist = document.createElement('div');
  tablist.className = 'tzr-tabs__list';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', options.label || 'Content tabs');
  const panelHost = document.createElement('div');
  panelHost.className = 'tzr-tabs__panels';
  const entries = [];
  let activeIndex = Math.max(0, Math.min(Number(options.activeIndex) || 0, items.length - 1));

  items.forEach((item, index) => {
    const tabId = `${id}-tab-${index + 1}`;
    const panelId = `${id}-panel-${index + 1}`;
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tzr-tabs__tab';
    tab.id = tabId;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panelId);
    tab.textContent = String(item.label ?? `Tab ${index + 1}`);

    const panel = document.createElement('div');
    panel.className = 'tzr-tabs__panel';
    panel.id = panelId;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tabId);
    panel.tabIndex = 0;
    appendContent(panel, item.content);

    tab.addEventListener('click', () => select(index));
    tablist.append(tab);
    panelHost.append(panel);
    entries.push({ tab, panel });
  });

  function select(index, moveFocus = false) {
    if (!Number.isInteger(index) || index < 0 || index >= entries.length) return;
    activeIndex = index;
    entries.forEach((entry, entryIndex) => {
      const active = entryIndex === activeIndex;
      entry.tab.setAttribute('aria-selected', String(active));
      entry.tab.tabIndex = active ? 0 : -1;
      entry.panel.hidden = !active;
    });
    if (moveFocus) entries[activeIndex].tab.focus();
  }

  tablist.addEventListener('keydown', (event) => {
    let next = activeIndex;
    if (event.key === 'ArrowRight') next = (activeIndex + 1) % entries.length;
    else if (event.key === 'ArrowLeft') next = (activeIndex - 1 + entries.length) % entries.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = entries.length - 1;
    else return;
    event.preventDefault();
    select(next, true);
  });

  root.append(tablist, panelHost);
  select(activeIndex);
  resolveMount(options.container).append(root);
  owner.__registerCleanup(id, () => root.remove());
  return { __id: id, element: root, select, destroy: () => owner.destroy(id), get activeIndex() { return activeIndex; } };
}


export function createProgress(owner, options = {}) {
  const id = owner.__id();
  const variant = options.variant === 'ring' ? 'ring' : 'bar';
  const theme = themeClass(options.theme);
  const root = document.createElement('div');
  root.id = id;
  root.className = `tzr-progress tzr-progress--${variant} tzr-progress--${theme}`;
  if (options.color) root.style.setProperty('--tzr-progress-color', String(options.color));

  const label = document.createElement('span');
  label.className = 'tzr-progress__label';
  label.textContent = String(options.label || 'Loading progress');
  label.id = `${id}-label`;
  const track = document.createElement('div');
  track.className = 'tzr-progress__track';
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', String(options.label || 'Loading progress'));
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  const fill = document.createElement('span');
  fill.className = 'tzr-progress__fill';
  track.append(fill);
  const valueText = document.createElement('span');
  valueText.className = 'tzr-progress__value';
  valueText.hidden = options.showValue !== true;
  root.append(label, track, valueText);

  let indeterminate = options.indeterminate === true;
  let currentValue = 0;
  const set = (value, nextLabel) => {
    if (nextLabel !== undefined) {
      label.textContent = String(nextLabel);
      track.setAttribute('aria-label', String(nextLabel));
    }
    if (value === null || value === undefined) {
      indeterminate = true;
    } else {
      const number = Number(value);
      currentValue = Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
      indeterminate = false;
    }
    root.classList.toggle('tzr-progress--indeterminate', indeterminate);
    if (indeterminate) {
      track.removeAttribute('aria-valuenow');
      track.setAttribute('aria-busy', 'true');
      fill.style.width = '';
      root.style.setProperty('--tzr-progress-value', '25%');
      valueText.textContent = '';
    } else {
      track.removeAttribute('aria-busy');
      track.setAttribute('aria-valuenow', String(currentValue));
      if (variant === 'bar') fill.style.width = `${currentValue}%`;
      else fill.style.removeProperty('width');
      root.style.setProperty('--tzr-progress-value', `${currentValue}%`);
      valueText.textContent = `${Math.round(currentValue)}%`;
    }
  };

  resolveMount(options.container).append(root);
  set(options.indeterminate ? null : options.value ?? 0);
  owner.__registerCleanup(id, () => root.remove());
  return { __id: id, element: root, set, destroy: () => owner.destroy(id), get value() { return currentValue; } };
}

export function createSkeleton(owner, options = {}) {
  const id = owner.__id();
  const variant = ['text', 'circle', 'card', 'image'].includes(options.variant) ? options.variant : 'text';
  const theme = themeClass(options.theme);
  const root = document.createElement('div');
  root.id = id;
  root.className = `tzr-skeleton tzr-skeleton--${variant} tzr-skeleton--${theme}${options.animated === false ? ' tzr-skeleton--static' : ''}`;
  root.setAttribute('aria-hidden', 'true');
  root.style.width = String(options.width || (variant === 'circle' ? '3.5rem' : '100%'));
  if (options.height && variant !== 'card') root.style.height = String(options.height);

  if (variant === 'text') {
    const rows = Math.max(1, Math.min(12, Math.floor(Number(options.rows) || 3)));
    for (let index = 0; index < rows; index += 1) {
      const line = document.createElement('span');
      line.className = 'tzr-skeleton__line';
      if (index === rows - 1 && rows > 1) line.style.width = '72%';
      root.append(line);
    }
  } else if (variant === 'circle') {
    root.classList.add('tzr-skeleton__shape');
    root.style.aspectRatio = '1';
    root.style.height = String(options.height || options.width || '3.5rem');
  } else if (variant === 'image') {
    root.classList.add('tzr-skeleton__shape');
    root.style.aspectRatio = '16 / 9';
    if (!options.height) root.style.height = 'auto';
  } else {
    const image = document.createElement('span');
    image.className = 'tzr-skeleton__image';
    image.style.height = String(options.height || '9rem');
    const title = document.createElement('span');
    title.className = 'tzr-skeleton__line tzr-skeleton__line--title';
    const copy = document.createElement('span');
    copy.className = 'tzr-skeleton__line';
    const copyShort = document.createElement('span');
    copyShort.className = 'tzr-skeleton__line';
    copyShort.style.width = '68%';
    root.append(image, title, copy, copyShort);
  }

  resolveMount(options.container).append(root);
  owner.__registerCleanup(id, () => root.remove());
  return { __id: id, element: root, destroy: () => owner.destroy(id) };
}

export function createDrawer(owner, options = {}) {
  const id = owner.__id();
  const theme = themeClass(options.theme);
  const placement = ['left', 'right', 'bottom'].includes(options.placement) ? options.placement : 'right';
  const root = document.createElement('div');
  root.id = id;
  root.className = `tzr-drawer-backdrop tzr-drawer-backdrop--${theme}`;
  root.dataset.placement = placement;

  const panel = document.createElement('aside');
  panel.className = `tzr-drawer tzr-drawer--${theme} tzr-drawer--${placement}`;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.tabIndex = -1;
  if (options.title) {
    const title = document.createElement('h2');
    title.id = `${id}-title`;
    title.className = 'tzr-drawer__title';
    title.textContent = String(options.title);
    panel.setAttribute('aria-labelledby', title.id);
    panel.append(title);
  } else {
    panel.setAttribute('aria-label', String(options.label || 'Side panel'));
  }

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'tzr-drawer__close';
  closeButton.setAttribute('aria-label', String(options.closeLabel || 'Close panel'));
  closeButton.textContent = '×';
  panel.append(closeButton);

  const body = document.createElement('div');
  body.className = 'tzr-drawer__body';
  appendContent(body, options.content ?? '');
  panel.append(body);
  root.append(panel);

  const previouslyFocused = document.activeElement;
  let inerted = [];
  let open = true;
  const setBackgroundInert = (value) => {
    if (value) {
      if (inerted.length) return;
      inerted = [...document.body.children].filter((element) => element !== root).map((element) => [element, Boolean(element.inert)]);
      inerted.forEach(([element]) => { element.inert = true; });
    } else {
      inerted.forEach(([element, wasInert]) => { if (element.isConnected) element.inert = wasInert; });
      inerted = [];
    }
  };
  const focusables = () => [...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
  const focusPanel = () => (focusables()[0] || panel).focus();
  const close = () => {
    if (!open) return;
    open = false;
    root.hidden = true;
    setBackgroundInert(false);
    if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus();
  };
  const openPanel = () => {
    if (open) return;
    open = true;
    root.hidden = false;
    setBackgroundInert(true);
    focusPanel();
  };
  const onKeyDown = (event) => {
    if (!open) return;
    if (event.key === 'Escape' && options.closeOnEscape !== false) {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      const nodes = focusables();
      if (!nodes.length) {
        event.preventDefault();
        panel.focus();
      } else if (event.shiftKey && (document.activeElement === nodes[0] || !panel.contains(document.activeElement))) {
        event.preventDefault();
        nodes.at(-1).focus();
      } else if (!event.shiftKey && (document.activeElement === nodes.at(-1) || !panel.contains(document.activeElement))) {
        event.preventDefault();
        nodes[0].focus();
      }
    }
  };
  const onBackdrop = (event) => {
    if (event.target === root && options.closeOnBackdrop === true) close();
  };
  const onFocusIn = (event) => {
    if (open && !panel.contains(event.target)) focusPanel();
  };
  closeButton.addEventListener('click', close);
  root.addEventListener('click', onBackdrop);
  panel.addEventListener('keydown', onKeyDown);
  document.addEventListener('focusin', onFocusIn);
  document.body.append(root);
  setBackgroundInert(true);
  focusPanel();

  owner.__registerCleanup(id, () => {
    setBackgroundInert(false);
    closeButton.removeEventListener('click', close);
    root.removeEventListener('click', onBackdrop);
    panel.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('focusin', onFocusIn);
    root.remove();
    if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus();
  });
  return { __id: id, element: root, open: openPanel, close, destroy: () => owner.destroy(id) };
}

export function createMenu(owner, target, options = {}) {
  const trigger = typeof target === 'string' ? document.querySelector(target) : target;
  if (!(trigger instanceof HTMLElement)) throw new TypeError('tzrender.menu: target must be a CSS selector or an HTMLElement.');
  const items = Array.isArray(options.items) ? options.items.slice(0, 50) : [];
  if (!items.length) throw new TypeError('tzrender.menu: provide at least one menu item.');

  const id = owner.__id();
  const theme = themeClass(options.theme);
  const menu = document.createElement('div');
  menu.id = id;
  menu.className = `tzr-menu tzr-menu--${theme}`;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', String(options.label || 'Actions'));
  menu.hidden = true;
  const itemButtons = [];
  items.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tzr-menu__item';
    button.setAttribute('role', 'menuitem');
    button.tabIndex = -1;
    button.textContent = String(item?.label ?? `Action ${index + 1}`);
    button.addEventListener('click', () => {
      try { if (typeof item?.onSelect === 'function') item.onSelect(); }
      finally { close(true); }
    });
    menu.append(button);
    itemButtons.push(button);
  });

  const previousHaspopup = trigger.getAttribute('aria-haspopup');
  const previousExpanded = trigger.getAttribute('aria-expanded');
  const previousControls = trigger.getAttribute('aria-controls');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-controls', id);
  trigger.setAttribute('aria-expanded', 'false');
  document.body.append(menu);
  let open = false;
  const placeMenu = () => {
    const rect = trigger.getBoundingClientRect();
    menu.hidden = false;
    const bounds = menu.getBoundingClientRect();
    const gap = 6;
    let top = rect.bottom + gap;
    let left = options.placement === 'bottom-end' ? rect.right - bounds.width : rect.left;
    if (options.placement === 'top-start' || options.placement === 'top-end') top = rect.top - bounds.height - gap;
    if (options.placement === 'top-end') left = rect.right - bounds.width;
    left = Math.max(8, Math.min(left, window.innerWidth - bounds.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - bounds.height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  };
  const show = (edge = 'first') => {
    if (open) return;
    open = true;
    placeMenu();
    trigger.setAttribute('aria-expanded', 'true');
    (edge === 'last' ? itemButtons.at(-1) : itemButtons[0]).focus();
  };
  const close = (restoreFocus = false) => {
    if (!open) return;
    open = false;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  };
  const toggle = () => open ? close() : show();
  const onTriggerClick = () => toggle();
  const onTriggerKeyDown = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); show('first'); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); show('last'); }
  };
  const onMenuKeyDown = (event) => {
    const current = itemButtons.indexOf(document.activeElement);
    let next = current;
    if (event.key === 'ArrowDown') next = (current + 1) % itemButtons.length;
    else if (event.key === 'ArrowUp') next = (current - 1 + itemButtons.length) % itemButtons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = itemButtons.length - 1;
    else if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
    else if (event.key === 'Tab') { close(false); return; }
    else return;
    event.preventDefault();
    itemButtons[next].focus();
  };
  const onOutsidePointer = (event) => {
    if (open && !menu.contains(event.target) && !trigger.contains(event.target)) close(false);
  };
  const onPositionChange = () => { if (open) placeMenu(); };
  trigger.addEventListener('click', onTriggerClick);
  trigger.addEventListener('keydown', onTriggerKeyDown);
  menu.addEventListener('keydown', onMenuKeyDown);
  document.addEventListener('pointerdown', onOutsidePointer);
  window.addEventListener('resize', onPositionChange);
  window.addEventListener('scroll', onPositionChange, true);

  owner.__registerCleanup(id, () => {
    trigger.removeEventListener('click', onTriggerClick);
    trigger.removeEventListener('keydown', onTriggerKeyDown);
    menu.removeEventListener('keydown', onMenuKeyDown);
    document.removeEventListener('pointerdown', onOutsidePointer);
    window.removeEventListener('resize', onPositionChange);
    window.removeEventListener('scroll', onPositionChange, true);
    if (previousHaspopup === null) trigger.removeAttribute('aria-haspopup'); else trigger.setAttribute('aria-haspopup', previousHaspopup);
    if (previousExpanded === null) trigger.removeAttribute('aria-expanded'); else trigger.setAttribute('aria-expanded', previousExpanded);
    if (previousControls === null) trigger.removeAttribute('aria-controls'); else trigger.setAttribute('aria-controls', previousControls);
    menu.remove();
  });
  return { __id: id, element: menu, open: show, close, toggle, destroy: () => owner.destroy(id) };
}
