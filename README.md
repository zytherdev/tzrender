# tzrender

`@zyther/tzrender` is a lightweight JavaScript ES module for adding themed interface components to a vanilla HTML, CSS, and JavaScript page. It creates components in the DOM and loads its bundled styles; no CSS framework is required.

## Get started in a plain HTML page

1. Create an `index.html` file and paste in this complete example:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>tzrender quick start</title>
</head>
<body>
  <main>
    <h1>tzrender quick start</h1>
    <button id="notify" type="button">Show notifications</button>
  </main>

  <script type="module">
    import Render from 'https://cdn.jsdelivr.net/npm/@zyther/tzrender@latest/index.js';

    const ui = new Render();
    await ui.ready;

    document.querySelector('#notify').addEventListener('click', () => {
      ui.alert({
        variant: 'success',
        msg: 'Your first tzrender notification!',
        timeout: 5000
      });

      const toast = ui.toast({
        title: 'Saved',
        message: 'Your changes are ready.',
        variant: 'success',
        duration: 0
      });

      // Keep a reference if you want to close the toast from your own UI:
      window.currentToast = toast;
    });
  </script>
</body>
</html>
```

2. Serve the file from a local web server (rather than opening it as `file://`), then open its HTTP address in a modern browser.
3. Click **Show notifications**. The alert closes automatically after five seconds and can also be dismissed with its close button. The toast stays open because `duration` is `0`; close it with its own close button or call `window.currentToast.destroy()` (or `.dismiss()`) in the browser console or your code.

`await ui.ready` waits for the bundled component styles to load. The styles are fetched relative to the module URL and inserted into the document. See [Troubleshooting](#troubleshooting) if loading fails.

The CDN example uses `@latest` for convenience. For reproducible production deployments, pin the URL to a specific version published on npm.

### Use with npm and Vite

Install the package in a Vite project:

```sh
npm install @zyther/tzrender
```

Then import and initialize it from your application JavaScript:

```js
import Render from '@zyther/tzrender';

const ui = new Render();
await ui.ready;
ui.alert({ variant: 'info', msg: 'Hello from Vite!' });
```

## API reference

Create an instance with `const ui = new Render()`. Every instance exposes `ui.ready`, a Promise that resolves after the bundled styles have been loaded (or logs a style-loading error if fetching them fails). Components that return a string return their generated DOM `id`. Unless noted, overlays are added to `document.body`.

### Notifications and dialogs

#### `ui.alert(options)`

Displays a dismissible status or alert message. Returns the element ID as a string. The close button dismisses it; a positive `timeout` also dismisses it automatically.

| Option | Default | Description |
| --- | --- | --- |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `variant` | `'info'` | `'info'`, `'success'`, `'warning'`, or `'error'`; unknown values use `'info'`. |
| `msg` | `'Something...'` | Message text. |
| `timeout` | `3000` | Auto-dismiss delay in milliseconds; non-positive or non-finite values do not start a timer. |
| `closeLabel` | `'Dismiss notification'` | Accessible name for the close button. |

```js
const alertId = ui.alert({ variant: 'warning', msg: 'Check the form.', timeout: 0 });
// Later:
ui.destroy(alertId);
```

#### `ui.toast(options)`

Creates a closable, stacked notification. Returns `{ __id, element, dismiss(), destroy() }`; `dismiss()` and `destroy()` both remove the toast. Error toasts use an assertive live announcement; other variants use a polite one. The timer pauses while the toast is hovered or contains keyboard focus.

| Option | Default | Description |
| --- | --- | --- |
| `variant` | `'info'` | `'info'`, `'success'`, `'warning'`, or `'error'`; invalid values use `'info'`. |
| `position` | `'bottom-right'` | `'top-left'`, `'top-right'`, `'bottom-left'`, or `'bottom-right'`. |
| `theme` | `'dark'` | `'dark'` or `'light'`; invalid values use `'dark'`. |
| `title` | — | Optional title, rendered as text. |
| `message` | `''` | Message text. `msg` is accepted as an alternative when `message` is omitted. |
| `duration` | `4000` | Auto-dismiss delay in milliseconds. `0` keeps the toast open. `timeout` is an alias used when `duration` is omitted. |
| `closeLabel` | `'Dismiss notification'` | Accessible name for the close button. |
| `action` | — | Optional `{ label, onClick }`; an action button is added when `onClick` is a function. `label` defaults to `'Action'`. |

```js
const toast = ui.toast({ message: 'Profile updated.', duration: 0 });
// Later: toast.dismiss(); // or toast.destroy()
```

#### `ui.msg_box(options)`

Shows a modal confirmation dialog. Returns its element ID as a string. The close and cancel buttons run the cancel callback; the confirm button runs the confirm callback. The dialog initially focuses Confirm, traps Tab navigation within its buttons, closes on Escape, and restores the previously focused element when destroyed.

| Option | Default | Description |
| --- | --- | --- |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `title` | `'Message'` | Dialog heading, rendered as text. |
| `msg` | `''` | Dialog message, rendered as text. |
| `closeLabel` | `'Close dialog'` | Accessible name for the close button. |
| `action.cancel.text` | `'Cancel'` | Cancel button label. |
| `action.cancel.callback` | no-op | Function called on cancel. |
| `action.confirm.text` | `'Confirm'` | Confirm button label. |
| `action.confirm.callback` | no-op | Function called on confirm. |

```js
const dialogId = ui.msg_box({
  title: 'Discard draft?',
  msg: 'Your unsaved changes will be lost.',
  action: {
    cancel: { text: 'Keep editing', callback: () => console.log('Kept') },
    confirm: { text: 'Discard', callback: () => console.log('Discarded') }
  }
});
// A dialog may also be removed with ui.destroy(dialogId).
```

### Loading and progress

#### `ui.spinner(options)`

Creates a loading spinner and returns `{ __id, toggle(show = true), destroy() }`. Use `toggle(false)` to hide it without removing it; call `destroy()` to remove it and clear its timers. It is appended to `document.body`.

| Option | Default | Description |
| --- | --- | --- |
| `variant` | `'simple'` | `'simple'`, `'dual'`, `'triple'`, or `'custom'`. |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `backdrop` | `true` | Use the backdrop presentation; `false` uses a container presentation. |
| `text.content` | `'Loading...'` | Optional caption text. |
| `text.animated` | `true` | Animate the caption by revealing its characters. |
| `text.color` | `'lightgray'` | Caption CSS color. |
| `custom.url` | — | Image URL used for the `'custom'` variant. |
| `custom.animation` | `'spin'` | Animation class for a custom image, or `'spin'` for ring-style simple/dual/triple spinners. |
| `custom.color` | `'skyblue'` | Color for simple/dual/triple spinner shapes. |
| `events.screen_click.hide` | `false` | Hide on backdrop click. |
| `events.screen_click.destroy` | `false` | Destroy on backdrop click. |
| `events.auto__.timer` | `3000` | Delay in milliseconds for enabled automatic actions. |
| `events.auto__.hide` | `false` | Hide after the timer. |
| `events.auto__.destroy` | `false` | Destroy after the timer. |

```js
const loading = ui.spinner({ text: { content: 'Saving…', animated: false } });
// When the operation finishes:
loading.destroy();
```

#### `ui.block_ui(options)`

Adds a full-screen animated blocking overlay. Returns `{ __id, destroy() }`; it is appended to `document.body` and should be destroyed when the blocked work ends.

| Option | Default | Description |
| --- | --- | --- |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `animation` | `'shapes'` | `'particles'`, `'lines'`, `'shapes'`, or `'orbs'`. |
| `count` | `120` | Number of animated elements, clamped to 1–250. |
| `message` | — | Optional message text. |
| `events.screen_click.destroy` | `false` | Destroy when the overlay is clicked. |
| `events.auto__.timer` | `3000` | Delay in milliseconds for automatic destruction. |
| `events.auto__.destroy` | `false` | Destroy after the timer. |
| `custom.__size.min` / `custom.__size.max` | `7` / `100` | Minimum and maximum animated element size; invalid ranges use these defaults. |

```js
const blocker = ui.block_ui({ message: 'Please wait…', animation: 'particles' });
// After the task:
blocker.destroy();
```

#### `ui.progress(options)`

Creates a determinate or indeterminate progress indicator. Returns `{ __id, element, set(value, label?), destroy() }`. `set` updates the value (clamped to 0–100) and optionally the label. Pass `null` to `set` for indeterminate progress; passing a number switches back to determinate progress.

| Option | Default | Description |
| --- | --- | --- |
| `container` | `document.body` | CSS selector or DOM `Element` where the indicator is appended. |
| `label` | `'Loading progress'` | Accessible progress label. |
| `value` | `0` | Initial progress, clamped to 0–100. |
| `variant` | `'bar'` | `'bar'` or `'ring'`. |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `color` | — | Optional CSS color override. |
| `showValue` | `false` | Whether to show the numeric percentage. |
| `indeterminate` | `false` | Use indeterminate progress instead of a value-based indicator. |

```js
const progress = ui.progress({ label: 'Uploading file', value: 25, showValue: true });
progress.set(60, 'Upload in progress');
// When complete:
progress.set(100, 'Upload complete');
progress.destroy();
```

#### `ui.skeleton(options)`

Creates a decorative loading placeholder. Returns `{ __id, element, destroy() }`. Its visual content is marked `aria-hidden`; pair it with separate accessible status text (for example, a nearby `role="status"` element) so assistive-technology users are informed about loading.

| Option | Default | Description |
| --- | --- | --- |
| `container` | `document.body` | CSS selector or DOM `Element` where the placeholder is appended. |
| `variant` | `'text'` | `'text'`, `'circle'`, `'card'`, or `'image'`. |
| `rows` | `3` | Number of placeholder text rows. |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `width` | `'100%'` | Placeholder CSS width. |
| `height` | — | Optional placeholder CSS height. |
| `animated` | `true` | Enable the placeholder animation. |

```js
// HTML: <section id="profile" aria-busy="true"><p id="loading-status" role="status">Loading profile…</p></section>
const profile = document.querySelector('#profile');
const status = document.querySelector('#loading-status');
const placeholder = ui.skeleton({ container: profile, variant: 'card' });
// After replacing the loading view with real content:
placeholder.destroy();
profile.setAttribute('aria-busy', 'false');
status.textContent = 'Profile loaded.';
```

### Information and navigation components

#### `ui.tooltip(target, options)`

Attaches a tooltip to a CSS selector or an `Element`. It appears on pointer hover and keyboard focus, maintains `aria-describedby`, and can be dismissed with Escape. Returns `{ __id, element, show(), hide(), destroy() }`.

| Option | Default | Description |
| --- | --- | --- |
| `content` | `''` | Tooltip text. `text` is an alternative when `content` is omitted. |
| `placement` | `'top'` | `'top'`, `'right'`, `'bottom'`, or `'left'`; invalid values use `'top'`. |

```js
const tip = ui.tooltip('#save-button', { content: 'Save your changes', placement: 'bottom' });
// Later: tip.destroy();
```

#### `ui.accordion(options)`

Creates an accordion. Returns `{ __id, element, open(index), close(index), destroy() }`. At least one item is required. By default, opening an item closes the others; set `multiple: true` to allow multiple open panels.

| Option | Default | Description |
| --- | --- | --- |
| `container` | `document.body` | CSS selector or DOM `Element` where the accordion is appended. |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `multiple` | `false` | Allow multiple panels to remain open. |
| `items` | required | Array of `{ title, content, open }`. `title` defaults to `Item N`; `open` is optional. |

```js
const faq = ui.accordion({
  container: '#faq',
  items: [
    { title: 'Can content contain HTML?', content: 'Strings appear as text.' },
    { title: 'Can I add an element?', content: document.createElement('em') }
  ]
});
faq.open(0);
```

#### `ui.tabs(options)`

Creates keyboard-operable tabs. Returns `{ __id, element, select(index), activeIndex, destroy() }`. At least one item is required. Left/Right Arrow move between tabs (wrapping at the ends); Home and End move to the first and last tab.

| Option | Default | Description |
| --- | --- | --- |
| `container` | `document.body` | CSS selector or DOM `Element` where the tabs are appended. |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `label` | `'Content tabs'` | Accessible name for the tab list. |
| `activeIndex` | `0` | Initially selected tab; bounded to the available items. |
| `items` | required | Array of `{ label, content }`. `label` defaults to `Tab N`. |

```js
const sections = ui.tabs({
  label: 'Help topics',
  items: [
    { label: 'Account', content: 'Manage your account settings.' },
    { label: 'Billing', content: document.createElement('p') }
  ]
});
sections.select(1);
```

For accordion panels and tab panels, string content is inserted as text, not interpreted as HTML. A DOM `Node` may be passed as `content`; tzrender appends a clone of that node. This text-safe behavior also applies to notification, tooltip, and message strings. Do not pass untrusted markup expecting it to be parsed.

### Page loading and cleanup

#### `ui.page(url, host, callback)`

Fetches HTML from `url`, replaces `host.innerHTML` with the response text, then calls `callback()`. Defaults are `host = document.body` and an empty callback. This method is asynchronous; it does not return a component ID. The remote server must permit the request under browser CORS rules. Only load HTML from sources you trust.

```js
await ui.page('/sections/help.html', document.querySelector('#app'), () => {
  console.log('Help content loaded');
});
```

#### `ui.destroy(id)`

Removes the DOM element with the given ID and runs cleanup registered for it, including timers and event listeners. Use the returned ID for `alert`, `msg_box`, or any component returning a string; returned component objects also expose `destroy()` where listed above.

```js
const id = ui.alert({ msg: 'Temporary message', timeout: 0 });
ui.destroy(id);
```

## Containers, themes, and accessibility

- `accordion`, `tabs`, `progress`, and `skeleton` can be mounted in a chosen container. All four accept a CSS selector or a DOM `Element`. Other overlays and toast regions are mounted on `document.body`.
- The built-in themes are `dark` and `light`. Component styles are bundled with the package; no framework-specific classes, CSS framework, or external stylesheet import is required. `color`, `width`, and `height` options (where available) are CSS values.
- Alerts, toasts, dialogs, tooltips, accordions, and tabs include accessibility semantics. Keep notification text meaningful, give icon-only controls appropriate labels, and ensure a tooltip trigger can receive keyboard focus. Tooltips can be read on focus; Escape hides one.
- Accordion headers and tabs are buttons and can be operated with standard keyboard controls. Tabs support Left/Right Arrow, Home, and End. Dialogs support Escape and a Tab focus loop.
- Skeleton visuals are decorative and hidden from assistive technology. Provide a separate status message for loading updates; use a progress label that describes the work underway.

## Browser support

Use a modern browser with JavaScript ES module support, `fetch`, and the DOM APIs used by the components. Load the page over HTTP/HTTPS (for example, through Vite or another local development server); `file://` pages commonly prevent module or stylesheet fetches.

## Troubleshooting

- **The CDN module returns 404:** Check the spelling of `@zyther/tzrender@latest/index.js`, confirm the browser is online, and retry after the package CDN has refreshed. For a project build, install with `npm install @zyther/tzrender` and import the package through Vite.
- **The component appears unstyled:** Wait for `await ui.ready`; check the browser console and Network panel for failed requests to jsDelivr or the package's `styles/` files. Serve the page via HTTP/HTTPS, verify network access, and avoid opening it directly as `file://`.
- **Styles fail on a local page:** Start a local server rather than relying on the filesystem URL. For example, in a Vite project run `npm run dev` and open the URL it prints.
- **`page()` fails or returns no content:** Confirm the URL is reachable and the server allows cross-origin requests (CORS) when it is on a different origin. Check the console and Network panel for the fetch error.
- **A container is not found:** Ensure the target element exists before calling the component; for accordion and tabs, a selector must match an existing element.
