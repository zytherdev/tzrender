# 🧩 tzrender - Dynamic UI Components

**tzrender** is a modern, theme-aware, animation-powered JavaScript utility that injects UI components directly into the DOM. No need for pre-existing HTML — everything is created dynamically.

Built for sleek user experiences with built-in support for:
- Alerts
- Message Boxes
- Spinners
- Full-screen UI blockers

---

## 🚀 Features

- 🔥 Dynamic DOM insertion
- 🎨 Light/Dark theme support
- 💫 Smooth animations
- 🧱 Modular components
- 🧩 Fully customizable
- 📦 No external dependencies

---

## 📦 Installation

```js
import Render from "https://cdn.jsdelivr.net/npm/@zyther/tzrender"
```

---

## 🧪 Quick Example

```js
const ui = new Render();

ui.alert({
  theme: 'dark',
  variant: 'success',
  msg: 'Everything went well!',
  timeout: 4000
});
```

---

## 🧰 API Reference

### 🛎️ `alert(options)`

Shows a dismissible alert message with optional auto-dismiss.

```js
ui.alert({
  theme: 'light', // or 'dark'
  variant: 'info', // 'success' | 'warning' | 'error'
  msg: 'This is an alert!',
  timeout: 3000 // milliseconds
});
```

---

### 💬 `msg_box(options)`

Creates a confirmation-style message box with title, message and actions.

```js
ui.msg_box({
  theme: 'dark',
  title: 'Are you sure?',
  msg: 'This action cannot be undone.',
  action: {
    cancel: {
      text: 'Cancel',
      callback: () => console.log('Cancelled')
    },
    confirm: {
      text: 'Confirm',
      callback: () => console.log('Confirmed')
    }
  }
});
```

---

### 🔄 `spinner(options)`

Displays a loading spinner, optionally animated and themed.

```js
ui.spinner({
  variant: 'dual', // 'simple' | 'dual' | 'triple' | 'custom'
  theme: 'dark',
  backdrop: true,
  events: {
    screen_click: {
      hide: true,
      destroy: false
    },
    auto__: {
      timer: 5000,
      hide: false,
      destroy: true
    }
  },
  text: {
    content: 'Loading...',
    animated: true,
    color: 'white'
  },
  custom: {
    url: 'https://yourdomain.com/spinner.svg',
    animation: 'pulse',
    color: '#00bfff'
  }
});
```

---

### 🚫 `block_ui(options)`

Displays a full-screen blocking overlay with animated backgrounds.

```js
ui.block_ui({
  theme: 'dark', // or 'light'
  animation: 'particles', // 'particles' | 'lines' | 'shapes' | 'orbs'
  message: 'Please wait...',
  count: 80,
  events: {
    screen_click: {
      destroy: true
    },
    auto__: {
      timer: 5000,
      destroy: true
    }
  },
  custom: {
    __size: {
      min: 10,
      max: 60
    }
  }
});
```

---

## 🌍 Load Page (Optional Utility)

Loads HTML content into a container and optionally runs a callback.

```js
ui.page('/my/page.html', document.getElementById('app'), () => {
  console.log('Page loaded!');
});
```

---

## 📌 Notes

- All components are dynamically styled using embedded CSS via JS.
- Themes:
  - `light`: Uses dark-colored elements over light backgrounds.
  - `dark`: Uses light-colored elements over dark backgrounds.

---

## 🧹 Cleanup

Every component returns an `id`, or a control object (`destroy()`, `toggle()`) for manual handling.

```js
const { destroy } = ui.spinner(/*...*/);
destroy();
```

---

## 🧑‍💻 Author

Made by **zytherdev**  
Feel free to customize and integrate into your modern JavaScript applications.

---
