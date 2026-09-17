/**
 * Unit tests for the rules matching engine.
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import {
  matchRule,
  ruleMatchesUrl,
  getEffectiveRule,
  isRuleDisabled,
  hostnameFromUrl,
} from './rules.js';
import type { OriginRule, StorageSchema } from './types.js';
import { SCHEMA_VERSION } from './types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function rule(host: string, policy: OriginRule['policy'] = 'block'): OriginRule {
  return { host, policy };
}

function schema(rules: OriginRule[], defaultPolicy: OriginRule['policy'] = 'ask'): StorageSchema {
  return {
    version: SCHEMA_VERSION,
    defaultPolicy,
    rules,
    fragileSites: [],
    debugLog: false,
  };
}

// ---------------------------------------------------------------------------
// ruleMatchesUrl
// ---------------------------------------------------------------------------

describe('ruleMatchesUrl', () => {
  it('matches exact hostname', () => {
    expect(ruleMatchesUrl(rule('youtube.com'), 'https://youtube.com/watch')).toBe(true);
  });

  it('does not match different hostname', () => {
    expect(ruleMatchesUrl(rule('youtube.com'), 'https://vimeo.com/watch')).toBe(false);
  });

  it('matches www subdomain explicitly', () => {
    expect(ruleMatchesUrl(rule('www.youtube.com'), 'https://www.youtube.com/')).toBe(true);
    expect(ruleMatchesUrl(rule('www.youtube.com'), 'https://youtube.com/')).toBe(false);
  });

  it('wildcard *.youtube.com matches www subdomain', () => {
    expect(ruleMatchesUrl(rule('*.youtube.com'), 'https://www.youtube.com/')).toBe(true);
  });

  it('wildcard *.youtube.com matches bare youtube.com', () => {
    expect(ruleMatchesUrl(rule('*.youtube.com'), 'https://youtube.com/')).toBe(true);
  });

  it('wildcard *.youtube.com matches m.youtube.com', () => {
    expect(ruleMatchesUrl(rule('*.youtube.com'), 'https://m.youtube.com/')).toBe(true);
  });

  it('wildcard does not match different domain', () => {
    expect(ruleMatchesUrl(rule('*.youtube.com'), 'https://notyoutube.com/')).toBe(false);
  });

  it('path prefix match', () => {
    const r = rule('youtube.com/embed');
    expect(ruleMatchesUrl(r, 'https://youtube.com/embed/abc')).toBe(true);
    expect(ruleMatchesUrl(r, 'https://youtube.com/watch')).toBe(false);
  });

  it('global wildcard * matches anything', () => {
    expect(ruleMatchesUrl(rule('*'), 'https://anything.com/foo')).toBe(true);
  });

  it('case-insensitive hostname matching', () => {
    expect(ruleMatchesUrl(rule('YouTube.COM'), 'https://youtube.com/')).toBe(true);
  });

  it('returns false for invalid URL', () => {
    expect(ruleMatchesUrl(rule('youtube.com'), 'not-a-url')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// matchRule — specificity / precedence
// ---------------------------------------------------------------------------

describe('matchRule', () => {
  it('returns null when no rules match', () => {
    expect(matchRule('https://example.com/', [rule('youtube.com')])).toBeNull();
  });

  it('exact hostname beats wildcard subdomain', () => {
    const rules = [
      rule('*.youtube.com', 'in-window'),
      rule('www.youtube.com', 'block'),
    ];
    const result = matchRule('https://www.youtube.com/', rules);
    expect(result?.policy).toBe('block');
  });

  it('longer exact match beats shorter exact match', () => {
    // This scenario: path-specific rule beats bare hostname rule
    const rules = [
      rule('youtube.com', 'in-window'),
      rule('youtube.com/embed', 'block'),
    ];
    const result = matchRule('https://youtube.com/embed/xyz', rules);
    expect(result?.policy).toBe('block');
  });

  it('wildcard with path beats plain wildcard', () => {
    const rules = [
      rule('*.youtube.com', 'native'),
      rule('*.youtube.com/embed', 'block'),
    ];
    const result = matchRule('https://www.youtube.com/embed/xyz', rules);
    expect(result?.policy).toBe('block');
  });

  it('returns only match when one rule', () => {
    expect(matchRule('https://youtube.com/', [rule('youtube.com', 'sticky')])?.policy)
      .toBe('sticky');
  });

  it('handles empty rules array', () => {
    expect(matchRule('https://youtube.com/', [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getEffectiveRule — defaults
// ---------------------------------------------------------------------------

describe('getEffectiveRule', () => {
  it('returns defaultPolicy when no rules match', () => {
    const result = getEffectiveRule('https://example.com/', schema([], 'native'));
    expect(result.policy).toBe('native');
    expect(result.isExplicit).toBe(false);
  });

  it('returns matched rule policy', () => {
    const result = getEffectiveRule(
      'https://youtube.com/',
      schema([rule('youtube.com', 'block')])
    );
    expect(result.policy).toBe('block');
    expect(result.isExplicit).toBe(true);
    expect(result.matchedHost).toBe('youtube.com');
  });

  it('sets blockPointerLock=true by default for block policy', () => {
    const result = getEffectiveRule(
      'https://youtube.com/',
      schema([rule('youtube.com', 'block')])
    );
    expect(result.blockPointerLock).toBe(true);
    expect(result.blockF11).toBe(true);
  });

  it('sets blockPointerLock=false by default for non-block policies', () => {
    const result = getEffectiveRule(
      'https://youtube.com/',
      schema([rule('youtube.com', 'in-window')])
    );
    expect(result.blockPointerLock).toBe(false);
    expect(result.blockF11).toBe(false);
  });

  it('sets spoofFullscreenApi=true for in-window policy', () => {
    const result = getEffectiveRule(
      'https://youtube.com/',
      schema([rule('youtube.com', 'in-window')])
    );
    expect(result.spoofFullscreenApi).toBe(true);
  });

  it('sets spoofFullscreenApi=false for block policy', () => {
    const result = getEffectiveRule(
      'https://youtube.com/',
      schema([rule('youtube.com', 'block')])
    );
    expect(result.spoofFullscreenApi).toBe(false);
  });

  it('prefers fragile sites to defaultPolicy', () => {
    const s = schema([], 'block');
    s.fragileSites = []; // FRAGILE_SITES already includes *.github.dev
    const result = getEffectiveRule('https://vscode.dev/editor', s);
    // vscode.dev is in the built-in fragile list
    expect(result.policy).toBe('native');
  });

  it('explicit rule overrides fragile site default', () => {
    const s = schema([rule('vscode.dev', 'block')], 'ask');
    const result = getEffectiveRule('https://vscode.dev/editor', s);
    // User explicitly set block; that wins
    expect(result.policy).toBe('block');
  });
});

// ---------------------------------------------------------------------------
// isRuleDisabled
// ---------------------------------------------------------------------------

describe('isRuleDisabled', () => {
  const baseRule = {
    policy: 'block' as const,
    pip: false,
    blockPointerLock: true,
    blockF11: true,
    hideCursorAfterIdleMs: 0,
    skipInitialLoad: false,
    showGestureButton: true,
    spoofFullscreenApi: false,
    isExplicit: true,
    matchedHost: 'example.com',
  };

  it('not disabled when disabledUntil is 0', () => {
    expect(isRuleDisabled({ ...baseRule, disabledUntil: 0 })).toBe(false);
  });

  it('disabled when disabledUntil is in the future', () => {
    expect(isRuleDisabled({ ...baseRule, disabledUntil: Date.now() + 100_000 })).toBe(true);
  });

  it('not disabled when disabledUntil is in the past', () => {
    expect(isRuleDisabled({ ...baseRule, disabledUntil: Date.now() - 1000 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

describe('hostnameFromUrl', () => {
  it('extracts hostname', () => {
    expect(hostnameFromUrl('https://www.youtube.com/watch?v=abc')).toBe('www.youtube.com');
  });

  it('returns empty string for invalid URL', () => {
    expect(hostnameFromUrl('not-a-url')).toBe('');
  });
});
