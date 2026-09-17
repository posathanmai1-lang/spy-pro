/**
 * Isolated world content script for Fullscreen Control.
 *
 * Runs at document_start in the isolated world (default content script sandbox).
 * Has access to chrome.* APIs but shares the DOM with the page.
 *
 * Responsibilities:
 *   1. Generate/restore install token → broadcast to MAIN world
 *   2. Bridge postMessage ↔ chrome.runtime.sendMessage
 *   3. HUD (Shadow DOM overlay) — shown for 'ask' policy or Alt+Shift+F
 *   4. In-window CSS injection and target tracking
 *   5. Sticky gesture overlay button
 *   6. F11 block (capture listener)
 *   7. Mouse cursor hide timer (sticky sites)
 *   8. Esc key handling → exit + notify SW
 */

// HUD CSS is bundled inline via Vite's ?inline query (must be at top)
// @ts-expect-error — Vite handles this import
import HUD_CSS_RAW from '../ui/hud.css?inline';
const HUD_CSS: string = HUD_CSS_RAW as string;


import type {
  MainToIsolated,
  IsolatedToMain,
  ContentToSW,
  SWToContent,
} from '../lib/messages.js';
import { MSG_SOURCE } from '../lib/messages.js';
import type { Policy } from '../lib/types.js';

// ---------------------------------------------------------------------------
// Install token (collision avoidance — not a security secret)
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'fsc_token';

function getOrCreateToken(): string {
  let token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    sessionStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

const TOKEN = getOrCreateToken();

// Broadcast token to MAIN world immediately
function broadcastToken(): void {
  window.postMessage({ source: MSG_SOURCE, type: 'INIT_TOKEN', token: TOKEN }, '*');
}
broadcastToken();
// Also re-broadcast after a short delay in case MAIN world loads slightly later
setTimeout(broadcastToken, 50);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentPolicy: Policy | null = null;
let currentSpoof = false;
let blockPointerLock = false;
let blockF11 = false;
let hideCursorAfterIdleMs = 0;
let showGestureButton = true;
let isPip = false;
let isInWindowActive = false;

// ---------------------------------------------------------------------------
// Message listener from MAIN world
// ---------------------------------------------------------------------------

window.addEventListener('message', (ev: MessageEvent): void => {
  if (ev.source !== window) return;
  const msg = ev.data as Partial<MainToIsolated> & { requestId?: string };
  if (!msg || msg.source !== MSG_SOURCE) return;
  if (msg.token !== TOKEN) return;

  switch (msg.type) {
    case 'FULLSCREEN_REQUESTED':
      handleFullscreenRequest(msg as MainToIsolated & { type: 'FULLSCREEN_REQUESTED'; requestId?: string });
      break;
    case 'EXITED':
      handleExited();
      break;
    case 'POINTER_LOCK_REQUESTED':
      // Silently denied in MAIN world when flag is on; we just log it
      break;
  }
}, false);

// ---------------------------------------------------------------------------
// Fullscreen request handler
// ---------------------------------------------------------------------------

function handleFullscreenRequest(
  msg: MainToIsolated & { type: 'FULLSCREEN_REQUESTED'; requestId?: string }
): void {
  const requestId = msg.requestId;

  // Forward to service worker to get the effective rule
  const swMsg: ContentToSW = {
    type: 'FULLSCREEN_REQUESTED',
    url: window.location.href,
    tag: msg.tag,
    hasVideo: msg.hasVideo,
    shiftKey: msg.shiftKey,
    isIframe: msg.isIframe,
  };

  chrome.runtime.sendMessage(swMsg, (response: SWToContent | null) => {
    if (chrome.runtime.lastError || !response) {
      // SW not available — pass through as native
      resolveRequest(requestId, 'NATIVE');
      return;
    }

    applyRuleResponse(response, msg.hasVideo, msg.shiftKey, requestId);
  });
}

function applyRuleResponse(
  response: SWToContent,
  hasVideo: boolean,
  shiftKey: boolean,
  requestId?: string,
): void {
  if (response.type === 'APPLY_RULE') {
    currentPolicy = response.policy;
    currentSpoof = response.spoof;
    blockPointerLock = response.blockPointerLock;
    blockF11 = response.blockF11;
    hideCursorAfterIdleMs = response.hideCursorAfterIdleMs;
    showGestureButton = response.showGestureButton;
    isPip = response.pip;

    // If Shift was held, always show HUD regardless of policy
    if (shiftKey) {
      showHUD(hasVideo, isPip, requestId);
      return;
    }

    switch (response.policy) {
      case 'ask':
        showHUD(hasVideo, isPip, requestId);
        break;
      case 'in-window':
        activateInWindow(requestId);
        break;
      case 'windowed':
        activateWindowed(requestId);
        break;
      case 'native':
        resolveRequest(requestId, 'NATIVE');
        break;
      case 'block':
        resolveRequest(requestId, 'REJECT', 'NotAllowedError');
        break;
      case 'sticky':
        // sticky handled by SW via webNavigation, but if a direct call arrives, treat as native
        resolveRequest(requestId, 'NATIVE');
        break;
    }
  } else if (response.type === 'SHOW_HUD') {
    showHUD(response.hasVideo, response.pip, requestId);
  } else if (response.type === 'SHOW_GESTURE_OVERLAY') {
    showGestureOverlay();
    resolveRequest(requestId, 'REJECT', 'Gesture required');
  } else if (response.type === 'EXIT') {
    handleExited();
  }
}

// ---------------------------------------------------------------------------
// In-window mode
// ---------------------------------------------------------------------------

const IN_WINDOW_STYLE_ID = 'fsc-in-window-style';
let inWindowObserver: MutationObserver | null = null;

function activateInWindow(requestId?: string): void {
  isInWindowActive = true;

  // Find the fullscreen target
  const target = findBestTarget();

  applyInWindowCSS(target);
  sendToMain({ source: MSG_SOURCE, token: TOKEN, type: 'SET_MODE', mode: 'in-window', spoof: currentSpoof });
  resolveRequest(requestId, 'RESOLVE');

  // Watch for target removal (sites that destroy element on resize)
  if (target && target !== document.documentElement) {
    inWindowObserver = new MutationObserver(() => {
      if (!document.contains(target)) {
        // Target was removed — find new one
        const newTarget = findBestTarget();
        if (newTarget && newTarget !== target) {
          applyInWindowCSS(newTarget);
        }
      }
    });
    inWindowObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Install Esc handler
  installEscapeHandler();

  // Notify SW for stats
  void chrome.runtime.sendMessage({ type: 'INCREMENT_STAT', key: 'redirectedToInWindow' } satisfies ContentToSW);
}

function applyInWindowCSS(target: Element): void {
  removeInWindowCSS();

  const style = document.createElement('style');
  style.id = IN_WINDOW_STYLE_ID;
  style.setAttribute('data-fsc', '1');

  // Identify the selector for the target
  const selector = getUniqueSelector(target);

  // Caption overlay detection — look for overlay siblings or children
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
    ${captionSelector ? `${captionSelector} { z-index: 2147483647 !important; }` : ''}
  `;

  document.documentElement.appendChild(style);
}

function removeInWindowCSS(): void {
  document.getElementById(IN_WINDOW_STYLE_ID)?.remove();
  if (inWindowObserver) {
    inWindowObserver.disconnect();
    inWindowObserver = null;
  }
}

function findBestTarget(): Element {
  // Priority: 1) largest <video> 2) document.documentElement
  const videos = Array.from(document.querySelectorAll('video'));
  if (videos.length > 0) {
    // Find the largest visible video
    const visible = videos.filter(v => {
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

function findCaptionSelector(target: Element): string {
  // Look for common caption/subtitle overlays near the target
  const captionSelectors = [
    '.ytp-caption-window-container',  // YouTube
    '.vjs-text-track-display',        // Video.js
    '[class*="caption"]',
    '[class*="subtitle"]',
    '[class*="cc-"]',
    '.player-timedtext',              // Netflix
    '.vp-captions',                   // Vimeo
  ];

  for (const sel of captionSelectors) {
    // Check if it's in or near the target's subtree
    if (target.querySelector(sel)) return sel;
    if (document.querySelector(sel)) return sel;
  }
  return '';
}

function getUniqueSelector(el: Element): string {
  if (el === document.documentElement) return 'html';
  if (el === document.body) return 'body';

  // Try id first
  if (el.id) {
    return `#${CSS.escape(el.id)}`;
  }

  // Try data attributes
  for (const attr of el.getAttributeNames()) {
    if (attr.startsWith('data-')) {
      const val = el.getAttribute(attr);
      if (val) return `[${attr}="${CSS.escape(val)}"]`;
    }
  }

  // Fall back to nth-of-type chain (simplified)
  const tag = el.tagName.toLowerCase();
  const siblings = el.parentElement
    ? Array.from(el.parentElement.children).filter(c => c.tagName === el.tagName)
    : [];
  const idx = siblings.indexOf(el) + 1;
  return `${tag}:nth-of-type(${idx})`;
}

// ---------------------------------------------------------------------------
// Windowed mode
// ---------------------------------------------------------------------------

function activateWindowed(requestId?: string): void {
  sendToMain({ source: MSG_SOURCE, token: TOKEN, type: 'SET_MODE', mode: 'windowed', spoof: currentSpoof });
  resolveRequest(requestId, 'RESOLVE');

  // Notify SW to do the actual window creation + tab move
  void chrome.runtime.sendMessage({
    type: 'INCREMENT_STAT',
    key: 'redirectedToWindowed',
  } satisfies ContentToSW);
}

// ---------------------------------------------------------------------------
// HUD management
// ---------------------------------------------------------------------------

let hudRoot: HTMLElement | null = null;
let hudShadow: ShadowRoot | null = null;
let hudPendingRequestId: string | undefined;
let hudHasVideo = false;

function showHUD(hasVideo: boolean, pip: boolean, requestId?: string): void {
  hudPendingRequestId = requestId;
  hudHasVideo = hasVideo;

  if (hudRoot) {
    // HUD already open — just update and refocus
    updateHUDPipVisibility(pip);
    focusFirstHUDOption();
    return;
  }

  hudRoot = document.createElement('div');
  hudRoot.setAttribute('data-fsc-hud', '1');
  hudShadow = hudRoot.attachShadow({ mode: 'closed' });

  // Inject HUD CSS
  const styleEl = document.createElement('style');
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
        <button class="fsc-option ${pip && hasVideo ? '' : 'fsc-hidden'}" data-mode="pip" title="Picture in Picture">
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

  // Wire up events
  wireHUDEvents(hudShadow);
  focusFirstHUDOption();
}

function wireHUDEvents(shadow: ShadowRoot): void {
  // Option buttons
  shadow.querySelectorAll('.fsc-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode') as Policy | 'pip';
      handleHUDChoice(mode);
    });
    btn.addEventListener('keydown', (ev) => {
      if ((ev as KeyboardEvent).key === 'Enter' || (ev as KeyboardEvent).key === ' ') {
        const mode = btn.getAttribute('data-mode') as Policy | 'pip';
        handleHUDChoice(mode);
      }
    });
  });

  // Backdrop click = dismiss
  shadow.querySelector('.fsc-backdrop')?.addEventListener('click', () => {
    dismissHUD();
  });

  // "Always" link
  shadow.querySelector('[data-action="always"]')?.addEventListener('click', () => {
    if (currentPolicy) {
      void chrome.runtime.sendMessage({
        type: 'SET_RULE',
        host: window.location.hostname,
        policy: currentPolicy,
      } satisfies ContentToSW);
    }
    dismissHUD();
  });

  // Keyboard shortcuts inside HUD
  shadow.addEventListener('keydown', (ev) => {
    const key = (ev as KeyboardEvent).key.toLowerCase();
    const map: Record<string, Policy | 'pip'> = {
      'i': 'in-window',
      'w': 'windowed',
      'f': 'native',
      'p': 'pip',
      'b': 'block',
      's': 'sticky',
    };
    if (map[key]) {
      ev.preventDefault();
      handleHUDChoice(map[key]);
    } else if (key === 'escape') {
      dismissHUD();
    }
  });
}

function handleHUDChoice(mode: Policy | 'pip'): void {
  if (mode === 'pip') {
    activatePiP();
    dismissHUD();
    return;
  }

  currentPolicy = mode;
  dismissHUD();

  // Apply the chosen mode
  switch (mode) {
    case 'in-window':
      activateInWindow(hudPendingRequestId);
      break;
    case 'windowed':
      // SW handles this
      void chrome.runtime.sendMessage({
        type: 'FULLSCREEN_REQUESTED',
        url: window.location.href,
        tag: '',
        hasVideo: hudHasVideo,
        shiftKey: false,
        isIframe: false,
      } satisfies ContentToSW);
      resolveRequest(hudPendingRequestId, 'RESOLVE');
      break;
    case 'native':
      resolveRequest(hudPendingRequestId, 'NATIVE');
      break;
    case 'block':
      // Save block rule and reject
      void chrome.runtime.sendMessage({
        type: 'SET_RULE',
        host: window.location.hostname,
        policy: 'block',
      } satisfies ContentToSW);
      resolveRequest(hudPendingRequestId, 'REJECT', 'NotAllowedError');
      break;
    case 'sticky':
      void chrome.runtime.sendMessage({
        type: 'SET_RULE',
        host: window.location.hostname,
        policy: 'sticky',
      } satisfies ContentToSW);
      resolveRequest(hudPendingRequestId, 'NATIVE');
      break;
  }
}

function dismissHUD(): void {
  if (!hudRoot) return;
  // Animate out
  const card = hudShadow?.querySelector('.fsc-hud') as HTMLElement | null;
  const backdrop = hudShadow?.querySelector('.fsc-backdrop') as HTMLElement | null;
  if (card) card.style.animation = 'fsc-fade-out 120ms ease forwards';
  if (backdrop) backdrop.style.animation = 'fsc-fade-out 120ms ease forwards';
  setTimeout(() => {
    hudRoot?.remove();
    hudRoot = null;
    hudShadow = null;
  }, 130);
}

function updateHUDPipVisibility(pip: boolean): void {
  const pipBtn = hudShadow?.querySelector('[data-mode="pip"]');
  if (pipBtn) {
    pipBtn.classList.toggle('fsc-hidden', !pip);
  }
}

function focusFirstHUDOption(): void {
  setTimeout(() => {
    const first = hudShadow?.querySelector('.fsc-option:not(.fsc-hidden)') as HTMLElement | null;
    first?.focus();
  }, 50);
}

// ---------------------------------------------------------------------------
// PiP
// ---------------------------------------------------------------------------

function activatePiP(): void {
  const video = document.querySelector('video') as HTMLVideoElement | null;
  if (!video) return;

  if (!document.pictureInPictureEnabled) return;

  video.requestPictureInPicture().then(() => {
    void chrome.runtime.sendMessage({ type: 'INCREMENT_STAT', key: 'pipActivations' } satisfies ContentToSW);
  }).catch((err: unknown) => {
    console.warn('[FullscreenControl] PiP failed:', err);
  });
}

// ---------------------------------------------------------------------------
// Gesture overlay (sticky sites where chrome.windows.update fails)
// ---------------------------------------------------------------------------

let gestureOverlayRoot: HTMLElement | null = null;
let gestureHideTimer: ReturnType<typeof setTimeout> | null = null;
const GESTURE_AUTO_HIDE_MS = 10_000;

function showGestureOverlay(): void {
  if (gestureOverlayRoot) return;

  gestureOverlayRoot = document.createElement('div');
  gestureOverlayRoot.setAttribute('data-fsc-gesture', '1');
  const shadow = gestureOverlayRoot.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = HUD_CSS;
  shadow.appendChild(style);

  const btn = document.createElement('button');
  btn.className = 'fsc-gesture-overlay';
  btn.textContent = '⛶  Enter fullscreen';
  shadow.appendChild(btn);

  btn.addEventListener('click', () => {
    void document.documentElement.requestFullscreen().then(() => {
      void chrome.runtime.sendMessage({
        type: 'GESTURE_FULLSCREEN_SUCCESS',
        url: window.location.href,
      } satisfies ContentToSW);
      removeGestureOverlay();
    }).catch((e: unknown) => {
      console.warn('[FullscreenControl] Gesture fullscreen failed:', e);
    });
  });

  document.documentElement.appendChild(gestureOverlayRoot);

  // Auto-hide
  if (gestureHideTimer) clearTimeout(gestureHideTimer);
  gestureHideTimer = setTimeout(removeGestureOverlay, GESTURE_AUTO_HIDE_MS);
}

function removeGestureOverlay(): void {
  gestureOverlayRoot?.remove();
  gestureOverlayRoot = null;
  if (gestureHideTimer) {
    clearTimeout(gestureHideTimer);
    gestureHideTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Escape key handler
// ---------------------------------------------------------------------------

let escapeHandlerInstalled = false;

function installEscapeHandler(): void {
  if (escapeHandlerInstalled) return;
  escapeHandlerInstalled = true;
  document.addEventListener('keydown', handleEscapeKey, { capture: true });
}

function removeEscapeHandler(): void {
  escapeHandlerInstalled = false;
  document.removeEventListener('keydown', handleEscapeKey, { capture: true });
}

function handleEscapeKey(ev: KeyboardEvent): void {
  if (ev.key !== 'Escape') return;
  if (!isInWindowActive && !hudRoot) return;

  ev.stopImmediatePropagation();

  if (hudRoot) {
    dismissHUD();
    resolveRequest(hudPendingRequestId, 'REJECT', 'User dismissed HUD');
    return;
  }

  if (isInWindowActive) {
    exitInWindow();
  }
}

function exitInWindow(): void {
  isInWindowActive = false;
  removeInWindowCSS();
  removeEscapeHandler();
  sendToMain({ source: MSG_SOURCE, token: TOKEN, type: 'EXIT' });

  // Notify SW
  void chrome.runtime.sendMessage({
    type: 'FULLSCREEN_EXITED',
    url: window.location.href,
  } satisfies ContentToSW);
}

// ---------------------------------------------------------------------------
// F11 block
// ---------------------------------------------------------------------------

document.addEventListener('keydown', (ev: KeyboardEvent): void => {
  if (!blockF11) return;
  if (ev.key === 'F11') {
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }
}, { capture: true });

// ---------------------------------------------------------------------------
// Mouse cursor hide (sticky sites)
// ---------------------------------------------------------------------------

let cursorHideTimer: ReturnType<typeof setTimeout> | null = null;
let cursorHidden = false;
const CURSOR_HIDE_STYLE_ID = 'fsc-cursor-hide';

function startCursorHide(): void {
  if (!hideCursorAfterIdleMs) return;

  const showCursor = (): void => {
    if (cursorHideTimer) clearTimeout(cursorHideTimer);
    if (cursorHidden) {
      document.getElementById(CURSOR_HIDE_STYLE_ID)?.remove();
      cursorHidden = false;
    }
    cursorHideTimer = setTimeout(hideCursor, hideCursorAfterIdleMs);
  };

  const hideCursor = (): void => {
    cursorHidden = true;
    if (!document.getElementById(CURSOR_HIDE_STYLE_ID)) {
      const s = document.createElement('style');
      s.id = CURSOR_HIDE_STYLE_ID;
      s.textContent = '* { cursor: none !important; }';
      document.head?.appendChild(s);
    }
  };

  document.addEventListener('mousemove', showCursor, { passive: true });
  cursorHideTimer = setTimeout(hideCursor, hideCursorAfterIdleMs);
}

// ---------------------------------------------------------------------------
// Message listener from Service Worker → this tab
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((
  msg: SWToContent,
  _sender,
  sendResponse,
): boolean => {
  handleSWMessage(msg);
  sendResponse({ ok: true });
  return false;
});

function handleSWMessage(msg: SWToContent): void {
  switch (msg.type) {
    case 'APPLY_RULE':
      currentPolicy = msg.policy;
      currentSpoof = msg.spoof;
      blockPointerLock = msg.blockPointerLock;
      blockF11 = msg.blockF11;
      hideCursorAfterIdleMs = msg.hideCursorAfterIdleMs;
      showGestureButton = msg.showGestureButton;
      isPip = msg.pip;

      // Update MAIN world with new mode
      sendToMain({
        source: MSG_SOURCE,
        token: TOKEN,
        type: 'SET_MODE',
        mode: msg.policy,
        spoof: msg.spoof,
        blockPointerLock,
      });

      if (msg.policy === 'sticky') {
        startCursorHide();
      }
      break;

    case 'SHOW_HUD':
      showHUD(msg.hasVideo, msg.pip, undefined);
      break;

    case 'SHOW_GESTURE_OVERLAY':
      if (showGestureButton) showGestureOverlay();
      break;

    case 'EXIT':
      if (isInWindowActive) exitInWindow();
      dismissHUD();
      sendToMain({ source: MSG_SOURCE, token: TOKEN, type: 'EXIT' });
      break;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendToMain(msg: IsolatedToMain): void {
  window.postMessage(msg, '*');
}

function resolveRequest(requestId: string | undefined, result: 'RESOLVE' | 'REJECT' | 'NATIVE', reason?: string): void {
  if (!requestId) return;
  window.postMessage({
    source: MSG_SOURCE,
    token: TOKEN,
    type: result,
    requestId,
    reason,
  }, '*');
}

function handleExited(): void {
  if (isInWindowActive) {
    exitInWindow();
  }
}


// Alt+Shift+F → open/toggle HUD (also handled by command in SW,
// but keydown gives a backup path when SW command doesn't reach the tab)
// ---------------------------------------------------------------------------

document.addEventListener('keydown', (ev: KeyboardEvent): void => {
  if (ev.altKey && ev.shiftKey && ev.key === 'F') {
    ev.preventDefault();
    if (hudRoot) {
      dismissHUD();
    } else {
      showHUD(!!document.querySelector('video'), isPip, undefined);
    }
  }
}, { capture: true });
