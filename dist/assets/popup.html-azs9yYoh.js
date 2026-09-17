import "./modulepreload-polyfill-DaKOjhqt.js";
import { l as loadSchema, a as loadStats, e as saveSchema } from "./storage-CToGBJDS.js";
import { h as hostnameFromUrl, g as getEffectiveRule } from "./rules-C71vWFrN.js";
const $ = (id) => document.getElementById(id);
const headerHost = $("header-host");
const policyDot = $("policy-dot");
const currentPolicyLabel = $("current-policy-label");
const policySublabel = $("policy-sublabel");
const disabledBadge = $("disabled-badge");
const statBlocked = $("stat-blocked");
const statInWindow = $("stat-inwindow");
const statSticky = $("stat-sticky");
const togglePip = $("toggle-pip");
const togglePointerLock = $("toggle-pointer-lock");
const toggleF11 = $("toggle-f11");
const POLICY_META = {
  ask: { label: "Ask every time", color: "var(--c-ask)" },
  "in-window": { label: "In-window", color: "var(--c-in-window)" },
  windowed: { label: "Windowed popup", color: "var(--c-windowed)" },
  native: { label: "Native fullscreen", color: "var(--c-native)" },
  block: { label: "Block fullscreen", color: "var(--c-block)" },
  sticky: { label: "Sticky fullscreen", color: "var(--c-sticky)" }
};
let schema;
let currentHostname = "";
let currentUrl = "";
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    headerHost.textContent = "No active tab";
    return;
  }
  currentUrl = tab.url;
  currentHostname = hostnameFromUrl(currentUrl);
  headerHost.textContent = currentHostname || tab.url;
  headerHost.title = currentUrl;
  [schema] = await Promise.all([loadSchema(), renderStats()]);
  renderPolicy();
  wireButtons();
}
function renderPolicy() {
  const rule = getEffectiveRule(currentUrl, schema);
  const isDisabled = rule.disabledUntil > 0 && rule.disabledUntil > Date.now();
  const displayPolicy = isDisabled ? schema.defaultPolicy : rule.policy;
  const meta = POLICY_META[displayPolicy];
  policyDot.style.background = meta.color;
  currentPolicyLabel.textContent = meta.label;
  policySublabel.textContent = rule.isExplicit ? `Rule: ${rule.matchedHost}` : "Global default";
  disabledBadge.classList.toggle("hidden", !isDisabled);
  document.querySelectorAll(".policy-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-policy") === displayPolicy);
  });
  togglePip.checked = rule.pip;
  togglePointerLock.checked = rule.blockPointerLock;
  toggleF11.checked = rule.blockF11;
}
async function renderStats() {
  const stats = await loadStats();
  statBlocked.textContent = formatCount(stats.blockedAttempts);
  statInWindow.textContent = formatCount(stats.redirectedToInWindow);
  statSticky.textContent = formatCount(stats.stickyEngagements);
}
function formatCount(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}
function wireButtons() {
  document.querySelectorAll(".policy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const policy = btn.getAttribute("data-policy");
      await setPolicy(policy);
    });
  });
  togglePip.addEventListener("change", async () => {
    await updateFlag("pip", togglePip.checked);
  });
  togglePointerLock.addEventListener("change", async () => {
    await updateFlag("blockPointerLock", togglePointerLock.checked);
  });
  toggleF11.addEventListener("change", async () => {
    await updateFlag("blockF11", toggleF11.checked);
  });
  $("btn-disable-hour").addEventListener("click", async () => {
    if (!currentHostname) return;
    await chrome.runtime.sendMessage({
      type: "DISABLE_FOR_HOUR",
      host: currentHostname
    });
    schema = await loadSchema();
    renderPolicy();
  });
  $("open-options").addEventListener("click", openOptions);
  $("btn-open-options").addEventListener("click", openOptions);
}
async function setPolicy(policy) {
  if (!currentHostname) return;
  await chrome.runtime.sendMessage({
    type: "SET_RULE",
    host: currentHostname,
    policy
  });
  schema = await loadSchema();
  renderPolicy();
}
async function updateFlag(flag, value) {
  if (!currentHostname) return;
  const existingIdx = schema.rules.findIndex((r) => r.host === currentHostname);
  if (existingIdx >= 0) {
    schema.rules[existingIdx][flag] = value;
  } else {
    const rule = getEffectiveRule(currentUrl, schema);
    schema.rules.push({
      host: currentHostname,
      policy: rule.policy,
      [flag]: value
    });
  }
  saveSchema(schema);
  renderPolicy();
}
function openOptions() {
  void chrome.tabs.create({ url: chrome.runtime.getURL("src/ui/options.html") });
  window.close();
}
void init();
//# sourceMappingURL=popup.html-azs9yYoh.js.map
