/**
 * Typed messaging protocol for Fullscreen Control.
 *
 * Communication paths:
 *   MAIN world  ↔  Isolated world:    window.postMessage (token-scoped)
 *   Isolated    →  Service Worker:    chrome.runtime.sendMessage
 *   SW          →  Isolated (tab):    chrome.tabs.sendMessage
 *
 * The install token is a random string generated once per isolated-world
 * session. It prevents message collisions with other extensions that also
 * use window.postMessage. It is NOT a security secret.
 */

import type { Policy } from './types.js';

// ---------------------------------------------------------------------------
// MAIN world ↔ Isolated world messages (via window.postMessage)
// ---------------------------------------------------------------------------

/** Source identifier for all postMessage messages from this extension */
export const MSG_SOURCE = 'fullscreen-control-v1';

/**
 * Messages sent from the MAIN world → isolated world.
 * The isolated world validates `source` and `token` before acting.
 */
export type MainToIsolated =
  | {
      source: typeof MSG_SOURCE;
      token: string;
      type: 'FULLSCREEN_REQUESTED';
      /** Element tag name of the requesting element (e.g. 'VIDEO', 'DIV') */
      tag: string;
      /** True if a <video> element is the target or is contained by it */
      hasVideo: boolean;
      /** True if the Shift key was held at the time of the fullscreen call */
      shiftKey: boolean;
      /** Serialized bounding rect of the target element */
      rect: { top: number; left: number; width: number; height: number };
      /** True if called from within an iframe */
      isIframe: boolean;
    }
  | {
      source: typeof MSG_SOURCE;
      token: string;
      type: 'EXITED';
    }
  | {
      source: typeof MSG_SOURCE;
      token: string;
      type: 'STATE';
      isFullscreen: boolean;
    }
  | {
      source: typeof MSG_SOURCE;
      token: string;
      type: 'POINTER_LOCK_REQUESTED';
    };

/**
 * Messages sent from the isolated world → MAIN world.
 */
export type IsolatedToMain =
  | {
      source: typeof MSG_SOURCE;
      token: string;
      type: 'SET_MODE';
      mode: Policy | 'passthrough';
      /** Whether to spoof fullscreen API getters */
      spoof: boolean;
      /** Whether pointer lock requests should be blocked */
      blockPointerLock?: boolean;
    }
  | {
      source: typeof MSG_SOURCE;
      token: string;
      type: 'EXIT';
    }
  | {
      source: typeof MSG_SOURCE;
      token: string;
      type: 'QUERY_STATE';
    };

// ---------------------------------------------------------------------------
// Isolated world ↔ Service Worker messages (via chrome.runtime.sendMessage)
// ---------------------------------------------------------------------------

/**
 * Messages sent from isolated content script → service worker.
 */
export type ContentToSW =
  | {
      type: 'FULLSCREEN_REQUESTED';
      url: string;
      tag: string;
      hasVideo: boolean;
      shiftKey: boolean;
      isIframe: boolean;
      tabId?: number; // filled by SW from sender.tab.id
    }
  | {
      type: 'FULLSCREEN_EXITED';
      url: string;
    }
  | {
      type: 'GET_RULE';
      url: string;
    }
  | {
      type: 'SET_RULE';
      host: string;
      policy: Policy;
      flags?: Partial<import('./types.js').OriginRule>;
    }
  | {
      type: 'DISABLE_FOR_HOUR';
      host: string;
    }
  | {
      type: 'INCREMENT_STAT';
      key: keyof import('./types.js').StatsSchema;
    }
  | {
      type: 'STICKY_ESC_PRESSED';
      hostname: string;
    }
  | {
      type: 'OPEN_HUD';
      url: string;
    }
  | {
      type: 'GESTURE_FULLSCREEN_SUCCESS';
      url: string;
    };

/**
 * Messages sent from service worker → isolated content script (via tabs.sendMessage).
 */
export type SWToContent =
  | {
      type: 'APPLY_RULE';
      policy: Policy;
      spoof: boolean;
      blockPointerLock: boolean;
      blockF11: boolean;
      hideCursorAfterIdleMs: number;
      showGestureButton: boolean;
      pip: boolean;
    }
  | {
      type: 'SHOW_HUD';
      hasVideo: boolean;
      pip: boolean;
    }
  | {
      type: 'EXIT';
    }
  | {
      type: 'SHOW_GESTURE_OVERLAY';
    };

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type RuleResponse = {
  ok: true;
  rule: import('./types.js').EffectiveRule;
} | {
  ok: false;
  error: string;
};

export type AckResponse = { ok: true } | { ok: false; error: string };
