# tzrender

`@zyther/tzrender` is a small vanilla JavaScript UI library for everyday interface patterns: alerts, dialogs, loading states, notifications, tooltips, accordions, tabs, form controls, navigation, avatars and status badges. It is designed for projects built with ordinary HTML, CSS and JavaScript. It does not require a framework or CSS library.

> **Package vs. website:** The package is the reusable UI library described below. This repository also contains a separate learning website with a [browser code editor](editor.html) and [front-end tools](tools.html). Those website features are not imported from the npm package.

## Install and use

Install the package in an existing JavaScript project:

```sh
npm install @zyther/tzrender
```

Import it in a browser app that supports ES modules, such as a Vite project:

```js
import Render from '@zyther/tzrender';

const ui = new Render();
await ui.ready; // Wait for the package's component styles.

ui.toast({
  title: 'Saved',
  message: 'Your changes are ready.',
  variant: 'success'
});
```

Start your project's development server and open its HTTP or HTTPS URL. Do not open an ES module project as `file://`; browsers commonly block the module or stylesheet loading it needs.

### A complete first example

Add this markup to your page:

```html
<main>
  <h1>My first tzrender page</h1>
  <button id="notify" type="button">Show a notification</button>
</main>
```

Then add this JavaScript to your app entry file:

```js
import Render from '@zyther/tzrender';

const ui = new Render();
await ui.ready;

document.querySelector('#notify').addEventListener('click', () => {
  ui.alert({
    variant: 'success',
    msg: 'Your first tzrender notification!',
    timeout: 5000
  });
});
```

`ui.ready` is a Promise. Await it before relying on the bundled styles. If a style request fails, the Promise rejects; catch the error if your app needs a fallback:

```js
try {
  await ui.ready;
} catch (error) {
  console.error('tzrender styles could not be loaded.', error);
}
```

## API reference

Create one `Render` instance and reuse it for the components owned by the same part of your app:

```js
import Render from '@zyther/tzrender';

const ui = new Render();
await ui.ready;
```

All user-provided labels and message strings are rendered as text rather than parsed as HTML. Unless noted otherwise, components are appended to `document.body`. Methods ending in `()` may return either a DOM ID string or a component handle; their return shapes are documented below.

### Notifications

#### `ui.alert(options)`

Shows a short message with a dismiss button and optional automatic dismissal. Returns its DOM `id` as a string. Use `ui.destroy(id)` to remove it early.

| Option | Default | Description |
| --- | --- | --- |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `variant` | `'info'` | `'info'`, `'success'`, `'warning'` or `'error'`; an unknown value uses `'info'`. |
| `msg` | `''` | The message text. |
| `timeout` | `3000` | Auto-dismiss time in milliseconds. A non-positive or invalid value disables the timer. |
| `closeLabel` | `'Dismiss notification'` | Accessible name for the dismiss button. |

```js
const noticeId = ui.alert({ variant: 'warning', msg: 'Check the form.', timeout: 0 });
// Later:
ui.destroy(noticeId);
```

#### `ui.toast(options)`

Shows a closable notification. Toasts stack at the selected screen corner. Returns `{ __id, element, dismiss(), destroy() }`; `dismiss()` and `destroy()` both remove it. Its auto-dismiss timer pauses while someone hovers over it or moves keyboard focus inside it.

| Option | Default | Description |
| --- | --- | --- |
| `variant` | `'info'` | `'info'`, `'success'`, `'warning'` or `'error'`. Errors use an assertive screen-reader announcement; other variants use a polite announcement. |
| `position` | `'bottom-right'` | `'top-left'`, `'top-right'`, `'bottom-left'` or `'bottom-right'`. |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `title` | — | Optional title text. |
| `message` | `''` | Message text. `msg` is an alias used when `message` is omitted. |
| `duration` | `4000` | Auto-dismiss time in milliseconds. `0` keeps the toast open. `timeout` is an alias used when `duration` is omitted. |
| `closeLabel` | `'Dismiss notification'` | Accessible name for the close button. |
| `action` | — | Optional `{ label, onClick }`. An action button appears when `onClick` is a function; `label` defaults to `'Action'`. |

```js
const toast = ui.toast({ message: 'Profile updated.', duration: 0 });
// Later, from your own button handler:
toast.dismiss();
```

### Dialogs

#### `ui.msg_box(options)`

Shows a modal dialog with Cancel and Confirm actions. Returns the dialog's DOM `id` as a string. Each action callback runs at most once, and missing callbacks are allowed. The dialog initially focuses Confirm, keeps keyboard focus inside, closes on Escape by default, and returns focus to the element that opened it when dismissed.

| Option | Default | Description |
| --- | --- | --- |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `title` | `'Message'` | Dialog heading, shown as text. |
| `msg` | `''` | Dialog message, shown as text. |
| `closeLabel` | `'Close dialog'` | Accessible name for the top close button. |
| `closeOnEscape` | `true` | Close the dialog when Escape is pressed. |
| `closeOnBackdrop` | `false` | Close the dialog when the dim backdrop is clicked. |
| `action.cancel.text` | `'Cancel'` | Cancel button text. |
| `action.cancel.callback` | — | Optional function called when Cancel or the close button is activated. |
| `action.confirm.text` | `'Confirm'` | Confirm button text. |
| `action.confirm.callback` | — | Optional function called when Confirm is activated. |

```js
const dialogId = ui.msg_box({
  title: 'Discard draft?',
  msg: 'Your unsaved changes will be lost.',
  closeOnBackdrop: true,
  action: {
    cancel: { text: 'Keep editing' },
    confirm: { text: 'Discard', callback: () => console.log('Draft discarded.') }
  }
});
```

#### `ui.confirm(options)`

Uses the same accessible dialog and returns a `Promise<boolean>`: `true` for Confirm and `false` for Cancel, close, Escape, or programmatic destruction. Optional `action.cancel.callback` and `action.confirm.callback` functions run before the Promise settles.

| Option | Default | Description |
| --- | --- | --- |
| `theme`, `title`, `msg` | same as `msg_box` | Dialog theme and text. |
| `closeLabel`, `closeOnEscape`, `closeOnBackdrop` | same as `msg_box` | Dialog accessibility and dismissal options. |
| `confirmText` | `'Confirm'` | Confirm button text. `action.confirm.text` is used when this is omitted. |
| `cancelText` | `'Cancel'` | Cancel button text. `action.cancel.text` is used when this is omitted. |
| `action.confirm.callback` | — | Optional function called on confirmation. |
| `action.cancel.callback` | — | Optional function called on cancellation. |

```js
const shouldDelete = await ui.confirm({
  title: 'Delete this note?',
  msg: 'This cannot be undone.',
  confirmText: 'Delete'
});
if (shouldDelete) deleteNote();
```

### Loading states

#### `ui.spinner(options)`

Shows a loading spinner. Returns `{ __id, toggle(show = true), destroy() }`. Use `toggle(false)` to hide it without removing it, then call `destroy()` when the operation finishes. `destroy()` also clears the component's timers and listeners.

| Option | Default | Description |
| --- | --- | --- |
| `variant` | `'simple'` | `'simple'`, `'dual'`, `'triple'` or `'custom'`. Unknown values use `'simple'`. |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `backdrop` | `true` | Use the backdrop layout. `false` uses the compact container layout. |
| `text.content` | `'Loading...'` | Optional caption text. An empty string hides the caption. |
| `text.animated` | `true` | Reveal caption characters in sequence. |
| `text.color` | `'lightgray'` | Caption CSS color. |
| `custom.url` | — | Image URL for the `'custom'` variant. |
| `custom.animation` | `'spin'` | Spinner animation class. `'spin'` creates ring-style simple/dual/triple variants. |
| `custom.color` | `'skyblue'` | Color used by the built-in shapes/rings. |
| `events.screen_click.hide` | `false` | Hide the spinner when its backdrop is clicked. |
| `events.screen_click.destroy` | `false` | Remove the spinner when its backdrop is clicked; this takes precedence over `hide`. |
| `events.auto__.timer` | `3000` | Delay in milliseconds for enabled timer actions. |
| `events.auto__.hide` | `false` | Hide after the timer. |
| `events.auto__.destroy` | `false` | Remove after the timer. |

```js
const loading = ui.spinner({ text: { content: 'Saving…', animated: false } });
try {
  await saveChanges();
} finally {
  loading.destroy();
}
```

#### `ui.block_ui(options)`

Displays a full-screen animated blocking overlay. Returns `{ __id, destroy() }`. Always destroy it when the work ends; the method installs an animation loop and temporary pointer listeners that `destroy()` cleans up.

| Option | Default | Description |
| --- | --- | --- |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `animation` | `'shapes'` | `'particles'`, `'lines'`, `'shapes'` or `'orbs'`; unknown values use `'shapes'`. |
| `count` | `120` | Animated elements, clamped to 1–250. |
| `message` | `''` | Optional loading status text. |
| `events.screen_click.destroy` | `false` | Remove the overlay when it is clicked. |
| `events.auto__.timer` | `3000` | Delay before an enabled automatic action. |
| `events.auto__.destroy` | `false` | Remove the overlay after the timer. |
| `custom.__size.min` / `custom.__size.max` | `7` / `100` | Minimum and maximum decorative element size in pixels. Invalid ranges use these defaults. |

```js
const blocker = ui.block_ui({ message: 'Preparing your dashboard…', animation: 'particles' });
try {
  await loadDashboard();
} finally {
  blocker.destroy();
}
```

#### `ui.progress(options)`

Creates a progress bar or circular indicator. Returns `{ __id, element, set(value, label?), destroy(), value }`. Progress values are clamped to 0–100. `set(null)` switches to indeterminate mode; set a number to return to determinate mode.

| Option | Default | Description |
| --- | --- | --- |
| `container` | `document.body` | Existing CSS selector or DOM `Element` to receive the progress component. |
| `label` | `'Loading progress'` | Visible and accessible description. |
| `value` | `0` | Initial value from 0 to 100. |
| `variant` | `'bar'` | `'bar'` or `'ring'`. |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `color` | — | Optional CSS color override. |
| `showValue` | `false` | Show the numeric percentage. |
| `indeterminate` | `false` | Start with an indeterminate animation. |

```js
const progress = ui.progress({ label: 'Uploading', value: 25, showValue: true });
progress.set(60, 'Upload in progress');
progress.set(100, 'Upload complete');
progress.destroy();
```

#### `ui.skeleton(options)`

Creates a decorative loading placeholder and returns `{ __id, element, destroy() }`. The placeholder is hidden from screen readers; pair it with a real loading status or `aria-busy` state.

| Option | Default | Description |
| --- | --- | --- |
| `container` | `document.body` | Existing CSS selector or DOM `Element` to receive the placeholder. |
| `variant` | `'text'` | `'text'`, `'circle'`, `'card'` or `'image'`. |
| `rows` | `3` | Text rows for the `'text'` variant, clamped to 1–12. |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `width` | `'100%'` (text/card/image), `'3.5rem'` (circle) | CSS width. |
| `height` | — | CSS height for non-card variants. |
| `animated` | `true` | Show the shimmer animation. |

```js
const profile = document.querySelector('#profile');
profile.setAttribute('aria-busy', 'true');
const placeholder = ui.skeleton({ container: profile, variant: 'card' });

// After rendering the real profile:
placeholder.destroy();
profile.setAttribute('aria-busy', 'false');
```

### Information and navigation

#### `ui.tooltip(target, options)`

Adds a tooltip to a CSS selector or `Element`. It opens on pointer hover and keyboard focus, sets `aria-describedby` on the trigger, and can be dismissed with Escape. Returns `{ __id, element, show(), hide(), destroy() }`.

| Option | Default | Description |
| --- | --- | --- |
| `content` | `''` | Tooltip text. `text` is an alias when `content` is omitted. |
| `placement` | `'top'` | `'top'`, `'right'`, `'bottom'` or `'left'`; an unknown value uses `'top'`. |

```js
const tip = ui.tooltip('#saveButton', { content: 'Save your work', placement: 'bottom' });
// Later:
tip.destroy();
```

#### `ui.accordion(options)`

Creates an accordion and returns `{ __id, element, open(index), close(index), destroy() }`. Opening one item closes the other open items unless `multiple: true`.

| Option | Default | Description |
| --- | --- | --- |
| `container` | `document.body` | Existing CSS selector or DOM `Element`. |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `multiple` | `false` | Allow multiple open panels. |
| `items` | required | One or more `{ title, content, open }` objects. Titles default to `Item 1`, `Item 2`, etc. `open` starts the item expanded. |

```js
const faq = ui.accordion({
  container: '#faq',
  items: [
    { title: 'Can I use HTML?', content: 'Text content is the safest default.' },
    { title: 'Can it open by default?', content: 'Yes.', open: true }
  ]
});
faq.open(0);
```

#### `ui.tabs(options)`

Creates accessible tabs with roving keyboard focus. Returns `{ __id, element, select(index), activeIndex, destroy() }`. Left/Right Arrow wrap through the tabs; Home and End move to the first and last tab.

| Option | Default | Description |
| --- | --- | --- |
| `container` | `document.body` | Existing CSS selector or DOM `Element`. |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `label` | `'Content tabs'` | Accessible name for the tab list. |
| `activeIndex` | `0` | Initial tab index; bounded to the available tabs. |
| `items` | required | One or more `{ label, content }` objects. Labels default to `Tab 1`, `Tab 2`, etc. |

```js
const helpTabs = ui.tabs({
  label: 'Help topics',
  items: [
    { label: 'Account', content: 'Manage account settings.' },
    { label: 'Billing', content: 'Review billing information.' }
  ]
});
helpTabs.select(1);
```

#### `ui.drawer(options)`

Opens an accessible side panel and returns `{ __id, element, open(), close(), destroy() }`. Its background is inert while the drawer is open; focus stays inside, Escape closes by default, and closing restores the previous focus. Call `open()` to reopen a closed drawer.

| Option | Default | Description |
| --- | --- | --- |
| `title` | — | Visible heading and accessible name. |
| `label` | `'Side panel'` | Accessible name used when there is no title. |
| `content` | `''` | Text content, or a DOM `Node` that is cloned into the panel. Strings are never interpreted as HTML. |
| `placement` | `'right'` | `'left'`, `'right'` or `'bottom'`. |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `closeLabel` | `'Close panel'` | Accessible name for the close button. |
| `closeOnEscape` | `true` | Close on Escape. |
| `closeOnBackdrop` | `false` | Close when the backdrop is clicked. |

```js
const drawer = ui.drawer({ title: 'Help', content: 'Start by editing the HTML file.' });
// Later:
drawer.close();
drawer.destroy();
```

#### `ui.menu(target, options)`

Attaches a compact action menu to a button or other `HTMLElement`. Returns `{ __id, element, open(), close(), toggle(), destroy() }`. Use a real, keyboard-focusable button for `target`. Arrow keys, Home, End and Escape work inside the menu; clicking outside closes it.

| Option | Default | Description |
| --- | --- | --- |
| `items` | required | One or more `{ label, onSelect }` objects. Labels are rendered as text. At most 50 items are accepted. |
| `label` | `'Actions'` | Accessible name for the menu. |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `placement` | `'bottom-start'` | `'bottom-start'`, `'bottom-end'`, `'top-start'` or `'top-end'`. |

```js
const actionsMenu = ui.menu('#moreButton', {
  label: 'Note actions',
  items: [
    { label: 'Rename', onSelect: () => renameNote() },
    { label: 'Delete', onSelect: () => deleteNote() }
  ]
});
```

### Form controls

#### `ui.switch(options)`

Creates a labeled switch button with `role="switch"` and an `aria-checked` state. Returns `{ __id, element, set(value), toggle(), value, disabled, destroy() }`.

| Option | Default | Description |
| --- | --- | --- |
| `container` | `document.body` | CSS selector or `Element` mount point. |
| `label` | `'Enable option'` | Visible, accessible label. |
| `description` | — | Optional supporting text associated with the switch. |
| `checked` / `value` | `false` | Initial on/off value; `checked` takes precedence. |
| `disabled` | `false` | Disable user interaction. |
| `theme` | `'dark'` | `'dark'` or `'light'`. |
| `onChange(value, handle)` | — | Called when a user toggles the switch. |

```js
const emailUpdates = ui.switch({
  container: '#settings',
  label: 'Email updates',
  description: 'Get occasional project tips.',
  checked: true,
  onChange: (enabled) => console.log({ enabled })
});
```

#### `ui.checkboxGroup(options)` and `ui.radioGroup(options)`

Both methods render native labeled inputs inside a `fieldset` with a visible `legend`. Options are `{ value, label, description, disabled }`; values must be unique non-empty strings. Both return `{ __id, element, setValue(value), clear(), value, disabled, destroy() }`.

Common options are `container` (`document.body`), `theme` (`'dark'`), `label` (`'Choose options'` for checkboxes; `'Choose an option'` for radios), `description`, `name`, `items` (required, 1–100 options), `disabled` and `onChange(value, handle)`. Checkbox `value` is an array of selected strings and defaults to `[]`. Radio `value` defaults to the first enabled option; set `required: true` to make a choice required. The radio value is a string or `null`. Native inputs support standard keyboard and assistive-technology behavior.

```js
const topics = ui.checkboxGroup({
  container: '#preferences',
  label: 'Topics to explore',
  value: ['css'],
  items: [
    { value: 'html', label: 'HTML', description: 'Page structure' },
    { value: 'css', label: 'CSS', description: 'Page styles' }
  ],
  onChange: (selected) => console.log(selected)
});
topics.setValue(['html', 'css']);
```

#### `ui.segmentedControl(options)`

Creates a compact single-choice radiogroup. Returns `{ __id, element, setValue(value), select(value), value, disabled, destroy() }`. Use Left/Right or Up/Down Arrow to change options, or Home/End to move to the first/last enabled option.

Options: `container` (`document.body`), `theme` (`'dark'`), `label` (`'Choose a view'`), `items` (required, 1–100 unique `{ value, label, disabled }` options), `value` (defaults to the first enabled item), `disabled` (`false`) and `onChange(value, handle)`.

```js
const view = ui.segmentedControl({
  container: '#preview-controls',
  label: 'Preview size',
  value: 'desktop',
  items: [{ value: 'desktop', label: 'Desktop' }, { value: 'mobile', label: 'Mobile' }]
});
```

#### `ui.combobox(options)`

Creates an editable, filterable combobox with an associated listbox and optional hidden form value. Returns `{ __id, element, input, setValue(value), open(), close(), focus(), value, disabled, destroy() }`. Type to filter; use Arrow keys to move, Enter to select, Escape to close, and Tab to leave.

Options: `container` (`document.body`), `theme` (`'dark'`), `label` (`'Search options'`), `items` (required, 1–100 unique `{ value, label, disabled }` options), `value` (optional initial enabled value), `name` (optional hidden form field), `placeholder` (`'Type to filter…'`), `emptyLabel` (`'No matching options.'`), `openOnFocus` (`false`), `disabled` (`false`) and `onChange(value, handle)`. Labels and filter results are text; options are not interpreted as HTML.

```js
const color = ui.combobox({
  container: '#theme-form',
  label: 'Choose a color',
  name: 'accent',
  items: [{ value: 'violet', label: 'Violet' }, { value: 'mint', label: 'Mint' }]
});
```

### Navigation and display

#### `ui.popover(target, options)`

Attaches a toggleable, non-modal dialog panel to a CSS selector or `Element` trigger. It updates `aria-expanded`, `aria-controls`, and `aria-haspopup`, opens on trigger activation, closes on outside click or Escape, and restores focus when closed. Returns `{ __id, element, open(), close(), toggle(), isOpen, destroy() }`.

Options: `container` (`document.body`), `title` (optional; otherwise `label`, default `'Popover'`), `content` (text by default, or a DOM `Node` cloned into the panel), `theme` (`'dark'`), `placement` (`'bottom'`; also `'top'`, `'left'`, `'right'`), `offset` (`8`, clamped to 0–32), `closeLabel` (`'Close popover'`) and `closeOnEscape` (`true`).

```js
const details = ui.popover('#detailsButton', {
  title: 'A helpful note',
  content: 'Popover strings are inserted as text.'
});
```

#### `ui.pagination(options)`

Creates labeled page-navigation buttons and returns `{ __id, element, setPage(page), setTotalPages(total), page, totalPages, pageSize, destroy() }`. Buttons support standard Tab/Enter/Space interaction and identify the current page with `aria-current="page"`.

Options: `container` (`document.body`), `theme` (`'light'`), `label` (`'Pagination'`), `totalPages` (or `totalItems` with `pageSize`; minimum one page), `pageSize` (`10`), `currentPage` (or `page`, defaults to 1), `boundaryCount` (`1`, up to 3), `siblingCount` (`1`, up to 3), `showFirstLast` (`false`), optional `firstLabel`, `previousLabel`, `nextLabel`, `lastLabel`, and `onChange(page, handle)`.

```js
const pages = ui.pagination({
  container: '#results-navigation',
  totalItems: 96,
  pageSize: 12,
  currentPage: 3,
  onChange: (page) => showResults(page)
});
```

#### `ui.breadcrumb(options)`

Renders an ordered breadcrumb trail and marks the current location with `aria-current="page"`. Returns `{ __id, element, setItems(items), items, destroy() }`. Provide 1–20 items with `{ label, href, current }`. If none is marked current, the last item is current. Labels are always text; unsafe URL protocols and protocol-relative URLs are omitted.

Options: `container` (`document.body`), `theme` (`'light'`), `label` (`'Breadcrumb'`) and `separator` (`'/'`). Relative and HTTP(S) links are supported.

```js
const trail = ui.breadcrumb({
  container: '#breadcrumbs',
  items: [
    { label: 'Home', href: '/' },
    { label: 'Guides', href: '/guides' },
    { label: 'Getting started', current: true }
  ]
});
```

#### `ui.rating(options)`

Creates a labeled star rating using native radio inputs. Returns `{ __id, element, setValue(value), clear(), value, disabled, destroy() }`. User changes call `onChange(value, handle)`; programmatic setters update state without invoking that callback.

Options: `container` (`document.body`), `theme` (`'dark'`), `label` (`'Rate this item'`), `max` (`5`, clamped to 1–10), `value` (`0`, clamped to the available range), `name` (defaults to the component ID), `disabled` (`false`), `allowClear` (`false`), `clearLabel` (`'Clear rating'`) and `onChange(value, handle)`.

```js
const guideRating = ui.rating({
  container: '#guide-feedback',
  label: 'Rate this guide',
  value: 4,
  allowClear: true
});
```

#### `ui.copyButton(options)`

Creates a button that copies text through the browser Clipboard API and announces success or failure with a polite live region. Clipboard access generally requires HTTPS or localhost and may be denied by the browser. Returns `{ __id, element, copy(), setText(text), text, copied, disabled, destroy() }`.

Options: `container` (`document.body`), `theme` (`'light'`), `text` (or `value`, default `''`), `label` (`'Copy'`), `ariaLabel` (defaults to `Copy ${description || 'text'}`), `description` (`'text'`), `copiedLabel` (`'Copied'`), `errorLabel` (`'Could not copy.'`), `resetAfter` (`1800` ms; `0` keeps success state), `disabled` (`false`), `onCopy(text, handle)` and `onError(error, handle)`.

```js
const copyInstall = ui.copyButton({
  container: '#install-command',
  text: 'npm install @zyther/tzrender',
  label: 'Copy install command'
});
```

#### `ui.avatar(options)`

Creates an image avatar with initials fallback and an accessible name. Returns `{ __id, element, setName(name), setSource(url), name, src, destroy() }`. An invalid or disallowed source is rejected by `setSource()` without replacing the current image. The image uses `referrerPolicy="no-referrer"`.

Options: `container` (`document.body`), `name` (or `alt`, default `'Avatar'`), `src` (optional HTTP(S) URL), `size` (`48` px, clamped to 24–256), `shape` (`'circle'`; or `'square'`) and `allowCrossOrigin` (`false`; by default only same-origin images load).

```js
const profileAvatar = ui.avatar({
  container: '#profile-header',
  name: 'Taylor Zane',
  size: 56
});
```

#### `ui.badge(options)`

Creates a compact text badge. Returns `{ __id, element, setText(text), setVariant(variant), setSize(size), setVisible(visible), text, variant, size, visible, destroy() }`.

Options: `container` (`document.body`), `text` (or `label`, default `'Status'`), `variant` (`'neutral'`; also `'primary'`, `'success'`, `'warning'`, `'danger'`, `'info'`), `size` (`'medium'`; also `'small'`, `'large'`), `announce` (`false`; adds a polite `status` role), `assertive` (`false`; with `announce`, uses an assertive `alert` role) and `theme` (omitted to follow `prefers-color-scheme`, or set to `'light'` / `'dark'` to choose explicitly).

```js
const status = ui.badge({
  container: '#publish-state',
  text: 'Ready to publish',
  variant: 'success',
  theme: 'light',
  announce: true
});
```

### Content safety and HTML loading

For `accordion`, `tabs`, and `drawer`, string content is inserted as text. You may pass a DOM `Node` when your app intentionally builds markup; tzrender clones that node rather than moving it. Notification, tooltip, modal, and menu labels are also text. Do not pass a string containing HTML expecting it to render.

#### `ui.page(url, host, callback, options)`

Loads a remote HTML fragment asynchronously. Returns a `Promise<Element>` for the destination host. `host` can be a CSS selector or an existing `Element`; it defaults to `document.body`. The optional callback runs after a successful load and receives the updated host. The request must be permitted by browser same-origin/CORS rules.

By default, tzrender **sanitizes** the downloaded markup: scripts, styles, forms, frames, event-handler attributes and unsafe URL schemes are removed. Unknown tags are unwrapped. Cross-origin image `src` values are removed. This is a small safe-fragment convenience, not a general-purpose HTML sanitizer. For the best security, load only markup you control.

| Argument/option | Default | Description |
| --- | --- | --- |
| `url` | required | URL passed to `fetch()`. |
| `host` | `document.body` | CSS selector or DOM `Element`. |
| `callback` | — | Optional function called with the updated host after a successful response. |
| `options.signal` | — | Optional `AbortSignal` passed to `fetch()`. |
| `options.trustedHtml` | `false` | Set to `true` only for markup from a source you fully trust. This bypasses sanitization and assigns directly to `innerHTML`. |

HTTP errors reject the Promise and leave the existing host contents unchanged. Network, abort, and parsing errors also reject. Handle failures in the usual way:

```js
const host = document.querySelector('#help');
try {
  await ui.page('/fragments/help.html', host, (updatedHost) => {
    console.log('Help loaded into', updatedHost);
  });
} catch (error) {
  host.textContent = 'Help could not be loaded. Please try again.';
  console.error(error);
}
```

To opt into the trusted-HTML compatibility path, the options object may be used as the third argument:

```js
await ui.page('/fragments/from-my-own-site.html', '#help', { trustedHtml: true });
```

Never set `trustedHtml: true` for user-submitted or otherwise untrusted markup. Sanitization does not make a remote server, its links, or your own rendering logic trustworthy.

### Cleanup and compatibility

#### `ui.destroy(idOrHandle)`

Removes a component owned by this `Render` instance and runs its registered cleanup, including timers, animation frames and event listeners. Pass a string ID returned by `alert()` or `msg_box()`, or a component handle such as a toast, drawer, or progress indicator. The method is safe to call again after a component has already been removed.

```js
const alertId = ui.alert({ msg: 'Temporary message', timeout: 0 });
ui.destroy(alertId);
```

#### `ui.destroyAll()`

Removes all components created by this instance only. Components created by another `Render` instance are unaffected. Call it when a page, view, or application section is being torn down.

```js
const ui = new Render();
ui.toast({ message: 'Saved' });
ui.progress({ label: 'Uploading', value: 25 });
// When this view is removed:
ui.destroyAll();
```

The original snake_case methods remain supported. These camelCase aliases call the same implementations:

| Alias | Original method |
| --- | --- |
| `ui.messageBox(options)` | `ui.msg_box(options)` |
| `ui.blockUI(options)` | `ui.block_ui(options)` |
| `ui.loadPage(url, host, callback, options)` | `ui.page(url, host, callback, options)` |

## Themes, containers, and accessibility

- Built-in themes are `'dark'` and `'light'`. Component CSS is included with the package; no framework-specific classes, manual stylesheet import, or external font request is needed.
- `accordion`, `tabs`, `progress`, and `skeleton` accept a `container` selector or `Element`. A drawer and toast may include a cloned DOM `Node` where documented. Other overlays are attached to `document.body`.
- Dialogs and drawers have accessible names, keep keyboard focus within the open surface, and restore focus when closed. Escape dismissal is configurable.
- Menus expose expanded state on their trigger and support arrow-key navigation. Tabs support Left/Right Arrow, Home, and End. Accordions use real buttons with expanded state.
- Loading animations respect reduced-motion preferences. Skeleton shapes are decorative; use a separate status message to announce loading progress.
- Give progress indicators useful labels. Prefer meaningful text for notifications instead of relying on color alone.

## Website editor and tools

The repository's learning website is separate from the npm API:

- [Browser code editor](https://github.com/zytherdev/tzrender/blob/main/editor.html): the Monaco-based Studio supports HTML, CSS, JavaScript, TypeScript compilation, Python, Lua 5.4, PHP-WASM, Java-WASM, Ruby (CRuby/WASI), R (webR), Perl (ZeroPerl/WASI) and SQLite-WASM, plus Markdown, JSON and YAML. Language runtimes and project drafts are browser-local; webR and its runtime assets are self-hosted by the build rather than loaded from a runtime CDN. Safe mode is the default, disables package installation and does not provide outbound networking. Project-local imports are supported for Python modules, PHP `require`/`include`, Lua `require`, Ruby `require`/`require_relative`, R `source()`, Perl `use`/`require`, SQL `.read`, and HTML/CSS/JavaScript project assets. Java combines explicitly referenced sources from the same package; the current Java WASM compiler does not provide a general multi-package classpath.
  - **Execution modes:** Experimental mode remains manual-run only and asks for confirmation on every run. Python may fetch configured pip packages into a disposable worker; JavaScript ESM imports resolve through esm.sh; HTML previews may use HTTPS while active; and R may fetch only explicitly configured packages precompiled for WebAssembly from the webR repository. R scripts do not receive an arbitrary network bridge. Ruby and Perl gem/CPAN installation and native host OS/network APIs are unavailable and are rejected rather than simulated. Experimental runtimes are destroyed after each run. TypeScript compilation still handles one file at a time and does not support imports/exports. SQL runs against an in-memory database and renders query rows in Preview. Browser-run code uses device resources; avoid secrets and untrusted or non-terminating code.
  - **Starters and terminal:** Starters include a task-list website, Python/Lua modules, PHP includes, Java same-package sources, SQL schema/data, Ruby modules, an R data/helper project, and Perl modules. The project terminal is not an OS shell and does not provide Git, arbitrary commands, host files, credentials or remote execution; use documented project-local commands such as `ruby`, `r` and `perl`.
  - **Explorer:** Create, rename, move, copy and delete nested folders and text files through accessible in-editor dialogs and context-menu actions. Drag and drop moves entries between folders. With the explorer focused, use Ctrl/Cmd+C to copy, Ctrl/Cmd+X to cut, Ctrl/Cmd+V to paste, F2 to rename, Delete or Backspace to delete, and Shift+F10 to open the menu. The explorer clipboard is internal to Studio.
  - **Import and backup:** Import text files or a folder into the project; binary files are not supported. Folder import cannot include empty folders because the browser only supplies files. Export a JSON backup and import it to restore a project; importing a backup replaces the current browser draft.
  - **Storage:** The project is virtual and saved in the browser. Editing it does not modify the original files on your computer or synchronize with GitHub. Export a JSON backup before clearing browser site data, which can erase the draft.
  - **Appearance:** Choose a dark, light or high-contrast theme and adjust the code font size and interface size.
  - **Program input and PHP pages:** Use the **Program input** box before running Python, PHP or Java. Python supports `input()` and `sys.stdin` with queued lines; Java receives the buffer through `System.in` for `Scanner`/`BufferedReader`; PHP receives it through `php://input` and `/workspace/stdin.txt`. A successful PHP script is also rendered as a sandboxed web page in Preview, while its stdout and errors remain visible in Terminal. PHP forms do not have a server round-trip; use the input box to provide request data. Java's browser runtime accepts preloaded stdin per run rather than a live interactive channel, and PHP's installed WASM API does not expose a CLI stdin stream.
  - **Lua and SQL:** `.lua` files run in a sandboxed Lua 5.4 WebAssembly runtime; `print()` and `io.write()` appear in Terminal, while `io.read()` consumes queued lines from **Program input**. `.sql` files run against a fresh in-memory SQLite database, support multiple statements, and render query columns and rows in Preview. SQL state is reset when the runtime is reset or the editor is closed; no database file or network connection is exposed.
- [Front-end tools](https://github.com/zytherdev/tzrender/blob/main/tools.html): eight focused utilities for starter HTML, color and contrast, CSS layout and visual effects.

## Troubleshooting

- **`ui.ready` rejects:** Check that the package's bundled `src/styles/` files are included in the installed package and that the module is served over HTTP/HTTPS. Catch the Promise rejection if your page has its own fallback styles.
- **The component is unstyled:** Await `ui.ready`, then inspect the browser console and Network panel for failed requests to the package CSS files. Do not open the project directly as `file://`.
- **`page()` rejects:** Check the URL, server response status and CORS rules. A failed response leaves the current host content intact; a successful response may still have some tags removed by the default sanitizer.
- **A component cannot find its container or target:** Make sure the element exists before calling the method. `container` accepts a selector or `Element`; `tooltip` and `menu` also need a matching trigger.
- **A dialog callback is not running:** Confirm the correct button was clicked. Cancel and the top close button call the cancel callback; Escape and backdrop dismissal do too when enabled.

## Browser support

Use a modern browser with ES module, `fetch`, DOM, `AbortSignal`, focus, and `inert` support. Serve the site or app over HTTP/HTTPS so package styles and modules can load correctly.
