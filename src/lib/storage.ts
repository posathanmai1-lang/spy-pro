/**
 * Storage layer for Fullscreen Control.
 *
 * chrome.storage.sync  — rules, settings (small, synced)
 * chrome.storage.local — stats counters (large-ish, local)
 * chrome.storage.session — ephemeral tab/window state (survives SW sleep)
 *
 * Writes are debounced to prevent hammering storage on rapid events.
 */

import type {
  StorageSchema,
  StatsSchema,
  WindowedSessionEntry,
  StickyEscCooldown,
} from './types.js';
import { SCHEMA_VERSION } from './types.js';
import { FRAGILE_SITES } from './fragile-sites.js';

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

export const DEFAULT_STORAGE: StorageSchema = {
  version: SCHEMA_VERSION,
  defaultPolicy: 'ask',
  rules: [],
  fragileSites: [...FRAGILE_SITES],
  debugLog: false,
};

export const DEFAULT_STATS: StatsSchema = {
  blockedAttempts: 0,
  redirectedToInWindow: 0,
  redirectedToWindowed: 0,
  stickyEngagements: 0,
  pipActivations: 0,
};

// ---------------------------------------------------------------------------
// Schema migration
// ---------------------------------------------------------------------------

function migrate(raw: Partial<StorageSchema>): StorageSchema {
  const version = raw.version ?? 0;

  // v0 → v1: add fragileSites + debugLog if missing
  if (version < 1) {
    return {
      ...DEFAULT_STORAGE,
      ...raw,
      version: 1,
      fragileSites: raw.fragileSites ?? [...FRAGILE_SITES],
      debugLog: raw.debugLog ?? false,
    };
  }

  return { ...DEFAULT_STORAGE, ...raw } as StorageSchema;
}

// ---------------------------------------------------------------------------
// Sync storage (rules)
// ---------------------------------------------------------------------------

export async function loadSchema(): Promise<StorageSchema> {
  const result = await chrome.storage.sync.get(null);
  if (!result || typeof result !== 'object' || !('version' in result)) {
    return { ...DEFAULT_STORAGE };
  }
  return migrate(result as Partial<StorageSchema>);
}

// Debounced sync write — prevents write storm on rapid rule edits
let syncWriteTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSchema: StorageSchema | null = null;

export function saveSchema(schema: StorageSchema): void {
  pendingSchema = schema;
  if (syncWriteTimer !== null) return; // already scheduled
  syncWriteTimer = setTimeout(() => {
    syncWriteTimer = null;
    if (pendingSchema) {
      void chrome.storage.sync.set(pendingSchema as unknown as Record<string, unknown>);
      pendingSchema = null;
    }
  }, 300);
}

export async function saveSchemaImmediate(schema: StorageSchema): Promise<void> {
  if (syncWriteTimer !== null) {
    clearTimeout(syncWriteTimer);
    syncWriteTimer = null;
  }
  pendingSchema = null;
  await chrome.storage.sync.set(schema as unknown as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Local storage (stats)
// ---------------------------------------------------------------------------

export async function loadStats(): Promise<StatsSchema> {
  const result = await chrome.storage.local.get('stats');
  return (result['stats'] as StatsSchema | undefined) ?? { ...DEFAULT_STATS };
}

// Debounced stats write
let statsWriteTimer: ReturnType<typeof setTimeout> | null = null;
let pendingStats: StatsSchema | null = null;

export function saveStats(stats: StatsSchema): void {
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

export async function incrementStat(
  key: keyof StatsSchema,
  amount = 1,
): Promise<void> {
  const stats = await loadStats();
  (stats[key] as number) += amount;
  saveStats(stats);
}

// ---------------------------------------------------------------------------
// Session storage (windowed tab state, sticky Esc cooldowns)
// ---------------------------------------------------------------------------

const WINDOWED_KEY = 'fsc_windowed';
const ESC_COOLDOWN_KEY = 'fsc_esc_cooldown';

export async function getWindowedEntry(
  popupWindowId: number,
): Promise<WindowedSessionEntry | null> {
  const result = await chrome.storage.session.get(WINDOWED_KEY);
  const map = (result[WINDOWED_KEY] ?? {}) as Record<number, WindowedSessionEntry>;
  return map[popupWindowId] ?? null;
}

export async function setWindowedEntry(entry: WindowedSessionEntry): Promise<void> {
  const result = await chrome.storage.session.get(WINDOWED_KEY);
  const map = (result[WINDOWED_KEY] ?? {}) as Record<number, WindowedSessionEntry>;
  map[entry.popupWindowId] = entry;
  await chrome.storage.session.set({ [WINDOWED_KEY]: map });
}

export async function removeWindowedEntry(popupWindowId: number): Promise<void> {
  const result = await chrome.storage.session.get(WINDOWED_KEY);
  const map = (result[WINDOWED_KEY] ?? {}) as Record<number, WindowedSessionEntry>;
  delete map[popupWindowId];
  await chrome.storage.session.set({ [WINDOWED_KEY]: map });
}

export async function getEscCooldowns(): Promise<StickyEscCooldown> {
  const result = await chrome.storage.session.get(ESC_COOLDOWN_KEY);
  return (result[ESC_COOLDOWN_KEY] ?? {}) as StickyEscCooldown;
}

export async function setEscCooldown(hostname: string, durationMs = 30_000): Promise<void> {
  const cooldowns = await getEscCooldowns();
  cooldowns[hostname] = Date.now() + durationMs;
  await chrome.storage.session.set({ [ESC_COOLDOWN_KEY]: cooldowns });
}

export async function isEscCooldownActive(hostname: string): Promise<boolean> {
  const cooldowns = await getEscCooldowns();
  const until = cooldowns[hostname];
  if (!until) return false;
  return until > Date.now();
}

// ---------------------------------------------------------------------------
// Debug log (stored in session, visible in options when debug mode on)
// ---------------------------------------------------------------------------

const DEBUG_LOG_KEY = 'fsc_debug_log';
const MAX_DEBUG_ENTRIES = 200;

export interface DebugEntry {
  ts: number;
  msg: string;
  data?: unknown;
}

export async function debugLog(msg: string, data?: unknown): Promise<void> {
  // Only write if debug is enabled — check without loading full schema
  const schemaResult = await chrome.storage.sync.get('debugLog');
  if (!schemaResult['debugLog']) return;

  const result = await chrome.storage.session.get(DEBUG_LOG_KEY);
  const log = (result[DEBUG_LOG_KEY] ?? []) as DebugEntry[];
  log.push({ ts: Date.now(), msg, data });
  // Trim to max entries
  if (log.length > MAX_DEBUG_ENTRIES) log.splice(0, log.length - MAX_DEBUG_ENTRIES);
  await chrome.storage.session.set({ [DEBUG_LOG_KEY]: log });
}

export async function getDebugLog(): Promise<DebugEntry[]> {
  const result = await chrome.storage.session.get(DEBUG_LOG_KEY);
  return (result[DEBUG_LOG_KEY] ?? []) as DebugEntry[];
}

export async function clearDebugLog(): Promise<void> {
  await chrome.storage.session.set({ [DEBUG_LOG_KEY]: [] });
}
