const SCHEMA_VERSION = 1;
const FRAGILE_SITES = [
  // GitHub Codespaces / dev environments
  "*.github.dev",
  "github.dev",
  // CodeSandbox
  "*.codesandbox.io",
  "codesandbox.io",
  // StackBlitz
  "*.stackblitz.io",
  "stackblitz.io",
  // VS Code Web
  "vscode.dev",
  "*.vscode.dev",
  // Gitpod
  "*.gitpod.io",
  "gitpod.io",
  // Replit
  "*.replit.com",
  "replit.com",
  // CodePen
  "codepen.io",
  "*.codepen.io",
  // JSFiddle
  "jsfiddle.net",
  // Glitch
  "glitch.com",
  "*.glitch.me",
  // Google Meet / Slides (fullscreen is intentional)
  "meet.google.com",
  "docs.google.com"
];
const DEFAULT_STORAGE = {
  version: SCHEMA_VERSION,
  defaultPolicy: "ask",
  rules: [],
  fragileSites: [...FRAGILE_SITES],
  debugLog: false
};
const DEFAULT_STATS = {
  blockedAttempts: 0,
  redirectedToInWindow: 0,
  redirectedToWindowed: 0,
  stickyEngagements: 0,
  pipActivations: 0
};
function migrate(raw) {
  const version = raw.version ?? 0;
  if (version < 1) {
    return {
      ...DEFAULT_STORAGE,
      ...raw,
      version: 1,
      fragileSites: raw.fragileSites ?? [...FRAGILE_SITES],
      debugLog: raw.debugLog ?? false
    };
  }
  return { ...DEFAULT_STORAGE, ...raw };
}
async function loadSchema() {
  const result = await chrome.storage.sync.get(null);
  if (!result || typeof result !== "object" || !("version" in result)) {
    return { ...DEFAULT_STORAGE };
  }
  return migrate(result);
}
let syncWriteTimer = null;
let pendingSchema = null;
function saveSchema(schema) {
  pendingSchema = schema;
  if (syncWriteTimer !== null) return;
  syncWriteTimer = setTimeout(() => {
    syncWriteTimer = null;
    if (pendingSchema) {
      void chrome.storage.sync.set(pendingSchema);
      pendingSchema = null;
    }
  }, 300);
}
async function saveSchemaImmediate(schema) {
  if (syncWriteTimer !== null) {
    clearTimeout(syncWriteTimer);
    syncWriteTimer = null;
  }
  pendingSchema = null;
  await chrome.storage.sync.set(schema);
}
async function loadStats() {
  const result = await chrome.storage.local.get("stats");
  return result["stats"] ?? { ...DEFAULT_STATS };
}
let statsWriteTimer = null;
let pendingStats = null;
function saveStats(stats) {
  pendingStats = stats;
  if (statsWriteTimer !== null) return;
  statsWriteTimer = setTimeout(() => {
    statsWriteTimer = null;
    if (pendingStats) {
      void chrome.storage.local.set({ stats: pendingStats });
      pendingStats = null;
    }
  }, 500);
}
async function incrementStat(key, amount = 1) {
  const stats = await loadStats();
  stats[key] += amount;
  saveStats(stats);
}
const WINDOWED_KEY = "fsc_windowed";
const ESC_COOLDOWN_KEY = "fsc_esc_cooldown";
async function getWindowedEntry(popupWindowId) {
  const result = await chrome.storage.session.get(WINDOWED_KEY);
  const map = result[WINDOWED_KEY] ?? {};
  return map[popupWindowId] ?? null;
}
async function setWindowedEntry(entry) {
  const result = await chrome.storage.session.get(WINDOWED_KEY);
  const map = result[WINDOWED_KEY] ?? {};
  map[entry.popupWindowId] = entry;
  await chrome.storage.session.set({ [WINDOWED_KEY]: map });
}
async function removeWindowedEntry(popupWindowId) {
  const result = await chrome.storage.session.get(WINDOWED_KEY);
  const map = result[WINDOWED_KEY] ?? {};
  delete map[popupWindowId];
  await chrome.storage.session.set({ [WINDOWED_KEY]: map });
}
async function getEscCooldowns() {
  const result = await chrome.storage.session.get(ESC_COOLDOWN_KEY);
  return result[ESC_COOLDOWN_KEY] ?? {};
}
async function setEscCooldown(hostname, durationMs = 3e4) {
  const cooldowns = await getEscCooldowns();
  cooldowns[hostname] = Date.now() + durationMs;
  await chrome.storage.session.set({ [ESC_COOLDOWN_KEY]: cooldowns });
}
async function isEscCooldownActive(hostname) {
  const cooldowns = await getEscCooldowns();
  const until = cooldowns[hostname];
  if (!until) return false;
  return until > Date.now();
}
const DEBUG_LOG_KEY = "fsc_debug_log";
const MAX_DEBUG_ENTRIES = 200;
async function debugLog(msg, data) {
  const schemaResult = await chrome.storage.sync.get("debugLog");
  if (!schemaResult["debugLog"]) return;
  const result = await chrome.storage.session.get(DEBUG_LOG_KEY);
  const log = result[DEBUG_LOG_KEY] ?? [];
  log.push({ ts: Date.now(), msg, data });
  if (log.length > MAX_DEBUG_ENTRIES) log.splice(0, log.length - MAX_DEBUG_ENTRIES);
  await chrome.storage.session.set({ [DEBUG_LOG_KEY]: log });
}
export {
  DEFAULT_STORAGE as D,
  FRAGILE_SITES as F,
  SCHEMA_VERSION as S,
  loadStats as a,
  setWindowedEntry as b,
  isEscCooldownActive as c,
  debugLog as d,
  saveSchema as e,
  saveSchemaImmediate as f,
  getWindowedEntry as g,
  incrementStat as i,
  loadSchema as l,
  removeWindowedEntry as r,
  setEscCooldown as s
};
//# sourceMappingURL=storage-CToGBJDS.js.map
