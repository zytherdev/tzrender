import Render from '../index.js';

const root = document.documentElement;
const feedback = document.querySelector('#componentFeedback');
const demoProgress = document.querySelector('#demoProgress');
const progressValue = document.querySelector('#demoProgressValue');
let progress = 68;
let ui;

function setTheme(theme) {
  const value = theme === 'light' ? 'light' : 'dark';
  root.dataset.theme = value;
  try { localStorage.setItem('tzrender-theme', value); } catch { /* Private browsing may disable storage. */ }
  window.dispatchEvent(new CustomEvent('tzrender:theme-change', { detail: { theme: value } }));
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.setAttribute('aria-label', value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  });
}

try {
  setTheme(localStorage.getItem('tzrender-theme') || 'dark');
} catch {
  setTheme('dark');
}

document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
  button.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));
});

document.querySelectorAll('[data-copy]').forEach((button) => {
  const originalText = button.textContent;
  const originalLabel = button.getAttribute('aria-label');
  button.addEventListener('click', async () => {
    const value = button.dataset.copy || '';
    let copied = false;
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      const fallback = document.createElement('textarea');
      fallback.value = value;
      fallback.setAttribute('readonly', '');
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      document.body.append(fallback);
      fallback.select();
      copied = document.execCommand('copy');
      fallback.remove();
    }
    button.textContent = copied ? 'Copied' : 'Select code';
    button.setAttribute('aria-label', copied ? 'Copied to clipboard' : 'Copy was unavailable');
    if (feedback) feedback.textContent = copied ? 'Example copied to the clipboard.' : `Copy unavailable. Here is the code: ${value}`;
    window.setTimeout(() => {
      button.textContent = originalText;
      if (originalLabel) button.setAttribute('aria-label', originalLabel);
      else button.removeAttribute('aria-label');
    }, 1300);
  });
});

function announce(message) {
  if (feedback) feedback.textContent = message;
}

function currentTheme() {
  return root.dataset.theme === 'light' ? 'light' : 'dark';
}

try {
  ui = new Render();
  await ui.ready;
  announce('Package components are ready. Try one of the examples.');

  document.querySelector('#demoToast')?.addEventListener('click', () => {
    ui.toast({
      title: 'Saved',
      message: 'Your changes are ready to use.',
      variant: 'success',
      theme: currentTheme(),
      duration: 4500
    });
    announce('A real tzrender toast was added to the page.');
  });

  document.querySelector('#demoAlert')?.addEventListener('click', () => {
    ui.alert({ variant: 'info', theme: currentTheme(), msg: 'Your next step is to try this in your own project.', timeout: 4200 });
    announce('A real tzrender alert was added to the page.');
  });

  document.querySelector('#demoConfirm')?.addEventListener('click', async () => {
    const accepted = await ui.confirm({
      theme: currentTheme(),
      title: 'Try a confirmation?',
      msg: 'This dialog uses the package confirm() API and returns true or false.',
      confirmText: 'Yes, try it',
      cancelText: 'Not now'
    });
    announce(accepted ? 'You confirmed the example.' : 'You cancelled the example.');
  });

  let patternExample = null;
  document.querySelector('#demoAccordion')?.addEventListener('click', () => {
    patternExample?.destroy();
    patternExample = ui.accordion({
      container: '#demoPatternMount',
      theme: currentTheme(),
      items: [
        { title: 'What does tzrender do?', content: 'It adds reusable interface components to a vanilla JavaScript project.' },
        { title: 'Is string content treated as HTML?', content: 'No. Strings are inserted as text by default.' }
      ]
    });
    announce('An interactive tzrender accordion is open.');
  });
  document.querySelector('#demoTabs')?.addEventListener('click', () => {
    patternExample?.destroy();
    patternExample = ui.tabs({
      container: '#demoPatternMount',
      label: 'Package example tabs',
      theme: currentTheme(),
      items: [
        { label: 'HTML', content: 'HTML gives a page its structure.' },
        { label: 'CSS', content: 'CSS controls the page presentation.' },
        { label: 'JavaScript', content: 'JavaScript makes a page interactive.' }
      ]
    });
    announce('Use the arrow keys to move between the example tabs.');
  });
  ui.tooltip('#demoTooltip', { content: 'This description opens on hover or keyboard focus.', placement: 'top' });

  document.querySelector('#demoSpinner')?.addEventListener('click', () => {
    ui.spinner({ theme: currentTheme(), text: { content: 'A short loading state…', animated: false }, events: { auto__: { timer: 1100, destroy: true } } });
    announce('A real tzrender spinner will close after a short demo.');
  });
  document.querySelector('#demoBlocker')?.addEventListener('click', () => {
    ui.block_ui({ theme: currentTheme(), message: 'A short blocking state…', count: 24, events: { auto__: { timer: 950, destroy: true } } });
    announce('A short blocking overlay will close automatically.');
  });
  document.querySelector('#demoSkeleton')?.addEventListener('click', () => {
    patternExample?.destroy();
    patternExample = ui.skeleton({ container: '#demoPatternMount', theme: currentTheme(), variant: 'card', width: '100%', animated: true });
    announce('A decorative skeleton placeholder is shown; real apps should announce loading separately.');
  });

  document.querySelector('#demoDrawer')?.addEventListener('click', () => {
    ui.drawer({
      theme: currentTheme(),
      title: 'A small side panel',
      content: 'Drawers work well for supporting navigation or a compact task. This one is built with tzrender.',
      placement: 'right',
      closeLabel: 'Close example drawer'
    });
  });

  const menuTrigger = document.querySelector('#demoMenu');
  const demoMenu = ui.menu(menuTrigger, {
    theme: currentTheme(),
    label: 'Component example menu',
    items: [
      { label: 'Read the README', onSelect: () => announce('The README explains every public API for package users.') },
      { label: 'Try another component', onSelect: () => announce('Choose any example above to explore another component.') },
      { label: 'Return to the page', onSelect: () => announce('The menu closes and returns focus to its trigger.') }
    ]
  });

  const progressComponent = ui.progress({ container: '#demoProgressTrack', value: progress, label: 'Example upload progress', showValue: false, theme: currentTheme() });
  progressComponent.element.classList.add('home-progress-component');
  progressComponent.element.querySelector('.tzr-progress__label')?.remove();
  progressComponent.element.querySelector('.tzr-progress__value')?.remove();
  progressComponent.element.querySelector('.tzr-progress__track')?.setAttribute('aria-label', 'Example upload progress');
  demoProgress?.addEventListener('click', () => {
    progress = progress >= 100 ? 18 : Math.min(100, progress + 16);
    progressComponent.set(progress);
    progressValue.textContent = `${progress}%`;
    announce(progress === 100 ? 'The upload is complete.' : `Progress updated to ${progress} percent.`);
  });

  const newComponentSelect = document.querySelector('#newComponentSelect');
  const newComponentMount = document.querySelector('#newComponentMount');
  const newComponentCode = document.querySelector('#newComponentCode');
  const copyNewComponentExample = document.querySelector('#copyNewComponentExample');
  let newComponentHandle;
  const examples = {
    switch: {
      code: "ui.switch({ container: '#newComponentMount', label: 'Email updates', checked: true });",
      render: (container, theme) => ui.switch({ container, theme, label: 'Email updates', description: 'Get occasional project tips.', checked: true, onChange: (value) => announce(`Email updates ${value ? 'on' : 'off'}.`) })
    },
    checkboxGroup: {
      code: "ui.checkboxGroup({ container: '#newComponentMount', label: 'Topics', items: [{ value: 'html', label: 'HTML' }, { value: 'css', label: 'CSS' }] });",
      render: (container, theme) => ui.checkboxGroup({ container, theme, label: 'Topics to explore', value: ['css'], items: [{ value: 'html', label: 'HTML', description: 'Page structure' }, { value: 'css', label: 'CSS', description: 'Page styles' }, { value: 'js', label: 'JavaScript', description: 'Page behavior' }], onChange: (values) => announce(`Selected topics: ${values.join(', ') || 'none'}.`) })
    },
    radioGroup: {
      code: "ui.radioGroup({ container: '#newComponentMount', label: 'Layout', items: [{ value: 'wide', label: 'Wide' }, { value: 'compact', label: 'Compact' }] });",
      render: (container, theme) => ui.radioGroup({ container, theme, label: 'Preview layout', value: 'wide', items: [{ value: 'wide', label: 'Wide' }, { value: 'compact', label: 'Compact' }, { value: 'stacked', label: 'Stacked' }], onChange: (value) => announce(`Preview layout: ${value}.`) })
    },
    segmentedControl: {
      code: "ui.segmentedControl({ container: '#newComponentMount', label: 'Preview size', value: 'desktop', items: [{ value: 'desktop', label: 'Desktop' }, { value: 'mobile', label: 'Mobile' }] });",
      render: (container, theme) => ui.segmentedControl({ container, theme, label: 'Preview size', value: 'desktop', items: [{ value: 'desktop', label: 'Desktop' }, { value: 'tablet', label: 'Tablet' }, { value: 'mobile', label: 'Mobile' }], onChange: (value) => announce(`Preview size: ${value}. Use arrow keys to switch.`) })
    },
    combobox: {
      code: "ui.combobox({ container: '#newComponentMount', label: 'Choose a color', items: [{ value: 'violet', label: 'Violet' }, { value: 'mint', label: 'Mint' }] });",
      render: (container, theme) => ui.combobox({ container, theme, label: 'Choose a starter color', placeholder: 'Type to filter…', items: [{ value: 'violet', label: 'Violet' }, { value: 'mint', label: 'Mint' }, { value: 'amber', label: 'Amber' }], onChange: (value) => announce(`Selected color: ${value}.`) })
    },
    popover: {
      code: "ui.popover('#demoPopoverTrigger', { title: 'A helpful note', content: 'Popover content is inserted as text.' });",
      render: (_container, theme) => {
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.id = 'demoPopoverTrigger';
        trigger.className = 'button button-small';
        trigger.textContent = 'Open helpful note';
        newComponentMount.append(trigger);
        return ui.popover(trigger, { title: 'A helpful note', content: 'Popover content is inserted as text. Press Escape to close it.', theme });
      }
    },
    pagination: {
      code: "ui.pagination({ container: '#newComponentMount', totalPages: 8, currentPage: 3 });",
      render: (container, theme) => ui.pagination({ container, theme, totalPages: 8, currentPage: 3, label: 'Example pages', onChange: (page) => announce(`Showing example page ${page}.`) })
    },
    breadcrumb: {
      code: "ui.breadcrumb({ container: '#newComponentMount', items: [{ label: 'Home', href: '/' }, { label: 'Guides', href: '/guides' }, { label: 'Getting started', current: true }] });",
      render: (container, theme) => ui.breadcrumb({ container, theme, items: [{ label: 'Home', href: '/' }, { label: 'Guides', href: '/guides' }, { label: 'Getting started', current: true }] })
    },
    rating: {
      code: "ui.rating({ container: '#newComponentMount', label: 'Rate this guide', value: 4, allowClear: true });",
      render: (container, theme) => ui.rating({ container, theme, label: 'Rate this guide', value: 4, allowClear: true, onChange: (value) => announce(`Guide rating: ${value} of 5.`) })
    },
    copyButton: {
      code: "ui.copyButton({ container: '#newComponentMount', text: 'npm install @zyther/tzrender', label: 'Copy install command' });",
      render: (container, theme) => ui.copyButton({ container, theme, text: 'npm install @zyther/tzrender', label: 'Copy install command', onCopy: () => announce('Install command copied.'), onError: () => announce('Clipboard unavailable in this browser context.') })
    },
    avatar: {
      code: "ui.avatar({ container: '#newComponentMount', name: 'Taylor Zane', size: 56 });",
      render: (container) => ui.avatar({ container, name: 'Taylor Zane', size: 56, shape: 'circle' })
    },
    badge: {
      code: "ui.badge({ container: '#newComponentMount', text: 'Ready', variant: 'success' });",
      render: (container, theme) => ui.badge({ container, theme, text: 'Ready to publish', variant: 'success', size: 'medium', announce: true })
    }
  };

  function showNewComponent(name) {
    const example = examples[name] || examples.switch;
    newComponentHandle?.destroy();
    newComponentMount.replaceChildren();
    newComponentHandle = example.render('#newComponentMount', currentTheme());
    newComponentCode.textContent = example.code;
    copyNewComponentExample.dataset.copy = example.code;
    announce(`${name} example is ready. Try it, then copy the code.`);
  }

  newComponentSelect?.addEventListener('change', (event) => showNewComponent(event.target.value));
  showNewComponent(newComponentSelect?.value || 'switch');

  function syncThemeClass(element, prefix, theme, hasLightVariant = false) {
    if (!element) return;
    const hasThemeClass = element.classList.contains(`${prefix}--light`)
      || element.classList.contains(`${prefix}--dark`)
      || element.classList.contains(prefix);
    if (!hasThemeClass) return;
    element.classList.toggle(`${prefix}--dark`, theme === 'dark');
    if (hasLightVariant) element.classList.toggle(`${prefix}--light`, theme === 'light');
  }

  function syncComponentPreviewTheme(theme) {
    const previews = [
      [progressComponent.element, 'tzr-progress', true],
      [patternExample?.element, 'tzr-accordion', false],
      [patternExample?.element, 'tzr-tabs', false],
      [patternExample?.element, 'tzr-skeleton', false],
      [demoMenu.element, 'tzr-menu', false],
      [newComponentHandle?.element, 'tzr-form', true],
      [newComponentHandle?.element, 'tzr-popover', true],
      [newComponentHandle?.element, 'tzr-pagination', true],
      [newComponentHandle?.element, 'tzr-breadcrumb', true],
      [newComponentHandle?.element, 'tzr-copy', true],
      [newComponentHandle?.element, 'tzr-badge', true]
    ];
    for (const [element, prefix, hasLightVariant] of previews) syncThemeClass(element, prefix, theme, hasLightVariant);
  }

  window.addEventListener('tzrender:theme-change', (event) => {
    const theme = event.detail?.theme;
    if (theme === 'light' || theme === 'dark') syncComponentPreviewTheme(theme);
  });
} catch (error) {
  console.error('tzrender demo initialization failed:', error);
  announce('The component preview could not load. Check the browser console and try the package docs.');
}
