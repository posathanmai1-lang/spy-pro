import { F as FRAGILE_SITES } from "./storage-CToGBJDS.js";
function parsePattern(pattern) {
  const slashIdx = pattern.indexOf("/");
  const host = slashIdx === -1 ? pattern : pattern.slice(0, slashIdx);
  const path = slashIdx === -1 ? "" : pattern.slice(slashIdx);
  const isWildcard = host.startsWith("*.");
  const isExact = !isWildcard && host !== "*";
  let specificity = 0;
  if (host === "*") {
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
function ruleMatchesUrl(rule, url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return false;
  }
  const urlHostname = parsedUrl.hostname.toLowerCase();
  const urlPath = parsedUrl.pathname;
  const pattern = parsePattern(rule.host.toLowerCase());
  if (pattern.host === "*") {
    return pattern.path ? urlPath.startsWith(pattern.path) : true;
  }
  let hostnameMatches = false;
  if (pattern.isWildcard) {
    const base = pattern.host.slice(2);
    hostnameMatches = urlHostname === base || urlHostname.endsWith("." + base);
  } else {
    hostnameMatches = urlHostname === pattern.host;
  }
  if (!hostnameMatches) return false;
  if (pattern.path) {
    return urlPath.startsWith(pattern.path);
  }
  return true;
}
function matchRule(url, rules) {
  let bestRule = null;
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
function getEffectiveRule(url, schema) {
  const iFragile = isFragileSite(url, schema.fragileSites);
  const matched = matchRule(url, schema.rules);
  const policy = matched?.policy ?? (iFragile ? "native" : schema.defaultPolicy);
  const raw = matched;
  const spoofDefault = policy === "in-window" || policy === "windowed";
  const blockLockDefault = policy === "block";
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
    matchedHost: matched?.host ?? ""
  };
}
function isFragileSite(url, fragileSites) {
  const allSites = [...FRAGILE_SITES, ...fragileSites];
  return allSites.some(
    (pattern) => ruleMatchesUrl({ host: pattern }, url)
  );
}
function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
export {
  getEffectiveRule as g,
  hostnameFromUrl as h
};
//# sourceMappingURL=rules-C71vWFrN.js.map
