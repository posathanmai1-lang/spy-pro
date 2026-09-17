/**
 * Service Worker for Fullscreen Control (MV3).
 *
 * The SW is ephemeral — it can be killed and restarted at any time.
 * ALL state must be persisted in chrome.storage before the SW goes idle.
 *
 * Responsibilities:
 *   - Load + serve rules from chrome.storage.sync
 *   - Respond to content script FULLSCREEN_REQUESTED with effective rule
 *   - Execute windowed mode: windows.create + tabs.move + pin restore
 *   - Execute sticky: webNavigation listener + windows.update + gesture overlay
 *   - Manage toolbar badge and context menus
 *   - Handle keyboard commands
 */

import {
  loadSchema,
  saveSchema,
  loadStats,
  incrementStat,
  getWindowedEntry,
  setWindowedEntry,
  removeWindowedEntry,
  setEscCooldown,
  isEscCooldownActive,
  debugLog,
} from '../lib/storage.js';
import {
  getEffectiveRule,
  hostnameFromUrl,
} from '../lib/rules.js';
import type { ContentToSW, SWToContent, AckResponse } from '../lib/messages.js';
import type { Policy, StorageSchema } from '../lib/types.js';

// ---------------------------------------------------------------------------
// Schema cache (refreshed from storage on each SW activation)
// ---------------------------------------------------------------------------

let schemaCache: StorageSchema | null = null;

async function getSchema(): Promise<StorageSchema> {
  if (!schemaCache) {
    schemaCache = await loadSchema();
  }
  return schemaCache;
}

function invalidateCache(): void {
  schemaCache = null;
}

// ---------------------------------------------------------------------------
// Install / startup
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async (details) => {
  await initStorage();
  setupContextMenus();

  if (details.reason === 'install') {
    void debugLog('Extension installed');
    // Open options on first install
    await chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/options.html') });
  } else if (details.reason === 'update') {
    void debugLog('Extension updated', { version: chrome.runtime.getManifest().version });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await initStorage();
  setupContextMenus();
});

async function initStorage(): Promise<void> {
  const schema = await loadSchema();
  schemaCache = schema;
  // Ensure stats exist
  await loadStats();
}

// ---------------------------------------------------------------------------
// Context menus
// ---------------------------------------------------------------------------

function setupContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'fsc-parent',
      title: 'Fullscreen Control',
      contexts: ['page', 'video'],
    });

    const policies: { id: Policy; label: string }[] = [
      { id: 'ask', label: 'Ask every time' },
      { id: 'in-window', label: 'In-window (fill tab)' },
      { id: 'windowed', label: 'Windowed (popup)' },
      { id: 'native', label: 'Native fullscreen' },
      { id: 'block', label: 'Block fullscreen' },
      { id: 'sticky', label: 'Sticky (keep fullscreen)' },
    ];

    for (const p of policies) {
      chrome.contextMenus.create({
        id: `fsc-set-${p.id}`,
        parentId: 'fsc-parent',
        title: p.label,
        contexts: ['page', 'video'],
      });
    }

    chrome.contextMenus.create({
      id: 'fsc-separator',
      parentId: 'fsc-parent',
      type: 'separator',
      contexts: ['page', 'video'],
    });

    chrome.contextMenus.create({
      id: 'fsc-disable-hour',
      parentId: 'fsc-parent',
      title: 'Disable for 1 hour',
      contexts: ['page', 'video'],
    });

    chrome.contextMenus.create({
      id: 'fsc-open-options',
      parentId: 'fsc-parent',
      title: 'Open settings…',
      contexts: ['page', 'video'],
    });
  });
}

// ---------------------------------------------------------------------------
// Context menu click handler
// ---------------------------------------------------------------------------

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.url) return;
  const hostname = hostnameFromUrl(tab.url);
  if (!hostname) return;

  const schema = await getSchema();

  if (info.menuItemId === 'fsc-open-options') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/options.html') });
    return;
  }

  if (info.menuItemId === 'fsc-disable-hour') {
    await handleDisableForHour(hostname, schema, tab.id);
    return;
  }

  const policyMap: Record<string, Policy> = {
    'fsc-set-ask': 'ask',
    'fsc-set-in-window': 'in-window',
    'fsc-set-windowed': 'windowed',
    'fsc-set-native': 'native',
    'fsc-set-block': 'block',
    'fsc-set-sticky': 'sticky',
  };

  const policy = policyMap[info.menuItemId as string];
  if (policy) {
    await setRuleForHost(hostname, policy, schema);
    if (tab.id != null) {
      await updateBadge(tab.id, tab.url);
    }
  }
});

// ---------------------------------------------------------------------------
// Message handler from content scripts
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((
  rawMsg: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean => {
  void handleMessage(rawMsg as ContentToSW, sender, sendResponse);
  return true; // keep channel open for async response
});

async function handleMessage(
  msg: ContentToSW,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): Promise<void> {
  const tabId = sender.tab?.id;
  // url is available on most message types as explicit field; fall back to sender tab url
  const url = ('url' in msg && typeof msg.url === 'string') ? msg.url : (sender.tab?.url ?? '');

  void debugLog(`SW received: ${msg.type}`, { url, tabId });

  switch (msg.type) {
    case 'FULLSCREEN_REQUESTED': {
      const response = await handleFullscreenRequest(msg, url, tabId);
      sendResponse(response);
      break;
    }

    case 'FULLSCREEN_EXITED': {
      sendResponse({ ok: true } satisfies AckResponse);
      break;
    }

    case 'GET_RULE': {
      const schema = await getSchema();
      const rule = getEffectiveRule(msg.url, schema);
      sendResponse({ ok: true, rule });
      break;
    }

    case 'SET_RULE': {
      const schema = await getSchema();
      await setRuleForHost(msg.host, msg.policy, schema, msg.flags);
      if (tabId != null) await updateBadge(tabId, url);
      sendResponse({ ok: true } satisfies AckResponse);
      break;
    }

    case 'DISABLE_FOR_HOUR': {
      const schema = await getSchema();
      await handleDisableForHour(msg.host, schema, tabId);
      sendResponse({ ok: true } satisfies AckResponse);
      break;
    }

    case 'INCREMENT_STAT': {
      await incrementStat(msg.key);
      sendResponse({ ok: true } satisfies AckResponse);
      break;
    }

    case 'STICKY_ESC_PRESSED': {
      await setEscCooldown(msg.hostname);
      sendResponse({ ok: true } satisfies AckResponse);
      break;
    }

    case 'OPEN_HUD': {
      if (tabId != null) {
        const schema = await getSchema();
        const rule = getEffectiveRule(msg.url, schema);
        const payload: SWToContent = {
          type: 'SHOW_HUD',
          hasVideo: false, // isolated world will re-detect
          pip: rule.pip,
        };
        await chrome.tabs.sendMessage(tabId, payload);
      }
      sendResponse({ ok: true } satisfies AckResponse);
      break;
    }

    case 'GESTURE_FULLSCREEN_SUCCESS': {
      await incrementStat('stickyEngagements');
      sendResponse({ ok: true } satisfies AckResponse);
      break;
    }

    default:
      sendResponse({ ok: false, error: 'Unknown message type' } satisfies AckResponse);
  }
}

// ---------------------------------------------------------------------------
// Fullscreen request logic
// ---------------------------------------------------------------------------

async function handleFullscreenRequest(
  msg: ContentToSW & { type: 'FULLSCREEN_REQUESTED' },
  url: string,
  tabId: number | undefined,
): Promise<SWToContent> {
  const schema = await getSchema();
  const rule = getEffectiveRule(url, schema);

  // Check session exception (disabled for N hours)
  const isDisabled = rule.disabledUntil > 0 && rule.disabledUntil > Date.now();
  const effectivePolicy: Policy = isDisabled ? schema.defaultPolicy : rule.policy;

  void debugLog('Fullscreen request', { url, effectivePolicy, shiftKey: msg.shiftKey });

  // Force 'ask' if Shift was held
  const policy = msg.shiftKey ? 'ask' : effectivePolicy;

  switch (policy) {
    case 'block':
      await incrementStat('blockedAttempts');
      return {
        type: 'APPLY_RULE',
        policy: 'block',
        spoof: false,
        blockPointerLock: rule.blockPointerLock,
        blockF11: rule.blockF11,
        hideCursorAfterIdleMs: rule.hideCursorAfterIdleMs,
        showGestureButton: rule.showGestureButton,
        pip: rule.pip,
      };

    case 'in-window':
      await incrementStat('redirectedToInWindow');
      return {
        type: 'APPLY_RULE',
        policy: 'in-window',
        spoof: rule.spoofFullscreenApi,
        blockPointerLock: rule.blockPointerLock,
        blockF11: rule.blockF11,
        hideCursorAfterIdleMs: rule.hideCursorAfterIdleMs,
        showGestureButton: rule.showGestureButton,
        pip: rule.pip,
      };

    case 'windowed':
      if (tabId != null) {
        await executeWindowedMode(tabId, url);
      }
      await incrementStat('redirectedToWindowed');
      return {
        type: 'APPLY_RULE',
        policy: 'windowed',
        spoof: rule.spoofFullscreenApi,
        blockPointerLock: rule.blockPointerLock,
        blockF11: rule.blockF11,
        hideCursorAfterIdleMs: rule.hideCursorAfterIdleMs,
        showGestureButton: rule.showGestureButton,
        pip: rule.pip,
      };

    case 'native':
      return {
        type: 'APPLY_RULE',
        policy: 'native',
        spoof: false,
        blockPointerLock: false,
        blockF11: false,
        hideCursorAfterIdleMs: 0,
        showGestureButton: false,
        pip: rule.pip,
      };

    case 'ask':
      return {
        type: 'SHOW_HUD',
        hasVideo: msg.hasVideo,
        pip: rule.pip,
      };

    case 'sticky':
      // Sticky initiated by webNavigation, not by requestFullscreen
      // If a site calls requestFullscreen directly, treat as native
      return {
        type: 'APPLY_RULE',
        policy: 'native',
        spoof: false,
        blockPointerLock: false,
        blockF11: false,
        hideCursorAfterIdleMs: rule.hideCursorAfterIdleMs,
        showGestureButton: rule.showGestureButton,
        pip: rule.pip,
      };
  }
}

// ---------------------------------------------------------------------------
// Windowed mode — tab.move into popup window
// ---------------------------------------------------------------------------

async function executeWindowedMode(tabId: number, _url: string): Promise<void> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const originalWindowId = tab.windowId;
    const originalIndex = tab.index;
    const wasPinned = tab.pinned ?? false;

    // If pinned, unpin first (Chrome won't move pinned tabs cleanly)
    if (wasPinned) {
      await chrome.tabs.update(tabId, { pinned: false });
    }

    // Create empty popup window (no URL = no reload)
    const newWindow = await chrome.windows.create({
      type: 'popup',
      focused: true,
      width: 1200,
      height: 800,
    });

    if (!newWindow?.id) {
      // Restore pin if we unpinned
      if (wasPinned) await chrome.tabs.update(tabId, { pinned: true });
      throw new Error('Failed to create popup window');
    }

    const newWindowId = newWindow.id;

    // Move the tab to the new popup window (no page reload)
    await chrome.tabs.move(tabId, { windowId: newWindowId, index: 0 });

    // Close the empty tab that was created with the window
    const windowTabs = await chrome.tabs.query({ windowId: newWindowId });
    for (const t of windowTabs) {
      if (t.id !== tabId && t.id != null) {
        await chrome.tabs.remove(t.id);
      }
    }

    // Persist restoration info in session storage (survives SW sleep)
    await setWindowedEntry({
      tabId,
      originalWindowId,
      originalIndex,
      wasPinned,
      popupWindowId: newWindowId,
    });

    void debugLog('Windowed mode activated', { tabId, newWindowId, originalWindowId });

  } catch (err) {
    console.error('[FullscreenControl] executeWindowedMode failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Window removed — restore tab to original window
// ---------------------------------------------------------------------------

chrome.windows.onRemoved.addListener(async (windowId: number) => {
  const entry = await getWindowedEntry(windowId);
  if (!entry) return;

  void debugLog('Popup window closed, restoring tab', entry);

  await removeWindowedEntry(windowId);

  try {
    // Verify original window still exists
    await chrome.windows.get(entry.originalWindowId);
  } catch {
    // Original window gone — tab stays in whatever window Chrome placed it
    console.warn('[FullscreenControl] Original window gone; cannot restore tab position.');
    return;
  }

  try {
    // Move tab back
    await chrome.tabs.move(entry.tabId, {
      windowId: entry.originalWindowId,
      index: entry.originalIndex,
    });

    // Restore pin state
    if (entry.wasPinned) {
      await chrome.tabs.update(entry.tabId, { pinned: true });
    }

    // Focus original window
    await chrome.windows.update(entry.originalWindowId, { focused: true });

  } catch (err) {
    console.error('[FullscreenControl] Tab restore failed:', err);
  }
});

// ---------------------------------------------------------------------------
// Sticky mode — webNavigation listener
// ---------------------------------------------------------------------------

chrome.webNavigation.onCompleted.addListener(async (details) => {
  // Only top-level frames for sticky
  if (details.frameId !== 0) return;
  await handleStickyNavigation(details.tabId, details.url, false);
});

chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.frameId !== 0) return;
  // SPA route change — re-apply sticky
  await handleStickyNavigation(details.tabId, details.url, true);
});

// Track which tabs have had their first load handled (for skipInitialLoad)
const firstLoadDone = new Set<number>();

async function handleStickyNavigation(
  tabId: number,
  url: string,
  isSpa: boolean,
): Promise<void> {
  const schema = await getSchema();
  const rule = getEffectiveRule(url, schema);

  if (rule.policy !== 'sticky') return;

  const hostname = hostnameFromUrl(url);

  // skipInitialLoad: skip forcing fullscreen on the very first page load
  if (rule.skipInitialLoad && !isSpa && !firstLoadDone.has(tabId)) {
    firstLoadDone.add(tabId);
    return;
  }
  firstLoadDone.add(tabId);

  // Check Esc cooldown — don't fight the user
  const onCooldown = await isEscCooldownActive(hostname);
  if (onCooldown) {
    void debugLog('Sticky Esc cooldown active', { hostname });
    return;
  }

  void debugLog('Sticky navigation — attempting fullscreen', { tabId, url });

  try {
    const tab = await chrome.tabs.get(tabId);
    const windowId = tab.windowId;

    // Attempt OS-level fullscreen via chrome.windows.update
    await chrome.windows.update(windowId, { state: 'fullscreen' });

    await incrementStat('stickyEngagements');

    // Apply sticky rule to content scripts in this tab
    const payload: SWToContent = {
      type: 'APPLY_RULE',
      policy: 'sticky',
      spoof: rule.spoofFullscreenApi,
      blockPointerLock: rule.blockPointerLock,
      blockF11: rule.blockF11,
      hideCursorAfterIdleMs: rule.hideCursorAfterIdleMs,
      showGestureButton: rule.showGestureButton,
      pip: rule.pip,
    };

    try {
      await chrome.tabs.sendMessage(tabId, payload);
    } catch {
      // Tab may not have content script yet — that's fine
    }

  } catch (err) {
    void debugLog('windows.update failed (gesture required path)', { err });

    // Arc-style: windows.update rejected — show gesture overlay
    if (rule.showGestureButton) {
      const gesturePayload: SWToContent = { type: 'SHOW_GESTURE_OVERLAY' };
      try {
        await chrome.tabs.sendMessage(tabId, gesturePayload);
      } catch {
        // Content script not ready yet
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Badge management
// ---------------------------------------------------------------------------

const BADGE_MAP: Record<Policy, string> = {
  ask: '?',
  'in-window': 'I',
  windowed: 'W',
  native: 'F',
  block: 'B',
  sticky: 'S',
};

const BADGE_COLOR_MAP: Record<Policy, string> = {
  ask: '#6b7280',
  'in-window': '#3b82f6',
  windowed: '#8b5cf6',
  native: '#10b981',
  block: '#ef4444',
  sticky: '#f97316',
};

async function updateBadge(tabId: number, url: string): Promise<void> {
  const schema = await getSchema();
  const rule = getEffectiveRule(url, schema);
  const policy = rule.disabledUntil > Date.now() ? schema.defaultPolicy : rule.policy;

  await chrome.action.setBadgeText({ text: BADGE_MAP[policy], tabId });
  await chrome.action.setBadgeBackgroundColor({
    color: BADGE_COLOR_MAP[policy],
    tabId,
  });
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url) {
    await updateBadge(activeInfo.tabId, tab.url);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.url) {
    await updateBadge(tabId, tab.url);
  }
});

// ---------------------------------------------------------------------------
// Keyboard commands
// ---------------------------------------------------------------------------

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return;

  if (command === 'toggle-block') {
    await handleToggleBlock(tab.id, tab.url);
  } else if (command === 'open-hud') {
    await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_HUD', hasVideo: false, pip: false } satisfies SWToContent);
  }
});

async function handleToggleBlock(tabId: number, url: string): Promise<void> {
  const schema = await getSchema();
  const hostname = hostnameFromUrl(url);
  const rule = getEffectiveRule(url, schema);

  const newPolicy: Policy = rule.policy === 'block' ? schema.defaultPolicy : 'block';
  await setRuleForHost(hostname, newPolicy, schema);
  await updateBadge(tabId, url);
}

// ---------------------------------------------------------------------------
// Rule management helpers
// ---------------------------------------------------------------------------

async function setRuleForHost(
  host: string,
  policy: Policy,
  schema: StorageSchema,
  flags?: Partial<import('../lib/types.js').OriginRule>,
): Promise<void> {
  const existingIdx = schema.rules.findIndex(r => r.host === host);

  if (existingIdx >= 0) {
    schema.rules[existingIdx] = {
      ...schema.rules[existingIdx],
      ...flags,
      host,
      policy,
    };
  } else {
    schema.rules.push({ host, policy, ...flags });
  }

  saveSchema(schema);
  invalidateCache();
}

async function handleDisableForHour(
  host: string,
  schema: StorageSchema,
  tabId: number | undefined,
): Promise<void> {
  const existingIdx = schema.rules.findIndex(r => r.host === host);
  const until = Date.now() + 3_600_000; // 1 hour

  if (existingIdx >= 0) {
    schema.rules[existingIdx].disabledUntil = until;
  } else {
    schema.rules.push({ host, policy: schema.defaultPolicy, disabledUntil: until });
  }

  saveSchema(schema);
  invalidateCache();

  if (tabId != null) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) await updateBadge(tabId, tab.url);
  }
}

// ---------------------------------------------------------------------------
// Storage change listener — invalidate cache when another context writes
// ---------------------------------------------------------------------------

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'sync') {
    invalidateCache();
  }
});
