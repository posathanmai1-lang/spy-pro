# Privacy Policy — Fullscreen Control

**Last updated:** 2026-09-17

## Summary

Fullscreen Control collects **no data**. Zero. Nothing leaves your device.

---

## What data is stored

All data is stored **locally on your device only**:

| Data | Where | Purpose |
|---|---|---|
| Your per-site rules (host patterns + policies) | `chrome.storage.sync` | Sync across your own Chrome profile. Never sent to us. Google may sync it between your devices if you are signed in to Chrome — this is Chrome's built-in sync, controlled by you. |
| Statistics counters (blocked count, etc.) | `chrome.storage.local` | Displayed in the popup. Never sent anywhere. |
| Windowed mode tab state, Esc cooldowns | `chrome.storage.session` | Ephemeral per-session state needed for windowed mode restore and sticky cooldown. Cleared when Chrome restarts. |
| Debug logs (if enabled) | `chrome.storage.session` | Verbose event log for troubleshooting. Off by default. Cleared on restart. |

## What data is NOT collected

- ❌ No analytics or telemetry
- ❌ No crash reports sent to any server
- ❌ No user identifiers
- ❌ No page content, URLs, or browsing history sent anywhere
- ❌ No cookies read or written
- ❌ No network requests made by this extension (other than loading Google Fonts in the options/popup UI from Google's CDN — you can inspect this in the source)
- ❌ No remote code execution (no `eval`, no remotely-fetched scripts)

## Permissions and privacy

Every permission this extension uses is described in the README. We request the minimum set necessary. We specifically do **not** request `webRequest`, `webRequestBlocking`, `cookies`, `history`, or `identity`.

## Source code

The full source code is available and readable. The build output in `dist/` is non-minified (`minify: false` in `vite.config.ts`) so you can inspect exactly what runs in your browser.

## Contact

This is an open-source project. If you have privacy concerns, open an issue on the repository.
