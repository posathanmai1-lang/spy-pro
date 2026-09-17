/**
 * MAIN WORLD content script for Fullscreen Control.
 *
 * Runs at document_start in the page's own JavaScript context (world: "MAIN").
 * This gives us access to prototype chains that need to be patched BEFORE any
 * page code runs.
 *
 * SECURITY NOTES:
 *   - This script shares the execution environment with the page.
 *   - It does NOT have access to chrome.* extension APIs.
 *   - Communication with the isolated world is via window.postMessage with
 *     a token for collision avoidance (not a security boundary).
 *   - We never send secrets through this channel.
 *
 * CONFLICT DETECTION:
 *   - We mark patched methods with __fcControl = true.
 *   - If already marked (another extension ran first), we log a warning and
 *     layer our patch on top. We do NOT crash.
 */

import type { MainToIsolated, IsolatedToMain } from '../lib/messages.js';
import { MSG_SOURCE } from '../lib/messages.js';
import type { Policy } from '../lib/types.js';

interface NavigatorKeyboard {
  lock(keyCodes?: Iterable<string>): Promise<void>;
  unlock(): void;
}
interface NavigatorWithKeyboard extends Navigator {
  keyboard?: NavigatorKeyboard;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface SpoofState {
  active: boolean;
  fakeElement: Element | null;
  realScreenWidth: number;
  realScreenHeight: number;
}

const spoof: SpoofState = {
  active: false,
  fakeElement: null,
  realScreenWidth: screen.width,
  realScreenHeight: screen.height,
};

/** Current mode as told to us by the isolated world */
let currentMode: Policy | 'passthrough' | null = null;

/** The token sent by the isolated world on startup. Validated on every message. */
let isoToken: string | null = null;

/** Whether we have successfully patched the prototypes */
let patched = false;

/** Track the last shift-key state from pointer/keyboard events */
let lastShiftKey = false;

/** The original (pre-patch) requestFullscreen function */
let _origRequestFullscreen: ((opts?: FullscreenOptions) => Promise<void>) | null = null;
let _origExitFullscreen: (() => Promise<void>) | null = null;
let _origRequestPointerLock: ((options?: PointerLockOptions) => Promise<void>) | null = null;

// ---------------------------------------------------------------------------
// Anti-loop cooldown
// ---------------------------------------------------------------------------

interface CooldownEntry {
  count: number;
  firstTs: number;
  suppressedUntil: number;
}

const cooldownMap = new Map<string, CooldownEntry>();
const COOLDOWN_WINDOW_MS = 500;
const COOLDOWN_MAX_CALLS = 3;
const COOLDOWN_SUPPRESS_MS = 2000;

function checkCooldown(origin: string): boolean {
  const now = Date.now();
  let entry = cooldownMap.get(origin);

  if (!entry) {
    entry = { count: 1, firstTs: now, suppressedUntil: 0 };
    cooldownMap.set(origin, entry);
    return false; // not suppressed
  }

  // Already in suppress window
  if (entry.suppressedUntil > now) return true;

  // Reset window if expired
  if (now - entry.firstTs > COOLDOWN_WINDOW_MS) {
    entry.count = 1;
    entry.firstTs = now;
    entry.suppressedUntil = 0;
    return false;
  }

  entry.count++;
  if (entry.count >= COOLDOWN_MAX_CALLS) {
    entry.suppressedUntil = now + COOLDOWN_SUPPRESS_MS;
    postToIsolated({
      source: MSG_SOURCE,
      token: isoToken ?? '',
      type: 'STATE',
      isFullscreen: false,
    });
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Token listener — isolated world sends the token first
// ---------------------------------------------------------------------------

window.addEventListener('message', (ev: MessageEvent) => {
  if (ev.source !== window) return;
  if (!ev.data || typeof ev.data !== 'object') return;
  const msg = ev.data as Record<string, unknown>;
  if (msg['source'] !== MSG_SOURCE) return;

  if (msg['type'] === 'INIT_TOKEN' && typeof msg['token'] === 'string') {
    isoToken = msg['token'] as string;
    if (!patched) patchPrototypes();
    return;
  }

  // Validate token for all subsequent messages
  if (!isoToken || msg['token'] !== isoToken) return;

  handleIsolatedMessage(ev.data as IsolatedToMain);
}, false);

// ---------------------------------------------------------------------------
// Message handler from isolated world → MAIN world
// ---------------------------------------------------------------------------

function handleIsolatedMessage(msg: IsolatedToMain): void {
  switch (msg.type) {
    case 'SET_MODE':
      applyMode(msg.mode, msg.spoof);
      break;
    case 'EXIT':
      exitMode();
      break;
    case 'QUERY_STATE':
      postToIsolated({
        source: MSG_SOURCE,
        token: isoToken ?? '',
        type: 'STATE',
        isFullscreen: spoof.active,
      });
      break;
  }
}

// ---------------------------------------------------------------------------
// Shift-key tracking
// ---------------------------------------------------------------------------

document.addEventListener('keydown', (e) => { lastShiftKey = e.shiftKey; }, { capture: true, passive: true });
document.addEventListener('mousedown', (e) => { lastShiftKey = e.shiftKey; }, { capture: true, passive: true });
document.addEventListener('pointerdown', (e) => { lastShiftKey = e.shiftKey; }, { capture: true, passive: true });

// ---------------------------------------------------------------------------
// Prototype patching
// ---------------------------------------------------------------------------

function patchPrototypes(): void {
  // Detect if already patched by us or another extension
  const existingFs = Element.prototype.requestFullscreen as unknown as Record<string, unknown>;
  if (existingFs['__fcControl']) {
    console.warn('[FullscreenControl] requestFullscreen already patched by this extension — skipping re-patch.');
    patched = true;
    return;
  }
  if (existingFs['__otherExtension']) {
    console.warn('[FullscreenControl] requestFullscreen appears patched by another extension. Layering on top. Conflicts possible.');
  }

  // Save originals
  _origRequestFullscreen = Element.prototype.requestFullscreen.bind(document.documentElement);
  _origExitFullscreen = Document.prototype.exitFullscreen.bind(document);
  _origRequestPointerLock = Element.prototype.requestPointerLock;

  // -------------------------------------------------------------------------
  // Patch requestFullscreen (and vendor aliases)
  // -------------------------------------------------------------------------
  const patchedRequestFullscreen = function(
    this: Element,
    options?: FullscreenOptions,
  ): Promise<void> {
    const origin = window.location.origin;

    // Cooldown check
    if (checkCooldown(origin)) {
      return Promise.reject(
        new DOMException('Fullscreen request rate limited by extension.', 'NotAllowedError')
      );
    }

    // If mode is 'native' or not yet set, pass through
    if (currentMode === 'native' || currentMode === 'passthrough') {
      return (_origRequestFullscreen?.call(this, options)) ??
             Promise.reject(new Error('No original requestFullscreen'));
    }

    // If mode is 'block', reject immediately
    if (currentMode === 'block') {
      postToIsolated({
        source: MSG_SOURCE,
        token: isoToken ?? '',
        type: 'FULLSCREEN_REQUESTED',
        tag: this.tagName,
        hasVideo: hasVideoElement(this),
        shiftKey: lastShiftKey,
        rect: getBoundingRect(this),
        isIframe: window !== window.top,
      });
      return Promise.reject(
        new DOMException('Fullscreen denied by extension policy.', 'NotAllowedError')
      );
    }

    // For all other modes (ask, in-window, windowed, sticky):
    // Intercept and notify isolated world, then await its decision
    return new Promise<void>((resolve, reject) => {
      const requestId = Math.random().toString(36).slice(2);

      const respondHandler = (ev: MessageEvent): void => {
        if (ev.source !== window) return;
        if (!ev.data || typeof ev.data !== 'object') return;
        const msg = ev.data as Record<string, unknown>;
        if (msg['source'] !== MSG_SOURCE || msg['token'] !== isoToken) return;
        if (msg['requestId'] !== requestId) return;

        window.removeEventListener('message', respondHandler);

        const type = msg['type'];
        if (type === 'RESOLVE') {
          resolve();
        } else if (type === 'REJECT') {
          reject(new DOMException(
            typeof msg['reason'] === 'string' ? msg['reason'] : 'NotAllowedError',
            'NotAllowedError'
          ));
        } else if (type === 'NATIVE') {
          const nativePromise = _origRequestFullscreen?.call(this, options);
          if (nativePromise) {
            nativePromise.then(resolve).catch((e: unknown) => reject(e as Error));
          } else {
            resolve();
          }
        }
      };

      window.addEventListener('message', respondHandler);

      // Post the request to isolated world with the requestId
      postToIsolated({
        source: MSG_SOURCE,
        token: isoToken ?? '',
        type: 'FULLSCREEN_REQUESTED',
        tag: this.tagName,
        hasVideo: hasVideoElement(this),
        shiftKey: lastShiftKey,
        rect: getBoundingRect(this),
        isIframe: window !== window.top,
        // Extra field for promise resolution
        ...({ requestId } as Record<string, unknown>),
      } as MainToIsolated & { requestId: string });

    });
  };

  // Mark and apply
  (patchedRequestFullscreen as unknown as Record<string, unknown>)['__fcControl'] = true;
  Element.prototype.requestFullscreen = patchedRequestFullscreen;

  // Vendor aliases (best-effort; browsers may not have all of these)
  const vendorAliases = [
    'webkitRequestFullscreen',
    'webkitRequestFullScreen',
    'mozRequestFullScreen',
    'msRequestFullscreen',
  ] as const;
  for (const alias of vendorAliases) {
    if (alias in Element.prototype) {
      (Element.prototype as unknown as Record<string, unknown>)[alias] = patchedRequestFullscreen;
    }
  }

  // -------------------------------------------------------------------------
  // Patch exitFullscreen
  // -------------------------------------------------------------------------
  const patchedExitFullscreen = function(this: Document): Promise<void> {
    if (spoof.active) {
      exitMode();
      return Promise.resolve();
    }
    return _origExitFullscreen?.call(this) ?? Promise.resolve();
  };
  (patchedExitFullscreen as unknown as Record<string, unknown>)['__fcControl'] = true;
  Document.prototype.exitFullscreen = patchedExitFullscreen;

  const exitAliases = [
    'webkitExitFullscreen',
    'mozCancelFullScreen',
    'msExitFullscreen',
  ] as const;
  for (const alias of exitAliases) {
    if (alias in Document.prototype) {
      (Document.prototype as unknown as Record<string, unknown>)[alias] = patchedExitFullscreen;
    }
  }

  // -------------------------------------------------------------------------
  // Patch pointer lock
  // -------------------------------------------------------------------------
  const patchedRequestPointerLock = function(this: Element, options?: PointerLockOptions): Promise<void> {
    // blockPointerLock flag is communicated via SET_MODE → applyMode
    if (currentBlockPointerLock) {
      postToIsolated({
        source: MSG_SOURCE,
        token: isoToken ?? '',
        type: 'POINTER_LOCK_REQUESTED',
      });
      return Promise.resolve(); // silently deny
    }
    return Promise.resolve(_origRequestPointerLock?.call(this, options));
  };
  (patchedRequestPointerLock as unknown as Record<string, unknown>)['__fcControl'] = true;
  Element.prototype.requestPointerLock = patchedRequestPointerLock;

  // -------------------------------------------------------------------------
  // Patch navigator.keyboard.lock (deny when block policy)
  // -------------------------------------------------------------------------
  patchKeyboardLock();

  // -------------------------------------------------------------------------
  // Spoof fullscreenElement getter + fullscreen boolean
  // -------------------------------------------------------------------------
  patchFullscreenGetters();

  // -------------------------------------------------------------------------
  // Spoof screen.width / screen.height
  // -------------------------------------------------------------------------
  patchScreenDimensions();

  patched = true;
}

// ---------------------------------------------------------------------------
// Pointer lock flag (set by applyMode)
// ---------------------------------------------------------------------------

let currentBlockPointerLock = false;

// ---------------------------------------------------------------------------
// Getter spoofing
// ---------------------------------------------------------------------------

function patchFullscreenGetters(): void {
  const proto = Document.prototype;

  const defineGetter = (obj: object, prop: string, getter: () => unknown): void => {
    try {
      Object.defineProperty(obj, prop, {
        get: getter,
        configurable: true,
        enumerable: true,
      });
    } catch {
      // Some properties may not be configurable — skip silently
    }
  };

  // document.fullscreenElement
  defineGetter(proto, 'fullscreenElement', () =>
    spoof.active ? spoof.fakeElement : null
  );
  defineGetter(proto, 'webkitFullscreenElement', () =>
    spoof.active ? spoof.fakeElement : null
  );
  defineGetter(proto, 'mozFullScreenElement', () =>
    spoof.active ? spoof.fakeElement : null
  );
  defineGetter(proto, 'msFullscreenElement', () =>
    spoof.active ? spoof.fakeElement : null
  );

  // document.fullscreen (boolean)
  defineGetter(proto, 'fullscreen', () => spoof.active);
  defineGetter(proto, 'webkitIsFullScreen', () => spoof.active);
  defineGetter(proto, 'mozFullScreen', () => spoof.active);

  // document.fullscreenEnabled
  defineGetter(proto, 'fullscreenEnabled', () => true);
  defineGetter(proto, 'webkitFullscreenEnabled', () => true);
}

function patchScreenDimensions(): void {
  const defineGetter = (obj: object, prop: string, getter: () => number): void => {
    try {
      Object.defineProperty(obj, prop, {
        get: getter,
        configurable: true,
        enumerable: true,
      });
    } catch { /* non-configurable on some platforms */ }
  };

  defineGetter(Screen.prototype, 'width', () =>
    spoof.active ? window.innerWidth : spoof.realScreenWidth
  );
  defineGetter(Screen.prototype, 'height', () =>
    spoof.active ? window.innerHeight : spoof.realScreenHeight
  );
}

function patchKeyboardLock(): void {
  const nav = navigator as NavigatorWithKeyboard;
  if (!nav.keyboard) return;
  const origLock = nav.keyboard.lock.bind(nav.keyboard);
  nav.keyboard.lock = function(keyCodes?: Iterable<string>): Promise<void> {
    if (currentMode === 'block') {
      return Promise.reject(new DOMException('Keyboard lock denied by extension policy.', 'NotAllowedError'));
    }
    return origLock(keyCodes);
  };
}

// ---------------------------------------------------------------------------
// Mode application
// ---------------------------------------------------------------------------

function applyMode(mode: Policy | 'passthrough', shouldSpoof: boolean): void {
  currentMode = mode;

  if (mode === 'block') {
    currentBlockPointerLock = true;
    // Dispatch fake fullscreen=false event so sites that waited get notified
    dispatchFullscreenChange(null);
    return;
  }

  if (mode === 'in-window' || mode === 'windowed') {
    if (shouldSpoof) {
      activateSpoof(document.documentElement);
    }
    // Resolve the pending promise (isolated world posts RESOLVE message separately)
    return;
  }

  if (mode === 'native' || mode === 'passthrough') {
    currentBlockPointerLock = false;
    return;
  }
}

function activateSpoof(element: Element): void {
  spoof.active = true;
  spoof.fakeElement = element;
  dispatchFullscreenChange(element);
}

function exitMode(): void {
  const wasActive = spoof.active;
  spoof.active = false;
  spoof.fakeElement = null;
  currentMode = null;
  currentBlockPointerLock = false;

  if (wasActive) {
    dispatchFullscreenChange(null);
  }

  postToIsolated({
    source: MSG_SOURCE,
    token: isoToken ?? '',
    type: 'EXITED',
  });
}

// ---------------------------------------------------------------------------
// Event dispatching
// ---------------------------------------------------------------------------

function dispatchFullscreenChange(target: Element | null): void {
  const event = new Event('fullscreenchange', { bubbles: true, cancelable: false });
  const webkitEvent = new Event('webkitfullscreenchange', { bubbles: true, cancelable: false });
  const mozEvent = new Event('mozfullscreenchange', { bubbles: true, cancelable: false });

  const dispatchTarget = target ?? document;
  dispatchTarget.dispatchEvent(event);
  dispatchTarget.dispatchEvent(webkitEvent);
  dispatchTarget.dispatchEvent(mozEvent);
  document.dispatchEvent(new Event('fullscreenchange', { bubbles: false }));

  // Also dispatch resize so players recalculate dimensions
  window.dispatchEvent(new Event('resize'));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasVideoElement(el: Element): boolean {
  if (el.tagName === 'VIDEO') return true;
  return el.querySelector('video') !== null;
}

function getBoundingRect(el: Element): { top: number; left: number; width: number; height: number } {
  try {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  } catch {
    return { top: 0, left: 0, width: 0, height: 0 };
  }
}

function postToIsolated(msg: MainToIsolated | Record<string, unknown>): void {
  window.postMessage(msg, '*');
}
