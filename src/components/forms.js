import { resolveMount } from '../components.js';

function string(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value);
}

function callback(fn, ...args) {
  if (typeof fn !== 'function') return;
  try { fn(...args); }
  catch (error) { console.error('tzrender: component callback failed.', error); }
}

function mountRoot(owner, options, tag, className) {
  const target = resolveMount(options.container);
  const id = owner.__id();
  const element = document.createElement(tag);
  element.id = id;
  element.className = className;
  target.append(element);
  return { id, element };
}

function register(owner, id, element, cleanup = () => {}) {
  owner.__registerCleanup(id, () => {
    cleanup();
    element.remove();
  });
  return { __id: id, element, destroy: () => owner.destroy(id) };
}

function normalizeItems(items, labelFallback = 'Option') {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
    throw new TypeError('tzrender: provide between 1 and 100 options.');
  }
  const seen = new Set();
  return items.map((item, index) => {
    const value = string(item?.value ?? item?.id ?? item?.label, `${index + 1}`);
    if (!value || seen.has(value)) throw new TypeError('tzrender: option values must be unique and non-empty.');
    seen.add(value);
    return {
      value,
      label: string(item?.label, `${labelFallback} ${index + 1}`),
      disabled: item?.disabled === true,
      description: string(item?.description, '')
    };
  });
}

function themeClass(theme) {
  return theme === 'light' ? 'tzr-form--light' : 'tzr-form--dark';
}

export function createSwitch(owner, options = {}) {
  const { id, element: root } = mountRoot(owner, options, 'div', `tzr-switch ${themeClass(options.theme)}`);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tzr-switch__button';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-checked', String(options.checked === true || options.value === true));
  button.disabled = options.disabled === true;
  const track = document.createElement('span');
  track.className = 'tzr-switch__track';
  track.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'tzr-switch__label';
  label.textContent = string(options.label, 'Enable option');
  button.append(track, label);
  root.append(button);
  const description = string(options.description, '');
  if (description) {
    const note = document.createElement('span');
    note.className = 'tzr-switch__description';
    note.id = `${id}-description`;
    note.textContent = description;
    button.setAttribute('aria-describedby', note.id);
    root.append(note);
  }

  let value = button.getAttribute('aria-checked') === 'true';
  let handle;
  function set(nextValue) {
    value = Boolean(nextValue);
    button.setAttribute('aria-checked', String(value));
    root.dataset.checked = String(value);
    return value;
  }
  handle = register(owner, id, root, () => button.removeEventListener('click', onClick));
  function onClick() {
    if (button.disabled) return;
    set(!value);
    callback(options.onChange, value, handle);
  }
  button.addEventListener('click', onClick);
  set(value);
  return {
    ...handle,
    set,
    toggle() { return set(!value); },
    get value() { return value; },
    set disabled(disabled) { button.disabled = Boolean(disabled); },
    get disabled() { return button.disabled; }
  };
}

export function createCheckboxGroup(owner, options = {}) {
  const items = normalizeItems(options.items, 'Choice');
  const { id, element: fieldset } = mountRoot(owner, options, 'fieldset', `tzr-checkbox-group ${themeClass(options.theme)}`);
  fieldset.setAttribute('aria-label', string(options.label, 'Choose options'));
  const legend = document.createElement('legend');
  legend.className = 'tzr-choice__legend';
  legend.textContent = string(options.label, 'Choose options');
  fieldset.append(legend);
  if (options.description) {
    const description = document.createElement('p');
    description.className = 'tzr-choice__description';
    description.id = `${id}-description`;
    description.textContent = String(options.description);
    fieldset.setAttribute('aria-describedby', description.id);
    fieldset.append(description);
  }
  const list = document.createElement('div');
  list.className = 'tzr-choice__list';
  const inputs = new Map();
  for (const item of items) {
    const row = document.createElement('label');
    row.className = 'tzr-choice__item';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = string(options.name, id);
    input.value = item.value;
    input.disabled = item.disabled || options.disabled === true;
    input.checked = Array.isArray(options.value) && options.value.map(String).includes(item.value);
    const text = document.createElement('span');
    text.className = 'tzr-choice__text';
    text.textContent = item.label;
    row.append(input, text);
    if (item.description) {
      const help = document.createElement('small');
      help.textContent = item.description;
      row.append(help);
    }
    list.append(row);
    inputs.set(item.value, input);
  }
  fieldset.append(list);
  let handle;
  const getValue = () => [...inputs].filter(([, input]) => input.checked).map(([value]) => value);
  function setValue(values) {
    const selected = new Set(Array.isArray(values) ? values.map(String) : []);
    for (const [value, input] of inputs) input.checked = selected.has(value);
    return getValue();
  }
  function onChange() { callback(options.onChange, getValue(), handle); }
  for (const input of inputs.values()) input.addEventListener('change', onChange);
  handle = register(owner, id, fieldset, () => { for (const input of inputs.values()) input.removeEventListener('change', onChange); });
  return {
    ...handle,
    setValue,
    clear() { setValue([]); },
    get value() { return getValue(); },
    set disabled(value) { for (const input of inputs.values()) input.disabled = Boolean(value); },
    get disabled() { return [...inputs.values()].every((input) => input.disabled); }
  };
}

export function createRadioGroup(owner, options = {}) {
  const items = normalizeItems(options.items, 'Option');
  const { id, element: fieldset } = mountRoot(owner, options, 'fieldset', `tzr-radio-group ${themeClass(options.theme)}`);
  const label = string(options.label, 'Choose an option');
  fieldset.setAttribute('aria-label', label);
  const legend = document.createElement('legend');
  legend.className = 'tzr-choice__legend';
  legend.textContent = label;
  fieldset.append(legend);
  if (options.description) {
    const description = document.createElement('p');
    description.className = 'tzr-choice__description';
    description.id = `${id}-description`;
    description.textContent = String(options.description);
    fieldset.setAttribute('aria-describedby', description.id);
    fieldset.append(description);
  }
  const list = document.createElement('div');
  list.className = 'tzr-choice__list';
  const inputs = new Map();
  const initial = options.value === undefined ? items.find((item) => !item.disabled)?.value : String(options.value);
  for (const item of items) {
    const row = document.createElement('label');
    row.className = 'tzr-choice__item';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = string(options.name, id);
    input.value = item.value;
    input.disabled = item.disabled || options.disabled === true;
    input.required = options.required === true;
    input.checked = item.value === initial;
    const text = document.createElement('span');
    text.className = 'tzr-choice__text';
    text.textContent = item.label;
    row.append(input, text);
    if (item.description) {
      const help = document.createElement('small');
      help.textContent = item.description;
      row.append(help);
    }
    list.append(row);
    inputs.set(item.value, input);
  }
  fieldset.append(list);
  let handle;
  const getValue = () => [...inputs].find(([, input]) => input.checked)?.[0] ?? null;
  function setValue(value) {
    const candidate = value === null || value === undefined ? null : String(value);
    if (candidate !== null && (!inputs.has(candidate) || inputs.get(candidate).disabled)) return false;
    if (candidate === null && options.required === true) return false;
    for (const [itemValue, input] of inputs) input.checked = itemValue === candidate;
    return true;
  }
  function onChange(event) { callback(options.onChange, event.target.value, handle); }
  for (const input of inputs.values()) input.addEventListener('change', onChange);
  handle = register(owner, id, fieldset, () => { for (const input of inputs.values()) input.removeEventListener('change', onChange); });
  return {
    ...handle,
    setValue,
    clear() { return setValue(null); },
    get value() { return getValue(); },
    set disabled(value) { for (const input of inputs.values()) input.disabled = Boolean(value); },
    get disabled() { return [...inputs.values()].every((input) => input.disabled); }
  };
}

export function createSegmentedControl(owner, options = {}) {
  const items = normalizeItems(options.items, 'Segment');
  const { id, element: root } = mountRoot(owner, options, 'div', `tzr-segmented ${themeClass(options.theme)}`);
  root.setAttribute('role', 'radiogroup');
  root.setAttribute('aria-label', string(options.label, 'Choose a view'));
  const selected = options.value === undefined ? items.find((item) => !item.disabled)?.value : String(options.value);
  if (selected !== undefined && selected !== null && !items.some((item) => item.value === selected)) throw new TypeError('tzrender: segmented value must match an item.');
  const buttons = new Map();
  let value = selected ?? null;
  let handle;

  function update() {
    for (const [itemValue, button] of buttons) {
      const active = itemValue === value;
      button.setAttribute('aria-checked', String(active));
      button.tabIndex = active ? 0 : -1;
      button.classList.toggle('is-selected', active);
    }
  }
  function set(nextValue) {
    const candidate = nextValue === null || nextValue === undefined ? null : String(nextValue);
    if (candidate !== null && (!buttons.has(candidate) || buttons.get(candidate).disabled)) return false;
    value = candidate;
    update();
    return true;
  }
  function selectByKeyboard(current, direction) {
    const available = items.filter((item) => !item.disabled);
    if (!available.length) return;
    const currentIndex = available.findIndex((item) => item.value === current);
    const index = direction === 'first' ? 0 : direction === 'last' ? available.length - 1 : (currentIndex + direction + available.length) % available.length;
    const next = available[index];
    set(next.value);
    buttons.get(next.value)?.focus();
    callback(options.onChange, value, handle);
  }
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tzr-segmented__item';
    button.setAttribute('role', 'radio');
    button.textContent = item.label;
    button.disabled = item.disabled || options.disabled === true;
    button.addEventListener('click', () => {
      if (button.disabled || value === item.value) return;
      set(item.value);
      callback(options.onChange, value, handle);
    });
    button.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); selectByKeyboard(value, 1); }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); selectByKeyboard(value, -1); }
      else if (event.key === 'Home') { event.preventDefault(); selectByKeyboard(value, 'first'); }
      else if (event.key === 'End') { event.preventDefault(); selectByKeyboard(value, 'last'); }
    });
    root.append(button);
    buttons.set(item.value, button);
  }
  handle = register(owner, id, root, () => {
    for (const button of buttons.values()) { button.onclick = null; button.onkeydown = null; }
  });
  update();
  return {
    ...handle,
    setValue: set,
    select: set,
    get value() { return value; },
    set disabled(disabled) { for (const button of buttons.values()) button.disabled = Boolean(disabled); },
    get disabled() { return [...buttons.values()].every((button) => button.disabled); }
  };
}

export function createCombobox(owner, options = {}) {
  const items = normalizeItems(options.items, 'Option');
  const { id, element: root } = mountRoot(owner, options, 'div', `tzr-combobox ${themeClass(options.theme)}`);
  const label = document.createElement('label');
  label.className = 'tzr-combobox__label';
  label.htmlFor = `${id}-input`;
  label.textContent = string(options.label, 'Search options');
  const input = document.createElement('input');
  input.id = `${id}-input`;
  input.type = 'text';
  input.className = 'tzr-combobox__input';
  input.autocomplete = 'off';
  input.role = 'combobox';
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', `${id}-listbox`);
  input.placeholder = string(options.placeholder, 'Type to filter…');
  input.disabled = options.disabled === true;
  const listbox = document.createElement('div');
  listbox.id = `${id}-listbox`;
  listbox.className = 'tzr-combobox__listbox';
  listbox.setAttribute('role', 'listbox');
  listbox.hidden = true;
  const status = document.createElement('div');
  status.className = 'tzr-combobox__empty';
  status.setAttribute('role', 'status');
  status.textContent = string(options.emptyLabel, 'No matching options.');
  status.hidden = true;
  const hidden = options.name ? document.createElement('input') : null;
  if (hidden) { hidden.type = 'hidden'; hidden.name = String(options.name); }
  root.append(label, input, listbox, status);
  if (hidden) root.append(hidden);

  let value = null;
  let activeIndex = -1;
  let visibleItems = [];
  let handle;
  const initial = options.value === undefined || options.value === null ? null : String(options.value);

  function setExpanded(expanded) {
    const open = Boolean(expanded) && !input.disabled;
    listbox.hidden = !open;
    status.hidden = !open || visibleItems.length > 0;
    input.setAttribute('aria-expanded', String(open));
    if (!open) input.removeAttribute('aria-activedescendant');
  }
  function updateSelection(candidate) {
    value = candidate;
    const item = items.find((entry) => entry.value === candidate);
    input.value = item?.label || '';
    if (hidden) hidden.value = candidate ?? '';
  }
  function setValue(candidate) {
    const key = candidate === null || candidate === undefined || candidate === '' ? null : String(candidate);
    if (key !== null && (!items.some((item) => item.value === key) || items.find((item) => item.value === key)?.disabled)) return false;
    updateSelection(key);
    setExpanded(false);
    activeIndex = -1;
    return true;
  }
  function close(restore = true) {
    setExpanded(false);
    activeIndex = -1;
    if (restore) updateSelection(value);
  }
  function renderOptions(query = '') {
    const search = query.trim().toLocaleLowerCase();
    visibleItems = items.filter((item) => !item.disabled && `${item.label} ${item.value}`.toLocaleLowerCase().includes(search));
    listbox.replaceChildren();
    activeIndex = visibleItems.length ? Math.max(0, visibleItems.findIndex((item) => item.value === value)) : -1;
    visibleItems.forEach((item, index) => {
      const option = document.createElement('div');
      option.id = `${id}-option-${index}`;
      option.className = 'tzr-combobox__option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(item.value === value));
      option.textContent = item.label;
      option.addEventListener('pointerdown', (event) => event.preventDefault());
      option.addEventListener('click', () => commit(item));
      listbox.append(option);
    });
    status.hidden = visibleItems.length > 0;
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    updateActiveOption();
  }
  function updateActiveOption() {
    for (let index = 0; index < listbox.children.length; index += 1) {
      const active = index === activeIndex;
      listbox.children[index].classList.toggle('is-active', active);
    }
    if (activeIndex >= 0 && visibleItems[activeIndex]) input.setAttribute('aria-activedescendant', `${id}-option-${activeIndex}`);
    else input.removeAttribute('aria-activedescendant');
  }
  function commit(item) {
    if (!item || item.disabled) return;
    const changed = value !== item.value;
    updateSelection(item.value);
    setExpanded(false);
    input.focus();
    if (changed) callback(options.onChange, value, handle);
  }
  function moveActive(direction) {
    if (!visibleItems.length) return;
    let next = activeIndex;
    for (let attempts = 0; attempts < visibleItems.length; attempts += 1) {
      next = (next + direction + visibleItems.length) % visibleItems.length;
      if (!visibleItems[next].disabled) break;
    }
    activeIndex = next;
    updateActiveOption();
    listbox.children[activeIndex]?.scrollIntoView?.({ block: 'nearest' });
  }
  function onInput() {
    if (value !== null) {
      value = null;
      if (hidden) hidden.value = '';
    }
    renderOptions(input.value);
  }
  function onKeydown(event) {
    if (event.key === 'ArrowDown') { event.preventDefault(); if (listbox.hidden) renderOptions(input.value); else moveActive(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); if (listbox.hidden) renderOptions(input.value); else moveActive(-1); }
    else if (event.key === 'Home' && !listbox.hidden) { event.preventDefault(); activeIndex = visibleItems.length ? 0 : -1; updateActiveOption(); }
    else if (event.key === 'End' && !listbox.hidden) { event.preventDefault(); activeIndex = visibleItems.length - 1; updateActiveOption(); }
    else if (event.key === 'Enter' && !listbox.hidden) { event.preventDefault(); commit(visibleItems[activeIndex]); }
    else if (event.key === 'Escape' && !listbox.hidden) { event.preventDefault(); close(true); }
    else if (event.key === 'Tab') close(true);
  }
  function onDocumentPointer(event) { if (!root.contains(event.target)) close(true); }
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeydown);
  input.addEventListener('focus', () => { if (options.openOnFocus === true) renderOptions(''); });
  document.addEventListener('pointerdown', onDocumentPointer, true);
  handle = register(owner, id, root, () => {
    input.removeEventListener('input', onInput);
    input.removeEventListener('keydown', onKeydown);
    document.removeEventListener('pointerdown', onDocumentPointer, true);
  });
  if (initial !== null && !setValue(initial)) throw new TypeError('tzrender: combobox value must match an enabled option.');
  return {
    ...handle,
    setValue,
    open() { renderOptions(input.value); input.focus(); },
    close() { close(true); },
    focus() { input.focus(); },
    get value() { return value; },
    get input() { return input; },
    set disabled(disabled) { input.disabled = Boolean(disabled); if (input.disabled) close(true); },
    get disabled() { return input.disabled; }
  };
}

export function createRating(owner, options = {}) {
  const maximum = Math.min(10, Math.max(1, Math.trunc(Number(options.max ?? 5)) || 5));
  const { id, element: fieldset } = mountRoot(owner, options, 'fieldset', `tzr-rating ${themeClass(options.theme)}`);
  const legend = document.createElement('legend');
  legend.className = 'tzr-choice__legend';
  legend.textContent = string(options.label, 'Rate this item');
  fieldset.append(legend);
  const group = document.createElement('div');
  group.className = 'tzr-rating__stars';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', string(options.label, 'Rate this item'));
  const allowClear = options.allowClear === true;
  const inputs = new Map();
  let value = Math.min(maximum, Math.max(0, Math.trunc(Number(options.value) || 0)));
  let handle;
  for (let rating = 1; rating <= maximum; rating += 1) {
    const label = document.createElement('label');
    label.className = 'tzr-rating__star';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = string(options.name, id);
    input.value = String(rating);
    input.checked = value === rating;
    input.disabled = options.disabled === true;
    input.setAttribute('aria-label', `${rating} of ${maximum} stars`);
    const star = document.createElement('span');
    star.setAttribute('aria-hidden', 'true');
    star.textContent = '★';
    label.append(input, star);
    input.addEventListener('change', () => {
      value = rating;
      sync();
      callback(options.onChange, value, handle);
    });
    inputs.set(rating, input);
    group.append(label);
  }
  fieldset.append(group);
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'tzr-rating__clear';
  clearButton.textContent = string(options.clearLabel, 'Clear rating');
  clearButton.hidden = !allowClear;
  clearButton.disabled = options.disabled === true;
  clearButton.addEventListener('click', () => {
    if (!value) return;
    value = 0;
    sync();
    callback(options.onChange, value, handle);
    inputs.get(1)?.focus();
  });
  fieldset.append(clearButton);
  function sync() {
    for (const [rating, input] of inputs) {
      input.checked = rating === value;
      input.parentElement.classList.toggle('is-filled', rating <= value);
    }
    fieldset.dataset.value = String(value);
  }
  function set(nextValue) {
    const number = Math.trunc(Number(nextValue));
    if (!Number.isFinite(number) || number < 0 || number > maximum || (number === 0 && !allowClear)) return false;
    value = number;
    sync();
    return true;
  }
  handle = register(owner, id, fieldset, () => {
    for (const input of inputs.values()) input.onchange = null;
    clearButton.onclick = null;
  });
  sync();
  return {
    ...handle,
    setValue: set,
    clear() { return allowClear ? set(0) : false; },
    get value() { return value; },
    set disabled(disabled) { for (const input of inputs.values()) input.disabled = Boolean(disabled); clearButton.disabled = Boolean(disabled); },
    get disabled() { return [...inputs.values()].every((input) => input.disabled); }
  };
}
