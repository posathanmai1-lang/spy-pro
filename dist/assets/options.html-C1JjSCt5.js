import "./modulepreload-polyfill-DaKOjhqt.js";
import { l as loadSchema, D as DEFAULT_STORAGE, f as saveSchemaImmediate, F as FRAGILE_SITES, a as loadStats, S as SCHEMA_VERSION } from "./storage-CToGBJDS.js";
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);
let schema = { ...DEFAULT_STORAGE };
let editingHost = null;
let filterQuery = "";
async function init() {
  schema = await loadSchema();
  $("ext-version").textContent = chrome.runtime.getManifest().version;
  setupNavigation();
  renderRules();
  renderDefaults();
  renderFragileSites();
  await renderStats();
  wireModal();
  wireImportExport();
  wireFragileInput();
}
function setupNavigation() {
  $$(".sidebar-nav li[data-section]").forEach((li) => {
    const link = li.querySelector("a");
    link?.addEventListener("click", (e) => {
      e.preventDefault();
      const section = li.getAttribute("data-section") ?? "";
      navigateTo(section);
    });
  });
  navigateTo("rules");
}
function navigateTo(section) {
  $$(".sidebar-nav li[data-section]").forEach((li) => {
    li.classList.toggle("active", li.getAttribute("data-section") === section);
  });
  $$(".main section[data-page]").forEach((sec) => {
    sec.classList.toggle("hidden", sec.getAttribute("data-page") !== section);
  });
}
function renderRules() {
  const tbody = $("rules-tbody");
  const empty = $("rules-empty");
  const searchVal = filterQuery.toLowerCase();
  const filtered = schema.rules.filter(
    (r) => !searchVal || r.host.toLowerCase().includes(searchVal) || r.policy.includes(searchVal)
  );
  tbody.innerHTML = "";
  empty.classList.toggle("hidden", filtered.length > 0);
  $("rules-table").classList.toggle("hidden", filtered.length === 0);
  for (const rule of filtered) {
    tbody.appendChild(buildRuleRow(rule));
  }
  $("btn-add-rule").onclick = () => openModal(null);
  $("btn-add-current").onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const hostname = tab?.url ? new URL(tab.url).hostname : "";
    if (hostname) openModal(null, hostname);
  };
  $("rules-search").oninput = (e) => {
    filterQuery = e.target.value;
    renderRules();
  };
}
function buildRuleRow(rule) {
  const tr = document.createElement("tr");
  const flags = [];
  if (rule.pip) flags.push("PiP");
  if (rule.blockPointerLock) flags.push("🔒PtrLk");
  if (rule.blockF11) flags.push("F11");
  if (rule.spoofFullscreenApi) flags.push("Spoof");
  if (rule.skipInitialLoad) flags.push("SkipInit");
  const disabledStr = rule.disabledUntil && rule.disabledUntil > Date.now() ? `⏸ until ${new Date(rule.disabledUntil).toLocaleTimeString()}` : "";
  tr.innerHTML = `
    <td class="host-cell">${escapeHtml(rule.host)}${disabledStr ? `<br/><small style="color:var(--c-block)">${disabledStr}</small>` : ""}</td>
    <td><span class="policy-chip" data-policy="${rule.policy}">${POLICY_ICONS[rule.policy]} ${rule.policy}</span></td>
    <td><small style="color:var(--text-muted)">${flags.join(", ") || "—"}</small></td>
    <td>
      <div class="row-actions">
        <button class="icon-btn" data-action="edit" data-host="${escapeHtml(rule.host)}" title="Edit rule" aria-label="Edit rule for ${escapeHtml(rule.host)}">✏</button>
        <button class="icon-btn delete" data-action="delete" data-host="${escapeHtml(rule.host)}" title="Delete rule" aria-label="Delete rule for ${escapeHtml(rule.host)}">🗑</button>
      </div>
    </td>
  `;
  tr.querySelector('[data-action="edit"]')?.addEventListener("click", () => {
    openModal(rule.host);
  });
  tr.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
    if (!confirm(`Delete rule for "${rule.host}"?`)) return;
    schema.rules = schema.rules.filter((r) => r.host !== rule.host);
    await saveSchemaImmediate(schema);
    renderRules();
  });
  return tr;
}
const POLICY_ICONS = {
  ask: "❓",
  "in-window": "⬛",
  windowed: "🪟",
  native: "⛶",
  block: "🚫",
  sticky: "📌"
};
function wireModal() {
  $("modal-cancel").onclick = () => closeModal();
  $("modal-save").onclick = () => void saveModal();
  $("rule-modal").addEventListener("click", (e) => {
    if (e.target === $("rule-modal")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}
function openModal(host, prefill) {
  editingHost = host;
  const modal = $("rule-modal");
  modal.classList.remove("hidden");
  const rule = host ? schema.rules.find((r) => r.host === host) : null;
  $("modal-title").textContent = host ? `Edit rule: ${host}` : "Add rule";
  $("modal-host").value = prefill ?? host ?? "";
  $("modal-policy").value = rule?.policy ?? "ask";
  $("modal-pip").checked = rule?.pip ?? false;
  $("modal-pointer-lock").checked = rule?.blockPointerLock ?? false;
  $("modal-f11").checked = rule?.blockF11 ?? false;
  $("modal-spoof").checked = rule?.spoofFullscreenApi ?? false;
  $("modal-skip-initial").checked = rule?.skipInitialLoad ?? false;
  setTimeout(() => $("modal-host").focus(), 50);
}
function closeModal() {
  $("rule-modal").classList.add("hidden");
  editingHost = null;
}
async function saveModal() {
  const host = $("modal-host").value.trim();
  if (!host) {
    alert("Host pattern is required.");
    return;
  }
  const policy = $("modal-policy").value;
  const pip = $("modal-pip").checked;
  const blockPointerLock = $("modal-pointer-lock").checked;
  const blockF11 = $("modal-f11").checked;
  const spoofFullscreenApi = $("modal-spoof").checked;
  const skipInitialLoad = $("modal-skip-initial").checked;
  const newRule = {
    host,
    policy,
    pip,
    blockPointerLock,
    blockF11,
    spoofFullscreenApi,
    skipInitialLoad
  };
  if (editingHost) {
    const idx = schema.rules.findIndex((r) => r.host === editingHost);
    if (idx >= 0) {
      schema.rules[idx] = newRule;
    } else {
      schema.rules.push(newRule);
    }
  } else {
    const existing = schema.rules.findIndex((r) => r.host === host);
    if (existing >= 0) {
      if (!confirm(`A rule for "${host}" already exists. Replace it?`)) return;
      schema.rules[existing] = newRule;
    } else {
      schema.rules.push(newRule);
    }
  }
  await saveSchemaImmediate(schema);
  closeModal();
  renderRules();
}
function wireImportExport() {
  $("btn-export").onclick = () => {
    const data = JSON.stringify(
      { ...schema, $schema: "https://fullscreen-control.local/schema/v1.json" },
      null,
      2
    );
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fullscreen-control-rules.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  $("btn-import").onclick = () => {
    $("import-input").click();
  };
  $("import-input").onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validated = validateImport(parsed);
      if (!confirm(`Import ${validated.rules.length} rules? This will replace your current rules.`)) return;
      schema.rules = validated.rules;
      if (validated.defaultPolicy) schema.defaultPolicy = validated.defaultPolicy;
      if (validated.fragileSites) schema.fragileSites = validated.fragileSites;
      await saveSchemaImmediate(schema);
      renderRules();
      renderDefaults();
      renderFragileSites();
      alert("Import successful!");
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    e.target.value = "";
  };
}
function validateImport(data) {
  if (typeof data !== "object" || data === null) throw new Error("Invalid JSON structure");
  const d = data;
  if (!Array.isArray(d["rules"])) throw new Error('Missing "rules" array');
  const validPolicies = /* @__PURE__ */ new Set(["ask", "in-window", "windowed", "native", "block", "sticky"]);
  const rules = d["rules"].map((r, i) => {
    if (typeof r !== "object" || r === null) throw new Error(`Rule ${i}: not an object`);
    const rule = r;
    if (typeof rule["host"] !== "string") throw new Error(`Rule ${i}: missing host string`);
    if (!validPolicies.has(rule["policy"])) throw new Error(`Rule ${i}: invalid policy "${String(rule["policy"])}"`);
    const item = {
      host: rule["host"],
      policy: rule["policy"],
      pip: Boolean(rule["pip"])
    };
    if (typeof rule["blockPointerLock"] === "boolean") item.blockPointerLock = rule["blockPointerLock"];
    if (typeof rule["blockF11"] === "boolean") item.blockF11 = rule["blockF11"];
    if (typeof rule["spoofFullscreenApi"] === "boolean") item.spoofFullscreenApi = rule["spoofFullscreenApi"];
    if (typeof rule["skipInitialLoad"] === "boolean") item.skipInitialLoad = rule["skipInitialLoad"];
    return item;
  });
  const res = {
    rules,
    version: SCHEMA_VERSION
  };
  if (validPolicies.has(d["defaultPolicy"])) {
    res.defaultPolicy = d["defaultPolicy"];
  }
  if (Array.isArray(d["fragileSites"])) {
    res.fragileSites = d["fragileSites"].filter((s) => typeof s === "string");
  }
  return res;
}
function renderDefaults() {
  $("default-policy-select").value = schema.defaultPolicy;
  $("toggle-debug").checked = schema.debugLog;
  $("default-policy-select").onchange = async (e) => {
    schema.defaultPolicy = e.target.value;
    await saveSchemaImmediate(schema);
  };
  $("toggle-debug").onchange = async (e) => {
    schema.debugLog = e.target.checked;
    await saveSchemaImmediate(schema);
  };
}
function renderFragileSites() {
  const container = $("fragile-list");
  container.innerHTML = "";
  const allSites = [
    ...FRAGILE_SITES.map((s) => ({ site: s, isBuiltIn: true })),
    ...schema.fragileSites.filter((s) => !FRAGILE_SITES.includes(s)).map((s) => ({ site: s, isBuiltIn: false }))
  ];
  for (const { site, isBuiltIn } of allSites) {
    const tag = document.createElement("span");
    tag.className = "fragile-tag";
    tag.innerHTML = `
      <span>${escapeHtml(site)}</span>
      ${isBuiltIn ? '<small style="opacity:.4">(built-in)</small>' : ""}
      ${!isBuiltIn ? `<button aria-label="Remove ${escapeHtml(site)}" data-site="${escapeHtml(site)}">×</button>` : ""}
    `;
    if (!isBuiltIn) {
      tag.querySelector("button")?.addEventListener("click", async () => {
        schema.fragileSites = schema.fragileSites.filter((s) => s !== site);
        await saveSchemaImmediate(schema);
        renderFragileSites();
      });
    }
    container.appendChild(tag);
  }
}
function wireFragileInput() {
  $("btn-add-fragile").onclick = async () => {
    const input = $("fragile-input");
    const val = input.value.trim();
    if (!val) return;
    if (!schema.fragileSites.includes(val) && !FRAGILE_SITES.includes(val)) {
      schema.fragileSites.push(val);
      await saveSchemaImmediate(schema);
      renderFragileSites();
    }
    input.value = "";
  };
  $("fragile-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("btn-add-fragile").click();
  });
}
async function renderStats() {
  const stats = await loadStats();
  const grid = $("stats-grid");
  grid.innerHTML = "";
  const items = [
    { key: "blockedAttempts", label: "Blocked", color: "var(--c-block)" },
    { key: "redirectedToInWindow", label: "In-window", color: "var(--c-in-window)" },
    { key: "redirectedToWindowed", label: "Windowed", color: "var(--c-windowed)" },
    { key: "stickyEngagements", label: "Sticky", color: "var(--c-sticky)" },
    { key: "pipActivations", label: "PiP", color: "var(--c-native)" }
  ];
  for (const { key, label, color } of items) {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `
      <div class="stat-card-value" style="color:${color}">${stats[key]}</div>
      <div class="stat-card-label">${label}</div>
    `;
    grid.appendChild(card);
  }
  $("btn-reset-stats").onclick = async () => {
    if (!confirm("Reset all statistics?")) return;
    await chrome.storage.local.set({
      stats: {
        blockedAttempts: 0,
        redirectedToInWindow: 0,
        redirectedToWindowed: 0,
        stickyEngagements: 0,
        pipActivations: 0
      }
    });
    await renderStats();
  };
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
void init();
//# sourceMappingURL=options.html-C1JjSCt5.js.map
