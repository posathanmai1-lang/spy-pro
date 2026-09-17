import { d as debugLog, l as loadSchema, a as loadStats, i as incrementStat, s as setEscCooldown, b as setWindowedEntry, g as getWindowedEntry, r as removeWindowedEntry, c as isEscCooldownActive, e as saveSchema } from "./storage-CToGBJDS.js";
import { h as hostnameFromUrl, g as getEffectiveRule } from "./rules-C71vWFrN.js";
let schemaCache = null;
async function getSchema() {
  if (!schemaCache) {
    schemaCache = await loadSchema();
  }
  return schemaCache;
}
function invalidateCache() {
  schemaCache = null;
}
chrome.runtime.onInstalled.addListener(async (details) => {
  await initStorage();
  setupContextMenus();
  if (details.reason === "install") {
    void debugLog("Extension installed");
    await chrome.tabs.create({ url: chrome.runtime.getURL("src/ui/options.html") });
  } else if (details.reason === "update") {
    void debugLog("Extension updated", { version: chrome.runtime.getManifest().version });
  }
});
chrome.runtime.onStartup.addListener(async () => {
  await initStorage();
  setupContextMenus();
});
async function initStorage() {
  const schema = await loadSchema();
  schemaCache = schema;
  await loadStats();
}
function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "fsc-parent",
      title: "Fullscreen Control",
      contexts: ["page", "video"]
    });
    const policies = [
      { id: "ask", label: "Ask every time" },
      { id: "in-window", label: "In-window (fill tab)" },
      { id: "windowed", label: "Windowed (popup)" },
      { id: "native", label: "Native fullscreen" },
      { id: "block", label: "Block fullscreen" },
      { id: "sticky", label: "Sticky (keep fullscreen)" }
    ];
    for (const p of policies) {
      chrome.contextMenus.create({
        id: `fsc-set-${p.id}`,
        parentId: "fsc-parent",
        title: p.label,
        contexts: ["page", "video"]
      });
    }
    chrome.contextMenus.create({
      id: "fsc-separator",
      parentId: "fsc-parent",
      type: "separator",
      contexts: ["page", "video"]
    });
    chrome.contextMenus.create({
      id: "fsc-disable-hour",
      parentId: "fsc-parent",
      title: "Disable for 1 hour",
      contexts: ["page", "video"]
    });
    chrome.contextMenus.create({
      id: "fsc-open-options",
      parentId: "fsc-parent",
      title: "Open settings…",
      contexts: ["page", "video"]
    });
  });
}
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.url) return;
  const hostname = hostnameFromUrl(tab.url);
  if (!hostname) return;
  const schema = await getSchema();
  if (info.menuItemId === "fsc-open-options") {
    await chrome.tabs.create({ url: chrome.runtime.getURL("src/ui/options.html") });
    return;
  }
  if (info.menuItemId === "fsc-disable-hour") {
    await handleDisableForHour(hostname, schema, tab.id);
    return;
  }
  const policyMap = {
    "fsc-set-ask": "ask",
    "fsc-set-in-window": "in-window",
    "fsc-set-windowed": "windowed",
    "fsc-set-native": "native",
    "fsc-set-block": "block",
    "fsc-set-sticky": "sticky"
  };
  const policy = policyMap[info.menuItemId];
  if (policy) {
    await setRuleForHost(hostname, policy, schema);
    if (tab.id != null) {
      await updateBadge(tab.id, tab.url);
    }
  }
});
chrome.runtime.onMessage.addListener((rawMsg, sender, sendResponse) => {
  void handleMessage(rawMsg, sender, sendResponse);
  return true;
});
async function handleMessage(msg, sender, sendResponse) {
  const tabId = sender.tab?.id;
  const url = "url" in msg && typeof msg.url === "string" ? msg.url : sender.tab?.url ?? "";
  void debugLog(`SW received: ${msg.type}`, { url, tabId });
  switch (msg.type) {
    case "FULLSCREEN_REQUESTED": {
      const response = await handleFullscreenRequest(msg, url, tabId);
      sendResponse(response);
      break;
    }
    case "FULLSCREEN_EXITED": {
      sendResponse({ ok: true });
      break;
    }
    case "GET_RULE": {
      const schema = await getSchema();
      const rule = getEffectiveRule(msg.url, schema);
      sendResponse({ ok: true, rule });
      break;
    }
    case "SET_RULE": {
      const schema = await getSchema();
      await setRuleForHost(msg.host, msg.policy, schema, msg.flags);
      if (tabId != null) await updateBadge(tabId, url);
      sendResponse({ ok: true });
      break;
    }
    case "DISABLE_FOR_HOUR": {
      const schema = await getSchema();
      await handleDisableForHour(msg.host, schema, tabId);
      sendResponse({ ok: true });
      break;
    }
    case "INCREMENT_STAT": {
      await incrementStat(msg.key);
      sendResponse({ ok: true });
      break;
    }
    case "STICKY_ESC_PRESSED": {
      await setEscCooldown(msg.hostname);
      sendResponse({ ok: true });
      break;
    }
    case "OPEN_HUD": {
      if (tabId != null) {
        const schema = await getSchema();
        const rule = getEffectiveRule(msg.url, schema);
        const payload = {
          type: "SHOW_HUD",
          hasVideo: false,
          // isolated world will re-detect
          pip: rule.pip
        };
        await chrome.tabs.sendMessage(tabId, payload);
      }
      sendResponse({ ok: true });
      break;
    }
    case "GESTURE_FULLSCREEN_SUCCESS": {
      await incrementStat("stickyEngagements");
      sendResponse({ ok: true });
      break;
    }
    default:
      sendResponse({ ok: false, error: "Unknown message type" });
  }
}
async function handleFullscreenRequest(msg, url, tabId) {
  const schema = await getSchema();
  const rule = getEffectiveRule(url, schema);
  const isDisabled = rule.disabledUntil > 0 && rule.disabledUntil > Date.now();
  const effectivePolicy = isDisabled ? schema.defaultPolicy : rule.policy;
  void debugLog("Fullscreen request", { url, effectivePolicy, shiftKey: msg.shiftKey });
  const policy = msg.shiftKey ? "ask" : effectivePolicy;
  switch (policy) {
    case "block":
      await incrementStat("blockedAttempts");
      return {
        type: "APPLY_RULE",
        policy: "block",
        spoof: false,
        blockPointerLock: rule.blockPointerLock,
        blockF11: rule.blockF11,
        hideCursorAfterIdleMs: rule.hideCursorAfterIdleMs,
        showGestureButton: rule.showGestureButton,
        pip: rule.pip
      };
    case "in-window":
      await incrementStat("redirectedToInWindow");
      return {
        type: "APPLY_RULE",
        policy: "in-window",
        spoof: rule.spoofFullscreenApi,
        blockPointerLock: rule.blockPointerLock,
        blockF11: rule.blockF11,
        hideCursorAfterIdleMs: rule.hideCursorAfterIdleMs,
        showGestureButton: rule.showGestureButton,
        pip: rule.pip
      };
    case "windowed":
      if (tabId != null) {
        await executeWindowedMode(tabId);
      }
      await incrementStat("redirectedToWindowed");
      return {
        type: "APPLY_RULE",
        policy: "windowed",
        spoof: rule.spoofFullscreenApi,
        blockPointerLock: rule.blockPointerLock,
        blockF11: rule.blockF11,
        hideCursorAfterIdleMs: rule.hideCursorAfterIdleMs,
        showGestureButton: rule.showGestureButton,
        pip: rule.pip
      };
    case "native":
      return {
        type: "APPLY_RULE",
        policy: "native",
        spoof: false,
        blockPointerLock: false,
        blockF11: false,
        hideCursorAfterIdleMs: 0,
        showGestureButton: false,
        pip: rule.pip
      };
    case "ask":
      return {
        type: "SHOW_HUD",
        hasVideo: msg.hasVideo,
        pip: rule.pip
      };
    case "sticky":
      return {
        type: "APPLY_RULE",
        policy: "native",
        spoof: false,
        blockPointerLock: false,
        blockF11: false,
        hideCursorAfterIdleMs: rule.hideCursorAfterIdleMs,
        showGestureButton: rule.showGestureButton,
        pip: rule.pip
      };
  }
}
async function executeWindowedMode(tabId, _url) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const originalWindowId = tab.windowId;
    const originalIndex = tab.index;
    const wasPinned = tab.pinned ?? false;
    if (wasPinned) {
      await chrome.tabs.update(tabId, { pinned: false });
    }
    const newWindow = await chrome.windows.create({
      type: "popup",
      focused: true,
      width: 1200,
      height: 800
    });
    if (!newWindow?.id) {
      if (wasPinned) await chrome.tabs.update(tabId, { pinned: true });
      throw new Error("Failed to create popup window");
    }
    const newWindowId = newWindow.id;
    await chrome.tabs.move(tabId, { windowId: newWindowId, index: 0 });
    const windowTabs = await chrome.tabs.query({ windowId: newWindowId });
    for (const t of windowTabs) {
      if (t.id !== tabId && t.id != null) {
        await chrome.tabs.remove(t.id);
      }
    }
    await setWindowedEntry({
      tabId,
      originalWindowId,
      originalIndex,
      wasPinned,
      popupWindowId: newWindowId
    });
    void debugLog("Windowed mode activated", { tabId, newWindowId, originalWindowId });
  } catch (err) {
    console.error("[FullscreenControl] executeWindowedMode failed:", err);
  }
}
chrome.windows.onRemoved.addListener(async (windowId) => {
  const entry = await getWindowedEntry(windowId);
  if (!entry) return;
  void debugLog("Popup window closed, restoring tab", entry);
  await removeWindowedEntry(windowId);
  try {
    await chrome.windows.get(entry.originalWindowId);
  } catch {
    console.warn("[FullscreenControl] Original window gone; cannot restore tab position.");
    return;
  }
  try {
    await chrome.tabs.move(entry.tabId, {
      windowId: entry.originalWindowId,
      index: entry.originalIndex
    });
    if (entry.wasPinned) {
      await chrome.tabs.update(entry.tabId, { pinned: true });
    }
    await chrome.windows.update(entry.originalWindowId, { focused: true });
  } catch (err) {
    console.error("[FullscreenControl] Tab restore failed:", err);
  }
});
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  await handleStickyNavigation(details.tabId, details.url, false);
});
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.frameId !== 0) return;
  await handleStickyNavigation(details.tabId, details.url, true);
});
const firstLoadDone = /* @__PURE__ */ new Set();
async function handleStickyNavigation(tabId, url, isSpa) {
  const schema = await getSchema();
  const rule = getEffectiveRule(url, schema);
  if (rule.policy !== "sticky") return;
  const hostname = hostnameFromUrl(url);
  if (rule.skipInitialLoad && !isSpa && !firstLoadDone.has(tabId)) {
    firstLoadDone.add(tabId);
    return;
  }
  firstLoadDone.add(tabId);
  const onCooldown = await isEscCooldownActive(hostname);
  if (onCooldown) {
    void debugLog("Sticky Esc cooldown active", { hostname });
    return;
  }
  void debugLog("Sticky navigation — attempting fullscreen", { tabId, url });
  try {
    const tab = await chrome.tabs.get(tabId);
    const windowId = tab.windowId;
    await chrome.windows.update(windowId, { state: "fullscreen" });
    await incrementStat("stickyEngagements");
    const payload = {
      type: "APPLY_RULE",
      policy: "sticky",
      spoof: rule.spoofFullscreenApi,
      blockPointerLock: rule.blockPointerLock,
      blockF11: rule.blockF11,
      hideCursorAfterIdleMs: rule.hideCursorAfterIdleMs,
      showGestureButton: rule.showGestureButton,
      pip: rule.pip
    };
    try {
      await chrome.tabs.sendMessage(tabId, payload);
    } catch {
    }
  } catch (err) {
    void debugLog("windows.update failed (gesture required path)", { err });
    if (rule.showGestureButton) {
      const gesturePayload = { type: "SHOW_GESTURE_OVERLAY" };
      try {
        await chrome.tabs.sendMessage(tabId, gesturePayload);
      } catch {
      }
    }
  }
}
const BADGE_MAP = {
  ask: "?",
  "in-window": "I",
  windowed: "W",
  native: "F",
  block: "B",
  sticky: "S"
};
const BADGE_COLOR_MAP = {
  ask: "#6b7280",
  "in-window": "#3b82f6",
  windowed: "#8b5cf6",
  native: "#10b981",
  block: "#ef4444",
  sticky: "#f97316"
};
async function updateBadge(tabId, url) {
  const schema = await getSchema();
  const rule = getEffectiveRule(url, schema);
  const policy = rule.disabledUntil > Date.now() ? schema.defaultPolicy : rule.policy;
  await chrome.action.setBadgeText({ text: BADGE_MAP[policy], tabId });
  await chrome.action.setBadgeBackgroundColor({
    color: BADGE_COLOR_MAP[policy],
    tabId
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
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return;
  if (command === "toggle-block") {
    await handleToggleBlock(tab.id, tab.url);
  } else if (command === "open-hud") {
    await chrome.tabs.sendMessage(tab.id, { type: "SHOW_HUD", hasVideo: false, pip: false });
  }
});
async function handleToggleBlock(tabId, url) {
  const schema = await getSchema();
  const hostname = hostnameFromUrl(url);
  const rule = getEffectiveRule(url, schema);
  const newPolicy = rule.policy === "block" ? schema.defaultPolicy : "block";
  await setRuleForHost(hostname, newPolicy, schema);
  await updateBadge(tabId, url);
}
async function setRuleForHost(host, policy, schema, flags) {
  const existingIdx = schema.rules.findIndex((r) => r.host === host);
  if (existingIdx >= 0) {
    schema.rules[existingIdx] = {
      ...schema.rules[existingIdx],
      ...flags,
      host,
      policy
    };
  } else {
    schema.rules.push({ host, policy, ...flags });
  }
  saveSchema(schema);
  invalidateCache();
}
async function handleDisableForHour(host, schema, tabId) {
  const existingIdx = schema.rules.findIndex((r) => r.host === host);
  const until = Date.now() + 36e5;
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
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "sync") {
    invalidateCache();
  }
});
//# sourceMappingURL=service-worker.ts-CjO3WwtI.js.map
