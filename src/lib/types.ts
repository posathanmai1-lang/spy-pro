/**
 * Core type definitions for Fullscreen Control extension.
 * All types are shared between background, content scripts, and UI.
 */

// ---------------------------------------------------------------------------
// Policy enum
// ---------------------------------------------------------------------------

/** The six fullscreen handling policies, plus passthrough for internal use. */
export type Policy =
  | 'ask'        // Intercept and show HUD for user to choose
  | 'in-window'  // Fill current tab with CSS (no OS fullscreen)
  | 'windowed'   // Move tab to popup window
  | 'native'     // Pass through to real Element.requestFullscreen()
  | 'block'      // Deny all fullscreen
  | 'sticky';    // Force fullscreen on navigation

// ---------------------------------------------------------------------------
// Per-origin rule
// ---------------------------------------------------------------------------

/**
 * A rule that applies to one origin (or wildcard host pattern).
 * Stored in chrome.storage.sync as part of StorageSchema.rules[].
 */
export interface OriginRule {
  /** Hostname or glob, e.g. "youtube.com", "*.youtube.com", "example.com/path" */
  host: string;

  /** The policy to apply */
  policy: Policy;

  /**
   * Offer / auto-use requestPictureInPicture() when target is a <video>.
   * Only relevant for in-window, windowed, ask policies.
   */
  pip?: boolean;

  /**
   * Block Element.prototype.requestPointerLock.
   * Defaults to true when policy is 'block', false otherwise.
   */
  blockPointerLock?: boolean;

  /**
   * Block F11 key from triggering OS fullscreen.
   * Defaults to true when policy is 'block', false otherwise.
   */
  blockF11?: boolean;

  /**
   * Hide the cursor after this many milliseconds of inactivity on sticky sites.
   * 0 = disabled.
   */
  hideCursorAfterIdleMs?: number;

  /**
   * For sticky policy: don't force fullscreen on the very first page load,
   * only on subsequent navigations. Avoids fighting first paint.
   */
  skipInitialLoad?: boolean;

  /**
   * Show a "Enter fullscreen" gesture button overlay if programmatic fullscreen
   * is blocked (Arc browser / gesture-required environments).
   */
  showGestureButton?: boolean;

  /**
   * Spoof document.fullscreenElement and screen.width/height so sites think
   * they are in native fullscreen. Default true for 'in-window' and 'windowed'.
   */
  spoofFullscreenApi?: boolean;

  /**
   * Epoch milliseconds — if set and > Date.now(), this rule is temporarily
   * disabled (session exception). Used for "Disable for 1 hour" feature.
   */
  disabledUntil?: number;
}

// ---------------------------------------------------------------------------
// Storage schema
// ---------------------------------------------------------------------------

export const SCHEMA_VERSION = 1;

/**
 * Shape of chrome.storage.sync data.
 * Kept small: rules array + defaults. Never write on every fullscreen event.
 */
export interface StorageSchema {
  /** Bump this when adding/removing fields to trigger migration */
  version: number;

  /** Policy to apply when no rule matches */
  defaultPolicy: Policy;

  /** All per-origin rules, ordered by specificity (most specific last wins in lookup) */
  rules: OriginRule[];

  /**
   * Sites where default behavior should be 'native' to avoid breaking dev tools.
   * User-editable list of hostname patterns.
   */
  fragileSites: string[];

  /** Enable verbose debug logging to chrome.storage.session */
  debugLog: boolean;
}

// ---------------------------------------------------------------------------
// Stats schema
// ---------------------------------------------------------------------------

/**
 * Shape of chrome.storage.local stats data.
 * Only incremented; never sent anywhere. Shown in popup and options.
 */
export interface StatsSchema {
  blockedAttempts: number;
  redirectedToInWindow: number;
  redirectedToWindowed: number;
  stickyEngagements: number;
  pipActivations: number;
}

// ---------------------------------------------------------------------------
// Session state schema
// ---------------------------------------------------------------------------

/**
 * Per-tab windowed (popup) session data stored in chrome.storage.session.
 * Allows SW to restore the tab when the popup window is closed.
 */
export interface WindowedSessionEntry {
  tabId: number;
  originalWindowId: number;
  originalIndex: number;
  wasPinned: boolean;
  popupWindowId: number;
}

/**
 * Esc cooldown entry — prevents sticky from fighting user's Esc press.
 * Stored in chrome.storage.session keyed by hostname.
 */
export interface StickyEscCooldown {
  [hostname: string]: number; // epoch ms when cooldown expires
}

// ---------------------------------------------------------------------------
// Effective rule (resolved from storage)
// ---------------------------------------------------------------------------

/**
 * A fully-resolved rule with all optional flags filled in with their defaults.
 * This is what the service worker and content scripts work with.
 */
export interface EffectiveRule {
  policy: Policy;
  pip: boolean;
  blockPointerLock: boolean;
  blockF11: boolean;
  hideCursorAfterIdleMs: number;
  skipInitialLoad: boolean;
  showGestureButton: boolean;
  spoofFullscreenApi: boolean;
  disabledUntil: number;
  /** True if this came from a specific rule vs the global default */
  isExplicit: boolean;
  /** The matching pattern, or '' if default */
  matchedHost: string;
}
