/**
 * Rules matching engine for Fullscreen Control.
 *
 * Matching priority (highest wins):
 *   1. Exact hostname + path prefix  (www.youtube.com/embed)
 *   2. Exact hostname                (www.youtube.com)
 *   3. Wildcard subdomain + path     (*.youtube.com/embed)
 *   4. Wildcard subdomain            (*.youtube.com)
 *   5. Bare domain (no www prefix)   (youtube.com)
 *   6. Wildcard all                  (*)
 *   7. Default policy
 *
 * Longer/more-specific patterns win over shorter ones within the same tier.
 */

import type { OriginRule, StorageSchema, EffectiveRule, Policy } from './types.js';
import { FRAGILE_SITES } from './fragile-sites.js';

// ---------------------------------------------------------------------------
// Pattern parsing
// ---------------------------------------------------------------------------

interface ParsedPattern {
  /** Original pattern string */
  raw: string;
  /** Hostname portion, may start with '*.' */
  host: string;
  /** Optional path prefix (everything after the first '/') */
  path: string;
  /** Whether this is a wildcard-subdomain pattern (starts with '*.') */
  isWildcard: boolean;
  /** Whether this matches exactly one hostname */
  isExact: boolean;
  /** Specificity score for tie-breaking */
  specificity: number;
}

function parsePattern(pattern: string): ParsedPattern {
  const slashIdx = pattern.indexOf('/');
  const host = slashIdx === -1 ? pattern : pattern.slice(0, slashIdx);
  const path = slashIdx === -1 ? '' : pattern.slice(slashIdx);
  const isWildcard = host.startsWith('*.');
  const isExact = !isWildcard && host !== '*';

  // Specificity: exact+path > exact > wildcard+path > wildcard > star
  let specificity = 0;
  if (host === '*') {
    specificity = 0;
  } else if (isWildcard && path) {
    specificity = 20 + path.length;
  } else if (isWildcard) {
    specificity = 10;
  } else if (isExact && path) {
    specificity = 40 + host.length + path.length;
  } else if (isExact) {
    specificity = 30 + host.length;
  }

  return { raw: pattern, host, path, isWildcard, isExact, specificity };
}

// ---------------------------------------------------------------------------
// Single-rule matcher
// ---------------------------------------------------------------------------

/**
 * Returns true if the given URL matches this rule's host pattern.
 * The URL's hostname is compared against the pattern (case-insensitive).
 */
export function ruleMatchesUrl(rule: OriginRule, url: string): boolean {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return false;
  }

  const urlHostname = parsedUrl.hostname.toLowerCase();
  const urlPath = parsedUrl.pathname;

  const pattern = parsePattern(rule.host.toLowerCase());

  // Global wildcard
  if (pattern.host === '*') {
    return pattern.path ? urlPath.startsWith(pattern.path) : true;
  }

  // Check hostname
  let hostnameMatches = false;
  if (pattern.isWildcard) {
    // *.youtube.com matches www.youtube.com, m.youtube.com, youtube.com
    const base = pattern.host.slice(2); // remove '*.'
    hostnameMatches =
      urlHostname === base ||
      urlHostname.endsWith('.' + base);
  } else {
    hostnameMatches = urlHostname === pattern.host;
  }

  if (!hostnameMatches) return false;

  // Check path if specified
  if (pattern.path) {
    return urlPath.startsWith(pattern.path);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Primary lookup
// ---------------------------------------------------------------------------

/**
 * Find the best matching rule for a URL from the rules array.
 * Returns the rule with the highest specificity score, or null if none match.
 */
export function matchRule(url: string, rules: OriginRule[]): OriginRule | null {
  let bestRule: OriginRule | null = null;
  let bestScore = -1;

  for (const rule of rules) {
    if (!ruleMatchesUrl(rule, url)) continue;
    const { specificity } = parsePattern(rule.host.toLowerCase());
    if (specificity > bestScore) {
      bestScore = specificity;
      bestRule = rule;
    }
  }

  return bestRule;
}

// ---------------------------------------------------------------------------
// Effective rule resolver
// ---------------------------------------------------------------------------

/**
 * Produce a fully-resolved EffectiveRule for a URL, merging the matched
 * per-origin rule with policy-specific defaults.
 */
export function getEffectiveRule(url: string, schema: StorageSchema): EffectiveRule {
  // Check fragile sites first (always native, user can override)
  const iFragile = isFragileSite(url, schema.fragileSites);

  const matched = matchRule(url, schema.rules);

  // If no explicit rule, use defaults
  const policy: Policy = matched?.policy ?? (iFragile ? 'native' : schema.defaultPolicy);

  const raw = matched;

  const spoofDefault = policy === 'in-window' || policy === 'windowed';
  const blockLockDefault = policy === 'block';

  return {
    policy,
    pip: raw?.pip ?? false,
    blockPointerLock: raw?.blockPointerLock ?? blockLockDefault,
    blockF11: raw?.blockF11 ?? blockLockDefault,
    hideCursorAfterIdleMs: raw?.hideCursorAfterIdleMs ?? 0,
    skipInitialLoad: raw?.skipInitialLoad ?? false,
    showGestureButton: raw?.showGestureButton ?? true,
    spoofFullscreenApi: raw?.spoofFullscreenApi ?? spoofDefault,
    disabledUntil: raw?.disabledUntil ?? 0,
    isExplicit: matched !== null,
    matchedHost: matched?.host ?? '',
  };
}

// ---------------------------------------------------------------------------
// Disabled check
// ---------------------------------------------------------------------------

/** True if the rule has a temporary disable ("session exception") in effect */
export function isRuleDisabled(rule: EffectiveRule): boolean {
  return rule.disabledUntil > 0 && rule.disabledUntil > Date.now();
}

/** Returns the effective policy, falling back to defaultPolicy if disabled */
export function getActivePolicy(
  rule: EffectiveRule,
  defaultPolicy: Policy,
): Policy {
  return isRuleDisabled(rule) ? defaultPolicy : rule.policy;
}

// ---------------------------------------------------------------------------
// Fragile site detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the URL matches the fragile-sites list.
 * Uses the same wildcard logic as ruleMatchesUrl.
 */
export function isFragileSite(url: string, fragileSites: string[]): boolean {
  const allSites = [...FRAGILE_SITES, ...fragileSites];
  return allSites.some(pattern =>
    ruleMatchesUrl({ host: pattern, policy: 'native' }, url)
  );
}

// ---------------------------------------------------------------------------
// URL normalizer (strips query/fragment, keeps origin+path)
// ---------------------------------------------------------------------------

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
