import { M as MSG_SOURCE } from "./messages-DZ8XntxE.js";
const HUD_CSS_RAW = `/**\r
 * HUD styles — injected into a Shadow DOM, so these only affect\r
 * the HUD elements and cannot bleed into page styles.\r
 *\r
 * The HUD is a compact overlay that appears when policy is 'ask'\r
 * or the user presses Alt+Shift+F.\r
 */\r
\r
:host {\r
  all: initial;\r
  display: block;\r
  position: fixed;\r
  inset: 0;\r
  z-index: 2147483647;\r
  pointer-events: none;\r
  font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;\r
}\r
\r
/* ── Backdrop ── */\r
.fsc-backdrop {\r
  position: fixed;\r
  inset: 0;\r
  background: rgba(0, 0, 0, 0.55);\r
  backdrop-filter: blur(4px);\r
  -webkit-backdrop-filter: blur(4px);\r
  pointer-events: all;\r
  opacity: 0;\r
  animation: fsc-fade-in 150ms ease forwards;\r
}\r
\r
/* ── Main card ── */\r
.fsc-hud {\r
  position: fixed;\r
  top: 50%;\r
  left: 50%;\r
  transform: translate(-50%, -50%) scale(0.92);\r
  width: 340px;\r
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);\r
  border: 1px solid rgba(255, 255, 255, 0.12);\r
  border-radius: 16px;\r
  box-shadow:\r
    0 24px 48px rgba(0, 0, 0, 0.6),\r
    0 0 0 1px rgba(255, 255, 255, 0.05),\r
    inset 0 1px 0 rgba(255, 255, 255, 0.1);\r
  padding: 20px 20px 16px;\r
  pointer-events: all;\r
  color: #ffffff;\r
  opacity: 0;\r
  animation: fsc-slide-in 180ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;\r
}\r
\r
/* Light mode */\r
@media (prefers-color-scheme: light) {\r
  .fsc-hud {\r
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);\r
    border-color: rgba(0, 0, 0, 0.1);\r
    color: #0f172a;\r
    box-shadow:\r
      0 24px 48px rgba(0, 0, 0, 0.15),\r
      0 0 0 1px rgba(0, 0, 0, 0.06);\r
  }\r
  .fsc-hud-title { color: #475569; }\r
  .fsc-option-hint { color: #64748b; }\r
  .fsc-site-label { color: #334155; background: rgba(0,0,0,0.06); }\r
  .fsc-divider { border-color: rgba(0,0,0,0.1); }\r
}\r
\r
/* ── Header ── */\r
.fsc-hud-header {\r
  display: flex;\r
  align-items: center;\r
  gap: 8px;\r
  margin-bottom: 16px;\r
}\r
\r
.fsc-hud-logo {\r
  width: 22px;\r
  height: 22px;\r
  flex-shrink: 0;\r
}\r
\r
.fsc-hud-title {\r
  font-size: 11px;\r
  font-weight: 600;\r
  text-transform: uppercase;\r
  letter-spacing: 0.08em;\r
  color: rgba(255, 255, 255, 0.5);\r
  flex: 1;\r
}\r
\r
.fsc-site-label {\r
  font-size: 11px;\r
  color: rgba(255, 255, 255, 0.7);\r
  background: rgba(255, 255, 255, 0.08);\r
  padding: 2px 8px;\r
  border-radius: 20px;\r
  max-width: 140px;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
/* ── Option buttons grid ── */\r
.fsc-options {\r
  display: grid;\r
  grid-template-columns: 1fr 1fr 1fr;\r
  gap: 8px;\r
  margin-bottom: 12px;\r
}\r
\r
.fsc-option {\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  gap: 4px;\r
  padding: 12px 8px 10px;\r
  background: rgba(255, 255, 255, 0.06);\r
  border: 1px solid rgba(255, 255, 255, 0.08);\r
  border-radius: 10px;\r
  cursor: pointer;\r
  transition: all 120ms ease;\r
  color: inherit;\r
  font-family: inherit;\r
  text-align: center;\r
  user-select: none;\r
}\r
\r
.fsc-option:hover, .fsc-option:focus-visible {\r
  background: rgba(255, 255, 255, 0.14);\r
  border-color: rgba(255, 255, 255, 0.2);\r
  transform: translateY(-1px);\r
  outline: none;\r
}\r
\r
.fsc-option:active {\r
  transform: translateY(0);\r
  background: rgba(255, 255, 255, 0.2);\r
}\r
\r
.fsc-option[data-mode="in-window"] { --accent: #3b82f6; }\r
.fsc-option[data-mode="windowed"]  { --accent: #8b5cf6; }\r
.fsc-option[data-mode="native"]   { --accent: #10b981; }\r
.fsc-option[data-mode="pip"]      { --accent: #f59e0b; }\r
.fsc-option[data-mode="block"]    { --accent: #ef4444; }\r
.fsc-option[data-mode="sticky"]   { --accent: #f97316; }\r
\r
.fsc-option:hover, .fsc-option:focus-visible {\r
  background: color-mix(in srgb, var(--accent, white) 15%, transparent);\r
  border-color: color-mix(in srgb, var(--accent, white) 30%, transparent);\r
}\r
\r
.fsc-option-icon {\r
  font-size: 22px;\r
  line-height: 1;\r
}\r
\r
.fsc-option-label {\r
  font-size: 12px;\r
  font-weight: 600;\r
  color: inherit;\r
}\r
\r
.fsc-option-hint {\r
  font-size: 10px;\r
  color: rgba(255, 255, 255, 0.4);\r
  font-family: 'SF Mono', 'Cascadia Code', monospace;\r
}\r
\r
/* PiP button (only shown when video present) */\r
.fsc-option[data-mode="pip"].fsc-hidden {\r
  display: none;\r
}\r
\r
/* ── Divider ── */\r
.fsc-divider {\r
  border: none;\r
  border-top: 1px solid rgba(255, 255, 255, 0.08);\r
  margin: 4px 0 10px;\r
}\r
\r
/* ── Footer ── */\r
.fsc-footer {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  font-size: 11px;\r
  color: rgba(255, 255, 255, 0.35);\r
}\r
\r
.fsc-esc-hint {\r
  display: flex;\r
  align-items: center;\r
  gap: 4px;\r
}\r
\r
.fsc-kbd {\r
  display: inline-block;\r
  background: rgba(255, 255, 255, 0.1);\r
  border: 1px solid rgba(255, 255, 255, 0.15);\r
  border-radius: 4px;\r
  padding: 1px 5px;\r
  font-size: 10px;\r
  font-family: monospace;\r
}\r
\r
.fsc-always-link {\r
  color: rgba(255, 255, 255, 0.45);\r
  cursor: pointer;\r
  text-decoration: underline;\r
  text-underline-offset: 2px;\r
  background: none;\r
  border: none;\r
  font-size: 11px;\r
  font-family: inherit;\r
  padding: 0;\r
}\r
.fsc-always-link:hover { color: rgba(255, 255, 255, 0.7); }\r
\r
/* ── Gesture overlay (sticky mode user-gesture button) ── */\r
.fsc-gesture-overlay {\r
  position: fixed;\r
  bottom: 24px;\r
  left: 50%;\r
  transform: translateX(-50%);\r
  z-index: 2147483646;\r
  background: linear-gradient(135deg, #f97316, #ef4444);\r
  color: white;\r
  border: none;\r
  border-radius: 50px;\r
  padding: 10px 24px;\r
  font-size: 14px;\r
  font-weight: 600;\r
  font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;\r
  cursor: pointer;\r
  box-shadow: 0 8px 24px rgba(249, 115, 22, 0.4);\r
  pointer-events: all;\r
  animation: fsc-fade-in 200ms ease forwards;\r
  white-space: nowrap;\r
}\r
.fsc-gesture-overlay:hover {\r
  filter: brightness(1.1);\r
  transform: translateX(-50%) scale(1.02);\r
}\r
.fsc-gesture-overlay:active {\r
  transform: translateX(-50%) scale(0.98);\r
}\r
\r
/* ── Animations ── */\r
@keyframes fsc-fade-in {\r
  from { opacity: 0; }\r
  to   { opacity: 1; }\r
}\r
\r
@keyframes fsc-slide-in {\r
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }\r
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }\r
}\r
\r
@keyframes fsc-fade-out {\r
  from { opacity: 1; }\r
  to   { opacity: 0; }\r
}\r
`;
const HUD_CSS = HUD_CSS_RAW;
const TOKEN_KEY = "fsc_token";
function getOrCreateToken() {
  let token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    sessionStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}
const TOKEN = getOrCreateToken();
function broadcastToken() {
  window.postMessage({ source: MSG_SOURCE, type: "INIT_TOKEN", token: TOKEN }, "*");
}
broadcastToken();
setTimeout(broadcastToken, 50);
let currentPolicy = null;
let currentSpoof = false;
let blockPointerLock = false;
let blockF11 = false;
let hideCursorAfterIdleMs = 0;
let showGestureButton = true;
let isPip = false;
let isInWindowActive = false;
window.addEventListener("message", (ev) => {
  if (ev.source !== window) return;
  const msg = ev.data;
  if (!msg || msg.source !== MSG_SOURCE) return;
  if (msg.token !== TOKEN) return;
  switch (msg.type) {
    case "FULLSCREEN_REQUESTED":
      handleFullscreenRequest(msg);
      break;
    case "EXITED":
      handleExited();
      break;
  }
}, false);
function handleFullscreenRequest(msg) {
  const requestId = msg.requestId;
  const swMsg = {
    type: "FULLSCREEN_REQUESTED",
    url: window.location.href,
    tag: msg.tag,
    hasVideo: msg.hasVideo,
    shiftKey: msg.shiftKey,
    isIframe: msg.isIframe
  };
  chrome.runtime.sendMessage(swMsg, (response) => {
    if (chrome.runtime.lastError || !response) {
      resolveRequest(requestId, "NATIVE");
      return;
    }
    applyRuleResponse(response, msg.hasVideo, msg.shiftKey, requestId);
  });
}
function applyRuleResponse(response, hasVideo, shiftKey, requestId) {
  if (response.type === "APPLY_RULE") {
    currentPolicy = response.policy;
    currentSpoof = response.spoof;
    blockPointerLock = response.blockPointerLock;
    blockF11 = response.blockF11;
    hideCursorAfterIdleMs = response.hideCursorAfterIdleMs;
    showGestureButton = response.showGestureButton;
    isPip = response.pip;
    if (shiftKey) {
      showHUD(hasVideo, isPip, requestId);
      return;
    }
    switch (response.policy) {
      case "ask":
        showHUD(hasVideo, isPip, requestId);
        break;
      case "in-window":
        activateInWindow(requestId);
        break;
      case "windowed":
        activateWindowed(requestId);
        break;
      case "native":
        resolveRequest(requestId, "NATIVE");
        break;
      case "block":
        resolveRequest(requestId, "REJECT", "NotAllowedError");
        break;
      case "sticky":
        resolveRequest(requestId, "NATIVE");
        break;
    }
  } else if (response.type === "SHOW_HUD") {
    showHUD(response.hasVideo, response.pip, requestId);
  } else if (response.type === "SHOW_GESTURE_OVERLAY") {
    showGestureOverlay();
    resolveRequest(requestId, "REJECT", "Gesture required");
  } else if (response.type === "EXIT") {
    handleExited();
  }
}
const IN_WINDOW_STYLE_ID = "fsc-in-window-style";
let inWindowObserver = null;
function activateInWindow(requestId) {
  isInWindowActive = true;
  const target = findBestTarget();
  applyInWindowCSS(target);
  sendToMain({ source: MSG_SOURCE, token: TOKEN, type: "SET_MODE", mode: "in-window", spoof: currentSpoof });
  resolveRequest(requestId, "RESOLVE");
  if (target && target !== document.documentElement) {
    inWindowObserver = new MutationObserver(() => {
      if (!document.contains(target)) {
        const newTarget = findBestTarget();
        if (newTarget && newTarget !== target) {
          applyInWindowCSS(newTarget);
        }
      }
    });
    inWindowObserver.observe(document.body, { childList: true, subtree: true });
  }
  installEscapeHandler();
  void chrome.runtime.sendMessage({ type: "INCREMENT_STAT", key: "redirectedToInWindow" });
}
function applyInWindowCSS(target) {
  removeInWindowCSS();
  const style = document.createElement("style");
  style.id = IN_WINDOW_STYLE_ID;
  style.setAttribute("data-fsc", "1");
  const selector = getUniqueSelector(target);
  const captionSelector = findCaptionSelector(target);
  style.textContent = `
    /* Fullscreen Control — in-window mode */
    html, body {
      overflow: hidden !important;
    }
    ${selector} {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      max-width: 100vw !important;
      max-height: 100vh !important;
      z-index: 2147483646 !important;
      background: #000 !important;
      margin: 0 !important;
      padding: 0 !important;
      border-radius: 0 !important;
      transform: none !important;
    }
    ${captionSelector ? `${captionSelector} { z-index: 2147483647 !important; }` : ""}
  `;
  document.documentElement.appendChild(style);
}
function removeInWindowCSS() {
  document.getElementById(IN_WINDOW_STYLE_ID)?.remove();
  if (inWindowObserver) {
    inWindowObserver.disconnect();
    inWindowObserver = null;
  }
}
function findBestTarget() {
  const videos = Array.from(document.querySelectorAll("video"));
  if (videos.length > 0) {
    const visible = videos.filter((v) => {
      const r = v.getBoundingClientRect();
      return r.width > 100 && r.height > 100;
    });
    if (visible.length > 0) {
      return visible.reduce((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return ra.width * ra.height > rb.width * rb.height ? a : b;
      });
    }
  }
  return document.documentElement;
}
function findCaptionSelector(target) {
  const captionSelectors = [
    ".ytp-caption-window-container",
    // YouTube
    ".vjs-text-track-display",
    // Video.js
    '[class*="caption"]',
    '[class*="subtitle"]',
    '[class*="cc-"]',
    ".player-timedtext",
    // Netflix
    ".vp-captions"
    // Vimeo
  ];
  for (const sel of captionSelectors) {
    if (target.querySelector(sel)) return sel;
    if (document.querySelector(sel)) return sel;
  }
  return "";
}
function getUniqueSelector(el) {
  if (el === document.documentElement) return "html";
  if (el === document.body) return "body";
  if (el.id) {
    return `#${CSS.escape(el.id)}`;
  }
  for (const attr of el.getAttributeNames()) {
    if (attr.startsWith("data-")) {
      const val = el.getAttribute(attr);
      if (val) return `[${attr}="${CSS.escape(val)}"]`;
    }
  }
  const tag = el.tagName.toLowerCase();
  const siblings = el.parentElement ? Array.from(el.parentElement.children).filter((c) => c.tagName === el.tagName) : [];
  const idx = siblings.indexOf(el) + 1;
  return `${tag}:nth-of-type(${idx})`;
}
function activateWindowed(requestId) {
  sendToMain({ source: MSG_SOURCE, token: TOKEN, type: "SET_MODE", mode: "windowed", spoof: currentSpoof });
  resolveRequest(requestId, "RESOLVE");
  void chrome.runtime.sendMessage({
    type: "INCREMENT_STAT",
    key: "redirectedToWindowed"
  });
}
let hudRoot = null;
let hudShadow = null;
let hudPendingRequestId;
let hudHasVideo = false;
function showHUD(hasVideo, pip, requestId) {
  hudPendingRequestId = requestId;
  hudHasVideo = hasVideo;
  if (hudRoot) {
    updateHUDPipVisibility(pip);
    focusFirstHUDOption();
    return;
  }
  hudRoot = document.createElement("div");
  hudRoot.setAttribute("data-fsc-hud", "1");
  hudShadow = hudRoot.attachShadow({ mode: "closed" });
  const styleEl = document.createElement("style");
  styleEl.textContent = HUD_CSS;
  hudShadow.appendChild(styleEl);
  const hostname = window.location.hostname;
  hudShadow.innerHTML += `
    <div class="fsc-backdrop" role="dialog" aria-modal="true" aria-label="Fullscreen mode selection"></div>
    <div class="fsc-hud" role="dialog">
      <div class="fsc-hud-header">
        <svg class="fsc-hud-logo" viewBox="0 0 22 22" fill="none">
          <rect width="22" height="22" rx="6" fill="url(#g)"/>
          <defs><linearGradient id="g" x1="0" y1="0" x2="22" y2="22">
            <stop stop-color="#3b82f6"/><stop offset="1" stop-color="#8b5cf6"/>
          </linearGradient></defs>
          <path d="M5 8V5h3M14 5h3v3M17 14v3h-3M8 17H5v-3" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <span class="fsc-hud-title">Spy Pro</span><span style="color:#14b8a6; font-size:11px; margin-left:4px; font-weight:500;">— by Thanmai</span>
        <span class="fsc-site-label" title="${hostname}">${hostname}</span>
      </div>

      <div class="fsc-options">
        <button class="fsc-option" data-mode="in-window" title="Fill this tab (no OS fullscreen)">
          <span class="fsc-option-icon">⬛</span>
          <span class="fsc-option-label">In-window</span>
          <span class="fsc-option-hint">i</span>
        </button>
        <button class="fsc-option" data-mode="windowed" title="Move to popup window">
          <span class="fsc-option-icon">🪟</span>
          <span class="fsc-option-label">Windowed</span>
          <span class="fsc-option-hint">w</span>
        </button>
        <button class="fsc-option" data-mode="native" title="Allow native OS fullscreen">
          <span class="fsc-option-icon">⛶</span>
          <span class="fsc-option-label">Fullscreen</span>
          <span class="fsc-option-hint">f</span>
        </button>
        <button class="fsc-option ${pip && hasVideo ? "" : "fsc-hidden"}" data-mode="pip" title="Picture in Picture">
          <span class="fsc-option-icon">📺</span>
          <span class="fsc-option-label">PiP</span>
          <span class="fsc-option-hint">p</span>
        </button>
        <button class="fsc-option" data-mode="block" title="Block fullscreen on this site">
          <span class="fsc-option-icon">🚫</span>
          <span class="fsc-option-label">Block site</span>
          <span class="fsc-option-hint">b</span>
        </button>
        <button class="fsc-option" data-mode="sticky" title="Always keep this site fullscreen">
          <span class="fsc-option-icon">📌</span>
          <span class="fsc-option-label">Sticky</span>
          <span class="fsc-option-hint">s</span>
        </button>
      </div>

      <hr class="fsc-divider"/>
      <div class="fsc-footer">
        <span class="fsc-esc-hint">
          <kbd class="fsc-kbd">Esc</kbd> dismiss
        </span>
        <button class="fsc-always-link" data-action="always">Always use for this site</button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(hudRoot);
  wireHUDEvents(hudShadow);
  focusFirstHUDOption();
}
function wireHUDEvents(shadow) {
  shadow.querySelectorAll(".fsc-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-mode");
      handleHUDChoice(mode);
    });
    btn.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        const mode = btn.getAttribute("data-mode");
        handleHUDChoice(mode);
      }
    });
  });
  shadow.querySelector(".fsc-backdrop")?.addEventListener("click", () => {
    dismissHUD();
  });
  shadow.querySelector('[data-action="always"]')?.addEventListener("click", () => {
    if (currentPolicy) {
      void chrome.runtime.sendMessage({
        type: "SET_RULE",
        host: window.location.hostname,
        policy: currentPolicy
      });
    }
    dismissHUD();
  });
  shadow.addEventListener("keydown", (ev) => {
    const key = ev.key.toLowerCase();
    const map = {
      "i": "in-window",
      "w": "windowed",
      "f": "native",
      "p": "pip",
      "b": "block",
      "s": "sticky"
    };
    if (map[key]) {
      ev.preventDefault();
      handleHUDChoice(map[key]);
    } else if (key === "escape") {
      dismissHUD();
    }
  });
}
function handleHUDChoice(mode) {
  if (mode === "pip") {
    activatePiP();
    dismissHUD();
    return;
  }
  currentPolicy = mode;
  dismissHUD();
  switch (mode) {
    case "in-window":
      activateInWindow(hudPendingRequestId);
      break;
    case "windowed":
      void chrome.runtime.sendMessage({
        type: "FULLSCREEN_REQUESTED",
        url: window.location.href,
        tag: "",
        hasVideo: hudHasVideo,
        shiftKey: false,
        isIframe: false
      });
      resolveRequest(hudPendingRequestId, "RESOLVE");
      break;
    case "native":
      resolveRequest(hudPendingRequestId, "NATIVE");
      break;
    case "block":
      void chrome.runtime.sendMessage({
        type: "SET_RULE",
        host: window.location.hostname,
        policy: "block"
      });
      resolveRequest(hudPendingRequestId, "REJECT", "NotAllowedError");
      break;
    case "sticky":
      void chrome.runtime.sendMessage({
        type: "SET_RULE",
        host: window.location.hostname,
        policy: "sticky"
      });
      resolveRequest(hudPendingRequestId, "NATIVE");
      break;
  }
}
function dismissHUD() {
  if (!hudRoot) return;
  const card = hudShadow?.querySelector(".fsc-hud");
  const backdrop = hudShadow?.querySelector(".fsc-backdrop");
  if (card) card.style.animation = "fsc-fade-out 120ms ease forwards";
  if (backdrop) backdrop.style.animation = "fsc-fade-out 120ms ease forwards";
  setTimeout(() => {
    hudRoot?.remove();
    hudRoot = null;
    hudShadow = null;
  }, 130);
}
function updateHUDPipVisibility(pip) {
  const pipBtn = hudShadow?.querySelector('[data-mode="pip"]');
  if (pipBtn) {
    pipBtn.classList.toggle("fsc-hidden", !pip);
  }
}
function focusFirstHUDOption() {
  setTimeout(() => {
    const first = hudShadow?.querySelector(".fsc-option:not(.fsc-hidden)");
    first?.focus();
  }, 50);
}
function activatePiP() {
  const video = document.querySelector("video");
  if (!video) return;
  if (!document.pictureInPictureEnabled) return;
  video.requestPictureInPicture().then(() => {
    void chrome.runtime.sendMessage({ type: "INCREMENT_STAT", key: "pipActivations" });
  }).catch((err) => {
    console.warn("[FullscreenControl] PiP failed:", err);
  });
}
let gestureOverlayRoot = null;
let gestureHideTimer = null;
const GESTURE_AUTO_HIDE_MS = 1e4;
function showGestureOverlay() {
  if (gestureOverlayRoot) return;
  gestureOverlayRoot = document.createElement("div");
  gestureOverlayRoot.setAttribute("data-fsc-gesture", "1");
  const shadow = gestureOverlayRoot.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = HUD_CSS;
  shadow.appendChild(style);
  const btn = document.createElement("button");
  btn.className = "fsc-gesture-overlay";
  btn.textContent = "⛶  Enter fullscreen";
  shadow.appendChild(btn);
  btn.addEventListener("click", () => {
    void document.documentElement.requestFullscreen().then(() => {
      void chrome.runtime.sendMessage({
        type: "GESTURE_FULLSCREEN_SUCCESS",
        url: window.location.href
      });
      removeGestureOverlay();
    }).catch((e) => {
      console.warn("[FullscreenControl] Gesture fullscreen failed:", e);
    });
  });
  document.documentElement.appendChild(gestureOverlayRoot);
  if (gestureHideTimer) clearTimeout(gestureHideTimer);
  gestureHideTimer = setTimeout(removeGestureOverlay, GESTURE_AUTO_HIDE_MS);
}
function removeGestureOverlay() {
  gestureOverlayRoot?.remove();
  gestureOverlayRoot = null;
  if (gestureHideTimer) {
    clearTimeout(gestureHideTimer);
    gestureHideTimer = null;
  }
}
let escapeHandlerInstalled = false;
function installEscapeHandler() {
  if (escapeHandlerInstalled) return;
  escapeHandlerInstalled = true;
  document.addEventListener("keydown", handleEscapeKey, { capture: true });
}
function removeEscapeHandler() {
  escapeHandlerInstalled = false;
  document.removeEventListener("keydown", handleEscapeKey, { capture: true });
}
function handleEscapeKey(ev) {
  if (ev.key !== "Escape") return;
  if (!isInWindowActive && !hudRoot) return;
  ev.stopImmediatePropagation();
  if (hudRoot) {
    dismissHUD();
    resolveRequest(hudPendingRequestId, "REJECT", "User dismissed HUD");
    return;
  }
  if (isInWindowActive) {
    exitInWindow();
  }
}
function exitInWindow() {
  isInWindowActive = false;
  removeInWindowCSS();
  removeEscapeHandler();
  sendToMain({ source: MSG_SOURCE, token: TOKEN, type: "EXIT" });
  void chrome.runtime.sendMessage({
    type: "FULLSCREEN_EXITED",
    url: window.location.href
  });
}
document.addEventListener("keydown", (ev) => {
  if (!blockF11) return;
  if (ev.key === "F11") {
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }
}, { capture: true });
let cursorHideTimer = null;
let cursorHidden = false;
const CURSOR_HIDE_STYLE_ID = "fsc-cursor-hide";
function startCursorHide() {
  if (!hideCursorAfterIdleMs) return;
  const showCursor = () => {
    if (cursorHideTimer) clearTimeout(cursorHideTimer);
    if (cursorHidden) {
      document.getElementById(CURSOR_HIDE_STYLE_ID)?.remove();
      cursorHidden = false;
    }
    cursorHideTimer = setTimeout(hideCursor, hideCursorAfterIdleMs);
  };
  const hideCursor = () => {
    cursorHidden = true;
    if (!document.getElementById(CURSOR_HIDE_STYLE_ID)) {
      const s = document.createElement("style");
      s.id = CURSOR_HIDE_STYLE_ID;
      s.textContent = "* { cursor: none !important; }";
      document.head?.appendChild(s);
    }
  };
  document.addEventListener("mousemove", showCursor, { passive: true });
  cursorHideTimer = setTimeout(hideCursor, hideCursorAfterIdleMs);
}
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleSWMessage(msg);
  sendResponse({ ok: true });
  return false;
});
function handleSWMessage(msg) {
  switch (msg.type) {
    case "APPLY_RULE":
      currentPolicy = msg.policy;
      currentSpoof = msg.spoof;
      blockPointerLock = msg.blockPointerLock;
      blockF11 = msg.blockF11;
      hideCursorAfterIdleMs = msg.hideCursorAfterIdleMs;
      showGestureButton = msg.showGestureButton;
      isPip = msg.pip;
      sendToMain({
        source: MSG_SOURCE,
        token: TOKEN,
        type: "SET_MODE",
        mode: msg.policy,
        spoof: msg.spoof,
        blockPointerLock
      });
      if (msg.policy === "sticky") {
        startCursorHide();
      }
      break;
    case "SHOW_HUD":
      showHUD(msg.hasVideo, msg.pip, void 0);
      break;
    case "SHOW_GESTURE_OVERLAY":
      if (showGestureButton) showGestureOverlay();
      break;
    case "EXIT":
      if (isInWindowActive) exitInWindow();
      dismissHUD();
      sendToMain({ source: MSG_SOURCE, token: TOKEN, type: "EXIT" });
      break;
  }
}
function sendToMain(msg) {
  window.postMessage(msg, "*");
}
function resolveRequest(requestId, result, reason) {
  if (!requestId) return;
  window.postMessage({
    source: MSG_SOURCE,
    token: TOKEN,
    type: result,
    requestId,
    reason
  }, "*");
}
function handleExited() {
  if (isInWindowActive) {
    exitInWindow();
  }
}
document.addEventListener("keydown", (ev) => {
  if (ev.altKey && ev.shiftKey && ev.key === "F") {
    ev.preventDefault();
    if (hudRoot) {
      dismissHUD();
    } else {
      showHUD(!!document.querySelector("video"), isPip, void 0);
    }
  }
}, { capture: true });
//# sourceMappingURL=isolated.ts-DHYI2wQo.js.map
