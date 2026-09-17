/**
 * Popup script for Fullscreen Control.
 * Loads in < 50ms: no heavy framework, direct DOM manipulation.
 */

import { loadSchema, saveSchema, loadStats } from '../lib/storage.js';
import { getEffectiveRule, hostnameFromUrl } from '../lib/rules.js';
import type { Policy, StorageSchema } from '../lib/types.js';
import type { ContentToSW } from '../lib/messages.js';

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const $ = <T extends Element>(id: string): T => document.getElementById(id) as unknown as T;

const headerHost = $<HTMLElement>('header-host');
const policyDot = $<HTMLElement>('policy-dot');
const currentPolicyLabel = $<HTMLElement>('current-policy-label');
const policySublabel = $<HTMLElement>('policy-sublabel');
const disabledBadge = $<HTMLElement>('disabled-badge');
const statBlocked = $<HTMLElement>('stat-blocked');
const statInWindow = $<HTMLElement>('stat-inwindow');
const statSticky = $<HTMLElement>('stat-sticky');
const togglePip = $<HTMLInputElement>('toggle-pip');
const togglePointerLock = $<HTMLInputElement>('toggle-pointer-lock');
const toggleF11 = $<HTMLInputElement>('toggle-f11');

// ---------------------------------------------------------------------------
// Policy metadata
// ---------------------------------------------------------------------------

const POLICY_META: Record<Policy, { label: string; color: string }> = {
  ask:        { label: 'Ask every time', color: 'var(--c-ask)' },
  'in-window':{ label: 'In-window',      color: 'var(--c-in-window)' },
  windowed:   { label: 'Windowed popup', color: 'var(--c-windowed)' },
  native:     { label: 'Native fullscreen', color: 'var(--c-native)' },
  block:      { label: 'Block fullscreen', color: 'var(--c-block)' },
  sticky:     { label: 'Sticky fullscreen', color: 'var(--c-sticky)' },
};

// ---------------------------------------------------------------------------
// Load & render
// ---------------------------------------------------------------------------

let schema: StorageSchema;
let currentHostname = '';
let currentUrl = '';

async function init(): Promise<void> {
  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    headerHost.textContent = 'No active tab';
    return;
  }

  currentUrl = tab.url;
  currentHostname = hostnameFromUrl(currentUrl);
  headerHost.textContent = currentHostname || tab.url;
  headerHost.title = currentUrl;

  // Load schema + stats in parallel
  [schema] = await Promise.all([loadSchema(), renderStats()]);

  renderPolicy();
  wireButtons();
}

function renderPolicy(): void {
  const rule = getEffectiveRule(currentUrl, schema);
  const isDisabled = rule.disabledUntil > 0 && rule.disabledUntil > Date.now();
  const displayPolicy = isDisabled ? schema.defaultPolicy : rule.policy;
  const meta = POLICY_META[displayPolicy];

  policyDot.style.background = meta.color;
  currentPolicyLabel.textContent = meta.label;
  policySublabel.textContent = rule.isExplicit
    ? `Rule: ${rule.matchedHost}`
    : 'Global default';

  disabledBadge.classList.toggle('hidden', !isDisabled);

  // Mark active button
  document.querySelectorAll('.policy-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-policy') === displayPolicy);
  });

  // Flags
  togglePip.checked = rule.pip;
  togglePointerLock.checked = rule.blockPointerLock;
  toggleF11.checked = rule.blockF11;
}

async function renderStats(): Promise<void> {
  const stats = await loadStats();
  statBlocked.textContent = formatCount(stats.blockedAttempts);
  statInWindow.textContent = formatCount(stats.redirectedToInWindow);
  statSticky.textContent = formatCount(stats.stickyEngagements);
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Interactivity
// ---------------------------------------------------------------------------

function wireButtons(): void {
  // Policy grid
  document.querySelectorAll<HTMLButtonElement>('.policy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const policy = btn.getAttribute('data-policy') as Policy;
      await setPolicy(policy);
    });
  });

  // Flag toggles
  togglePip.addEventListener('change', async () => {
    await updateFlag('pip', togglePip.checked);
  });
  togglePointerLock.addEventListener('change', async () => {
    await updateFlag('blockPointerLock', togglePointerLock.checked);
  });
  toggleF11.addEventListener('change', async () => {
    await updateFlag('blockF11', toggleF11.checked);
  });

  // Disable for 1 hour
  $('btn-disable-hour').addEventListener('click', async () => {
    if (!currentHostname) return;
    await chrome.runtime.sendMessage({
      type: 'DISABLE_FOR_HOUR',
      host: currentHostname,
    } satisfies ContentToSW);
    schema = await loadSchema();
    renderPolicy();
  });

  // Open options
  $('open-options').addEventListener('click', openOptions);
  $('btn-open-options').addEventListener('click', openOptions);
}

async function setPolicy(policy: Policy): Promise<void> {
  if (!currentHostname) return;

  await chrome.runtime.sendMessage({
    type: 'SET_RULE',
    host: currentHostname,
    policy,
  } satisfies ContentToSW);

  // Reload schema from storage
  schema = await loadSchema();
  renderPolicy();
}

async function updateFlag(
  flag: 'pip' | 'blockPointerLock' | 'blockF11',
  value: boolean,
): Promise<void> {
  if (!currentHostname) return;

  const existingIdx = schema.rules.findIndex(r => r.host === currentHostname);
  if (existingIdx >= 0) {
    schema.rules[existingIdx][flag] = value;
  } else {
    // Create a rule with the current effective policy + this flag
    const rule = getEffectiveRule(currentUrl, schema);
    schema.rules.push({
      host: currentHostname,
      policy: rule.policy,
      [flag]: value,
    });
  }

  saveSchema(schema);
  renderPolicy();
}

function openOptions(): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/options.html') });
  window.close();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

void init();
