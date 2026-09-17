# Spy Pro — by Thanmai

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Extension-Manifest%20V3-blue.svg)](manifest.json)
[![Tests](https://img.shields.io/badge/Tests-30%20Passed-emerald.svg)](src/lib/rules.test.ts)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-purple.svg)](#privacy--security)

**Spy Pro** is an open-source Manifest V3 Chromium browser extension that puts full control over browser fullscreen requests, pointer lock, and window behavior back in your hands.

Whether you want video elements to fill the current browser tab without taking over your entire OS desktop, open video streams into clean popup windows, force sticky fullscreen across site navigations, or block disruptive sites from stealing pointer focus—**Spy Pro** does it all cleanly without page reloads.

## 📦 Quick Download & Installation

[![DOWNLOAD SPY PRO EXTENSION (.ZIP)](https://img.shields.io/badge/%E2%AC%87%EF%B8%8F%20DOWNLOAD%20SPY%20PRO%20EXTENSION-(.ZIP)-14b8a6?style=for-the-badge&logo=github&logoColor=white)](https://github.com/posathanmai1-lang/spy-pro/archive/refs/heads/main.zip)

---

### 📖 Step-by-Step Installation Guide

#### Step 1: Download & Extract
1. Click the **[DOWNLOAD SPY PRO EXTENSION (.ZIP)](https://github.com/posathanmai1-lang/spy-pro/archive/refs/heads/main.zip)** button above to get `spy-pro-main.zip`.
2. Extract (unzip) the file to any folder on your computer.

#### Step 2: Build the Extension Assets
Since **Spy Pro** is written in modern TypeScript, build the extension once to generate the production `dist/` folder:
1. Open a terminal or command prompt inside the extracted `spy-pro-main` folder.
2. Execute:
   ```bash
   npm install
   npm run build
   ```
   *(This creates the required `dist/` folder inside `spy-pro-main`)*.

#### Step 3: Load into Browser (Chrome / Edge / Brave / Opera)
1. Open your browser and go to the extensions management page:
   - **Chrome**: Type `chrome://extensions` in address bar
   - **Edge**: Type `edge://extensions` in address bar
   - **Brave**: Type `brave://extensions` in address bar
2. Turn **ON** **Developer mode** using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button (top-left).
4. Navigate into the extracted `spy-pro-main` folder, click on the **`dist`** folder, and click **Select Folder**.
5. Done! 🎉 **Spy Pro** is now installed and ready to control any site fullscreen.

---

## ✨ Features

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
