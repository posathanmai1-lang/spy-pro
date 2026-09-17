# Spy Pro — by Thanmai

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Extension-Manifest%20V3-blue.svg)](manifest.json)
[![Tests](https://img.shields.io/badge/Tests-30%20Passed-emerald.svg)](src/lib/rules.test.ts)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-purple.svg)](#privacy--security)

**Spy Pro** is an open-source Manifest V3 Chromium browser extension that puts full control over browser fullscreen requests, pointer lock, and window behavior back in your hands.

Whether you want video elements to fill the current browser tab without taking over your entire OS desktop, open video streams into clean popup windows, force sticky fullscreen across site navigations, or block disruptive sites from stealing pointer focus—**Spy Pro** does it all cleanly without page reloads.

---

## ✨ Features

- ⬛ **In-Window Fullscreen**: Expand video players to fill the browser tab viewport while keeping tabs, address bar, and OS taskbar accessible.
- 🪟 **Windowed Mode**: Detach fullscreen videos into a clean, dedicated popup window.
- 📌 **Sticky Fullscreen**: Keep chosen domains in programmatic fullscreen mode seamlessly across site redirects and page navigations.
- 🚫 **Fullscreen & Pointer Lock Blocker**: Block unwanted fullscreen calls, F11 key overrides, and pointer lock captures per domain.
- 📺 **Picture-in-Picture (PiP)**: One-click native PiP shortcut for any `<video>` element.
- 🛡️ **Fragile Site Presets**: Built-in compatibility handles for YouTube, Vimeo, Twitch, and Netflix overlay subtitling and player structures.
- 🎨 **Modern Interface**: Glassmorphic dark UI with per-site quick toggles, pause timer (1h/4h), live statistics, and custom domain wildcard rule management (`*.domain.com`).

---

## 🔒 Privacy & Security

- **100% Offline & Private**: All domain rules and settings are stored locally on your device via standard `chrome.storage.sync`.
- **Zero Telemetry**: No tracking, no external API calls, no network analytics, and no remote code execution.
- **Secure Dual-World Sandbox**: Content logic is isolated from web pages with random token validation to prevent page scripts from interfering with extension controls.

---

## 🚀 Installation

### Option 1: Load Unpacked (Development / Manual Installation)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/posathanmai1-lang/spy-pro.git
   cd spy-pro
   ```
2. Install dependencies and build the extension:
   ```bash
   npm install
   npm run build
   ```
3. Open your Chromium browser (**Chrome**, **Edge**, **Brave**, **Opera**):
   - Navigate to `chrome://extensions` or `edge://extensions`.
   - Enable **Developer mode** (toggle in the top-right corner).
   - Click **Load unpacked** and select the `dist/` directory generated inside the project folder.

---

## 🛠️ Development & Building

### Prerequisites
- Node.js 18.0.0 or higher
- npm / pnpm / yarn

### Available Scripts

- **`npm run dev`**: Build extension in watch mode for development.
- **`npm run build`**: Typecheck and build optimized bundle into `dist/`.
- **`npm run test`**: Run automated unit test suite with Vitest.
- **`npx tsc --noEmit`**: Perform strict TypeScript type verification.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Browser Tab                       │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │     MAIN World        │       │    ISOLATED World     │  │
│  │ (main-world.ts)       │ ◄───► │ (isolated.ts)         │  │
│  │ Intercepts prototype  │ Token │ Shadow DOM HUD &      │  │
│  │ fullscreen methods    │       │ In-window styling     │  │
│  └───────────────────────┘       └──────────┬────────────┘  │
└─────────────────────────────────────────────┼───────────────┘
                                              │ chrome.runtime
                                              ▼
                                 ┌─────────────────────────┐
                                 │     Service Worker      │
                                 │  (service-worker.ts)    │
                                 │ Storage & Rules Engine  │
                                 └─────────────────────────┘
```

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.

Developed with ❤️ by **Thanmai** ([@posathanmai1-lang](https://github.com/posathanmai1-lang)).
