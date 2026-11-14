import { getToolboxCopy } from './toolbox.js';

export async function mountLibraryDemos(render) {
  const mount = document.getElementById('libraryDemosMount');
  if (!mount) return;

  const response = await fetch('/utils/library-demos.html');
  if (!response.ok) throw new Error(`Library demos failed to load (${response.status})`);
  mount.innerHTML = await response.text();

  const toastButton = document.getElementById('demoToast');
  const tooltipButton = document.getElementById('demoTooltip');
  const progressButton = document.getElementById('demoProgressUpdate');
  let tooltip;
  let accordion;
  let tabs;
  let progressBar;
  let progressRing;
  let skeletons = [];
  let progressValue = 0;

  toastButton.addEventListener('click', () => {
    render.toast({
      variant: 'success',
      title: getToolboxCopy('toastTitle'),
      message: getToolboxCopy('toastMessage'),
      position: 'bottom-right',
      theme: document.documentElement.dataset.theme
    });
  });

  progressButton.addEventListener('click', () => {
    progressValue = progressValue >= 100 ? 0 : Math.min(100, progressValue + 25);
    progressBar.set(progressValue, getToolboxCopy('progressUpdatedLabel'));
    progressRing.set(Math.min(100, progressValue + 10));
  });

  function refreshComponentCopy() {
    tooltip?.destroy();
    accordion?.destroy();
    tabs?.destroy();
    progressBar?.destroy();
    progressRing?.destroy();
    skeletons.forEach((placeholder) => placeholder.destroy());

    const theme = document.documentElement.dataset.theme;
    tooltip = render.tooltip(tooltipButton, {
      content: getToolboxCopy('tooltipContent'),
      placement: 'top'
    });

    accordion = render.accordion({
      container: '#demoAccordion',
      theme,
      items: [
        { title: getToolboxCopy('accordionOneTitle'), content: getToolboxCopy('accordionOneContent') },
        { title: getToolboxCopy('accordionTwoTitle'), content: getToolboxCopy('accordionTwoContent') }
      ]
    });

    tabs = render.tabs({
      container: '#demoTabs',
      theme,
      label: getToolboxCopy('tabsDemoTitle'),
      items: [
        { label: getToolboxCopy('tabHtml'), content: getToolboxCopy('tabHtmlContent') },
        { label: getToolboxCopy('tabCss'), content: getToolboxCopy('tabCssContent') },
        { label: getToolboxCopy('tabJs'), content: getToolboxCopy('tabJsContent') }
      ]
    });

    progressValue = 0;
    progressBar = render.progress({
      container: '#demoProgress',
      label: getToolboxCopy('progressLabel'),
      value: progressValue,
      showValue: true,
      theme
    });
    progressRing = render.progress({
      container: '#demoProgress',
      label: getToolboxCopy('ringProgressLabel'),
      variant: 'ring',
      value: 35,
      theme
    });

    skeletons = [
      render.skeleton({ container: '#demoSkeletons', variant: 'text', rows: 3, theme }),
      render.skeleton({ container: '#demoSkeletons', variant: 'circle', width: '3.25rem', theme }),
      render.skeleton({ container: '#demoSkeletons', variant: 'card', height: '5rem', theme })
    ];
  }

  refreshComponentCopy();
  window.addEventListener('tzrender:language-change', refreshComponentCopy);
  window.addEventListener('tzrender:theme-change', refreshComponentCopy);
}
