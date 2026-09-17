import { M as MSG_SOURCE } from "./messages-DZ8XntxE.js";
const spoof = {
  active: false,
  fakeElement: null,
  realScreenWidth: screen.width,
  realScreenHeight: screen.height
};
let currentMode = null;
let isoToken = null;
let patched = false;
let lastShiftKey = false;
let _origRequestFullscreen = null;
let _origExitFullscreen = null;
let _origRequestPointerLock = null;
const cooldownMap = /* @__PURE__ */ new Map();
const COOLDOWN_WINDOW_MS = 500;
const COOLDOWN_MAX_CALLS = 3;
const COOLDOWN_SUPPRESS_MS = 2e3;
function checkCooldown(origin) {
  const now = Date.now();
  let entry = cooldownMap.get(origin);
  if (!entry) {
    entry = { count: 1, firstTs: now, suppressedUntil: 0 };
    cooldownMap.set(origin, entry);
    return false;
  }
  if (entry.suppressedUntil > now) return true;
  if (now - entry.firstTs > COOLDOWN_WINDOW_MS) {
    entry.count = 1;
    entry.firstTs = now;
    entry.suppressedUntil = 0;
    return false;
  }
  entry.count++;
  if (entry.count >= COOLDOWN_MAX_CALLS) {
    entry.suppressedUntil = now + COOLDOWN_SUPPRESS_MS;
    postToIsolated({
      source: MSG_SOURCE,
      token: isoToken ?? "",
      type: "STATE",
      isFullscreen: false
    });
    return true;
  }
  return false;
}
window.addEventListener("message", (ev) => {
  if (ev.source !== window) return;
  if (!ev.data || typeof ev.data !== "object") return;
  const msg = ev.data;
  if (msg["source"] !== MSG_SOURCE) return;
  if (msg["type"] === "INIT_TOKEN" && typeof msg["token"] === "string") {
    isoToken = msg["token"];
    if (!patched) patchPrototypes();
    return;
  }
  if (!isoToken || msg["token"] !== isoToken) return;
  handleIsolatedMessage(ev.data);
}, false);
function handleIsolatedMessage(msg) {
  switch (msg.type) {
    case "SET_MODE":
      applyMode(msg.mode, msg.spoof);
      break;
    case "EXIT":
      exitMode();
      break;
    case "QUERY_STATE":
      postToIsolated({
        source: MSG_SOURCE,
        token: isoToken ?? "",
        type: "STATE",
        isFullscreen: spoof.active
      });
      break;
  }
}
document.addEventListener("keydown", (e) => {
  lastShiftKey = e.shiftKey;
}, { capture: true, passive: true });
document.addEventListener("mousedown", (e) => {
  lastShiftKey = e.shiftKey;
}, { capture: true, passive: true });
document.addEventListener("pointerdown", (e) => {
  lastShiftKey = e.shiftKey;
}, { capture: true, passive: true });
function patchPrototypes() {
  const existingFs = Element.prototype.requestFullscreen;
  if (existingFs["__fcControl"]) {
    console.warn("[FullscreenControl] requestFullscreen already patched by this extension — skipping re-patch.");
    patched = true;
    return;
  }
  if (existingFs["__otherExtension"]) {
    console.warn("[FullscreenControl] requestFullscreen appears patched by another extension. Layering on top. Conflicts possible.");
  }
  _origRequestFullscreen = Element.prototype.requestFullscreen.bind(document.documentElement);
  _origExitFullscreen = Document.prototype.exitFullscreen.bind(document);
  _origRequestPointerLock = Element.prototype.requestPointerLock;
  const patchedRequestFullscreen = function(options) {
    const origin = window.location.origin;
    if (checkCooldown(origin)) {
      return Promise.reject(
        new DOMException("Fullscreen request rate limited by extension.", "NotAllowedError")
      );
    }
    if (currentMode === "native" || currentMode === "passthrough") {
      return _origRequestFullscreen?.call(this, options) ?? Promise.reject(new Error("No original requestFullscreen"));
    }
    if (currentMode === "block") {
      postToIsolated({
        source: MSG_SOURCE,
        token: isoToken ?? "",
        type: "FULLSCREEN_REQUESTED",
        tag: this.tagName,
        hasVideo: hasVideoElement(this),
        shiftKey: lastShiftKey,
        rect: getBoundingRect(this),
        isIframe: window !== window.top
      });
      return Promise.reject(
        new DOMException("Fullscreen denied by extension policy.", "NotAllowedError")
      );
    }
    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).slice(2);
      const respondHandler = (ev) => {
        if (ev.source !== window) return;
        if (!ev.data || typeof ev.data !== "object") return;
        const msg = ev.data;
        if (msg["source"] !== MSG_SOURCE || msg["token"] !== isoToken) return;
        if (msg["requestId"] !== requestId) return;
        window.removeEventListener("message", respondHandler);
        const type = msg["type"];
        if (type === "RESOLVE") {
          resolve();
        } else if (type === "REJECT") {
          reject(new DOMException(
            typeof msg["reason"] === "string" ? msg["reason"] : "NotAllowedError",
            "NotAllowedError"
          ));
        } else if (type === "NATIVE") {
          const nativePromise = _origRequestFullscreen?.call(this, options);
          if (nativePromise) {
            nativePromise.then(resolve).catch((e) => reject(e));
          } else {
            resolve();
          }
        }
      };
      window.addEventListener("message", respondHandler);
      postToIsolated({
        source: MSG_SOURCE,
        token: isoToken ?? "",
        type: "FULLSCREEN_REQUESTED",
        tag: this.tagName,
        hasVideo: hasVideoElement(this),
        shiftKey: lastShiftKey,
        rect: getBoundingRect(this),
        isIframe: window !== window.top,
        // Extra field for promise resolution
        ...{ requestId }
      });
    });
  };
  patchedRequestFullscreen["__fcControl"] = true;
  Element.prototype.requestFullscreen = patchedRequestFullscreen;
  const vendorAliases = [
    "webkitRequestFullscreen",
    "webkitRequestFullScreen",
    "mozRequestFullScreen",
    "msRequestFullscreen"
  ];
  for (const alias of vendorAliases) {
    if (alias in Element.prototype) {
      Element.prototype[alias] = patchedRequestFullscreen;
    }
  }
  const patchedExitFullscreen = function() {
    if (spoof.active) {
      exitMode();
      return Promise.resolve();
    }
    return _origExitFullscreen?.call(this) ?? Promise.resolve();
  };
  patchedExitFullscreen["__fcControl"] = true;
  Document.prototype.exitFullscreen = patchedExitFullscreen;
  const exitAliases = [
    "webkitExitFullscreen",
    "mozCancelFullScreen",
    "msExitFullscreen"
  ];
  for (const alias of exitAliases) {
    if (alias in Document.prototype) {
      Document.prototype[alias] = patchedExitFullscreen;
    }
  }
  const patchedRequestPointerLock = function(options) {
    if (currentBlockPointerLock) {
      postToIsolated({
        source: MSG_SOURCE,
        token: isoToken ?? "",
        type: "POINTER_LOCK_REQUESTED"
      });
      return Promise.resolve();
    }
    return Promise.resolve(_origRequestPointerLock?.call(this, options));
  };
  patchedRequestPointerLock["__fcControl"] = true;
  Element.prototype.requestPointerLock = patchedRequestPointerLock;
  patchKeyboardLock();
  patchFullscreenGetters();
  patchScreenDimensions();
  patched = true;
}
let currentBlockPointerLock = false;
function patchFullscreenGetters() {
  const proto = Document.prototype;
  const defineGetter = (obj, prop, getter) => {
    try {
      Object.defineProperty(obj, prop, {
        get: getter,
        configurable: true,
        enumerable: true
      });
    } catch {
    }
  };
  defineGetter(
    proto,
    "fullscreenElement",
    () => spoof.active ? spoof.fakeElement : null
  );
  defineGetter(
    proto,
    "webkitFullscreenElement",
    () => spoof.active ? spoof.fakeElement : null
  );
  defineGetter(
    proto,
    "mozFullScreenElement",
    () => spoof.active ? spoof.fakeElement : null
  );
  defineGetter(
    proto,
    "msFullscreenElement",
    () => spoof.active ? spoof.fakeElement : null
  );
  defineGetter(proto, "fullscreen", () => spoof.active);
  defineGetter(proto, "webkitIsFullScreen", () => spoof.active);
  defineGetter(proto, "mozFullScreen", () => spoof.active);
  defineGetter(proto, "fullscreenEnabled", () => true);
  defineGetter(proto, "webkitFullscreenEnabled", () => true);
}
function patchScreenDimensions() {
  const defineGetter = (obj, prop, getter) => {
    try {
      Object.defineProperty(obj, prop, {
        get: getter,
        configurable: true,
        enumerable: true
      });
    } catch {
    }
  };
  defineGetter(
    Screen.prototype,
    "width",
    () => spoof.active ? window.innerWidth : spoof.realScreenWidth
  );
  defineGetter(
    Screen.prototype,
    "height",
    () => spoof.active ? window.innerHeight : spoof.realScreenHeight
  );
}
function patchKeyboardLock() {
  const nav = navigator;
  if (!nav.keyboard) return;
  const origLock = nav.keyboard.lock.bind(nav.keyboard);
  nav.keyboard.lock = function(keyCodes) {
    if (currentMode === "block") {
      return Promise.reject(new DOMException("Keyboard lock denied by extension policy.", "NotAllowedError"));
    }
    return origLock(keyCodes);
  };
}
function applyMode(mode, shouldSpoof) {
  currentMode = mode;
  if (mode === "block") {
    currentBlockPointerLock = true;
    dispatchFullscreenChange(null);
    return;
  }
  if (mode === "in-window" || mode === "windowed") {
    if (shouldSpoof) {
      activateSpoof(document.documentElement);
    }
    return;
  }
  if (mode === "native" || mode === "passthrough") {
    currentBlockPointerLock = false;
    return;
  }
}
function activateSpoof(element) {
  spoof.active = true;
  spoof.fakeElement = element;
  dispatchFullscreenChange(element);
}
function exitMode() {
  const wasActive = spoof.active;
  spoof.active = false;
  spoof.fakeElement = null;
  currentMode = null;
  currentBlockPointerLock = false;
  if (wasActive) {
    dispatchFullscreenChange(null);
  }
  postToIsolated({
    source: MSG_SOURCE,
    token: isoToken ?? "",
    type: "EXITED"
  });
}
function dispatchFullscreenChange(target) {
  const event = new Event("fullscreenchange", { bubbles: true, cancelable: false });
  const webkitEvent = new Event("webkitfullscreenchange", { bubbles: true, cancelable: false });
  const mozEvent = new Event("mozfullscreenchange", { bubbles: true, cancelable: false });
  const dispatchTarget = target ?? document;
  dispatchTarget.dispatchEvent(event);
  dispatchTarget.dispatchEvent(webkitEvent);
  dispatchTarget.dispatchEvent(mozEvent);
  document.dispatchEvent(new Event("fullscreenchange", { bubbles: false }));
  window.dispatchEvent(new Event("resize"));
}
function hasVideoElement(el) {
  if (el.tagName === "VIDEO") return true;
  return el.querySelector("video") !== null;
}
function getBoundingRect(el) {
  try {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  } catch {
    return { top: 0, left: 0, width: 0, height: 0 };
  }
}
function postToIsolated(msg) {
  window.postMessage(msg, "*");
}
//# sourceMappingURL=main-world.ts-urtHrEJ5.js.map
