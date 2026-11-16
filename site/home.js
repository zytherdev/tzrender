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

  window.addEventListener('tzrender:theme-change', (event) => {
    const theme = event.detail?.theme;
    if (theme === 'light' || theme === 'dark') {
      progressComponent.element.classList.toggle('tzr-progress--light', theme === 'light');
      progressComponent.element.classList.toggle('tzr-progress--dark', theme === 'dark');
    }
  });

  // The menu handle is retained for a future example button without changing its ownership.
  void demoMenu;
} catch (error) {
  console.error('tzrender demo initialization failed:', error);
  announce('The component preview could not load. Check the browser console and try the package docs.');
}
