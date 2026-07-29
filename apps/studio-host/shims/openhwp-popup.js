// deno-lint-ignore-file no-window -- browser script, not a Deno module: `window` is the target.
// OpenHWP — window.open() shim for the deno-desktop (CEF) host.
//
// The CEF backend never creates popup windows: window.open() returns null
// unconditionally, with *and* without a user gesture (verified against
// deno 2.9.3's CEF backend). Nothing in `Deno.BrowserWindow` exposes a
// popup/new-window hook either, so the host cannot opt in.
//
// The studio's 파일 → 인쇄 (`file:print`) opens a popup and builds the rendered
// pages into it, so in the desktop app it only ever reached its
// "팝업이 차단되었습니다" fallback — printing was impossible. Printing itself
// works fine here (the system print dialog opens as usual); the only missing
// piece is something for window.open() to return.
//
// So return a same-origin iframe overlaid on the window. It provides everything
// the caller uses — a document to build into, print() to print just that
// document, close() to dismiss — and upstream's print stylesheet is already
// written for this: `@media screen` styles it as a centred preview with a fixed
// toolbar, and `@media print` hides the toolbar.
//
// Blank *and* same-origin URL popups are handled. The pinned studio (v0.7.19)
// opens a blank popup and builds into it; v0.8.x instead opens `print.html` —
// a real same-origin URL — so a blank-only shim would let a future upstream
// bump silently restore the original bug.
//
// This is additive, not an upstream source override: the studio is still built
// unmodified, and `config/rhwp-studio-overrides.json` stays empty.
(function () {
  "use strict";

  const nativeOpen = window.open;

  // Blank, or same-origin: both are ours to host. A cross-origin popup is left
  // to the host, so this never silently changes where an external link goes —
  // it still returns null there, which callers already have to handle.
  function resolveShimmable(url) {
    if (url === undefined || url === null || url === "") return "";
    const href = String(url);
    if (href === "about:blank") return "";
    try {
      const resolved = new URL(href, document.baseURI);
      // Protocol as well as origin: an opaque origin serializes to the string
      // "null", so under one (a file:// page, a sandboxed frame) a javascript:
      // or data: URL compares equal to the page's own origin and would be
      // loaded into the frame. The studio is always served over http from the
      // host, so this is a guard on a context we don't ship, not a live hole.
      return resolved.origin === location.origin &&
          resolved.protocol === location.protocol
        ? resolved.href
        : null;
    } catch {
      // Not a resolvable URL — leave it to the host rather than guessing.
      return null;
    }
  }

  // The caller gets a façade rather than the iframe's own window, because both
  // of the obvious shortcuts break once the frame navigates: an own `close`
  // property set on the window is discarded with that window, and a `load`
  // listener registered on it never fires, since the document that finishes
  // loading belongs to the *next* window. Reads forward to whichever window the
  // frame currently holds; `load` is served by the frame element, which does
  // survive navigation.
  function facade(frame, state) {
    return new Proxy({}, {
      get(_target, prop, receiver) {
        if (prop === "close") return state.dismiss;
        if (prop === "closed") return state.closed;
        // Same reason `load` is served by the frame element below: an onload
        // handler parked on the current window is discarded when the frame
        // navigates, so it would never fire for a URL popup.
        if (prop === "onload") return frame.onload;
        // On a real window these three are self-references. Forwarding them
        // would hand out the frame's raw window and route around everything
        // above it — `popup.self.close()` would reach the iframe's own close(),
        // a no-op, and strand the overlay.
        if (prop === "window" || prop === "self" || prop === "frames") {
          return receiver;
        }
        const win = frame.contentWindow;
        if (!win) return undefined;
        if (prop === "addEventListener" || prop === "removeEventListener") {
          return function (type, listener, options) {
            const target = type === "load" ? frame : win;
            return target[prop](type, listener, options);
          };
        }
        const value = win[prop];
        // Window methods throw if called with the façade as `this`.
        return typeof value === "function" ? value.bind(win) : value;
      },
      set(_target, prop, value) {
        if (prop === "onload") {
          frame.onload = value;
          return true;
        }
        const win = frame.contentWindow;
        if (win) win[prop] = value;
        return true;
      },
      has(_target, prop) {
        const win = frame.contentWindow;
        return win ? prop in win : false;
      },
    });
  }

  function createPopupIframe(href) {
    const frame = document.createElement("iframe");
    frame.className = "openhwp-popup";
    frame.setAttribute("title", "OpenHWP");
    frame.style.cssText = [
      "position:fixed",
      "inset:0",
      "width:100%",
      "height:100%",
      "border:0",
      "margin:0",
      "background:#fff",
      "z-index:2147483647",
    ].join(";");
    if (href) frame.src = href;
    return frame;
  }

  // `_self`/`_parent`/`_top` navigate an existing window rather than opening
  // one, so they are not what CEF blocks and must reach the real window.open.
  // Anything else — no target, `_blank`, or a name — is a popup request, and a
  // named one is still better served by the overlay than by the null the host
  // would return.
  function isPopupTarget(target) {
    if (target === undefined || target === null) return true;
    const name = String(target).toLowerCase();
    return name !== "_self" && name !== "_parent" && name !== "_top";
  }

  window.open = function (url, target) {
    const href = resolveShimmable(url);
    if (href === null || !isPopupTarget(target)) {
      return nativeOpen.apply(window, arguments);
    }

    const mount = document.body || document.documentElement;
    if (!mount) return null;

    const frame = createPopupIframe(href);
    mount.appendChild(frame);

    if (!frame.contentWindow) {
      // Nothing usable to hand back. Returning null keeps the caller's own
      // "popup blocked" path intact rather than failing further along on a
      // half-built object.
      frame.remove();
      return null;
    }

    const state = { closed: false, dismiss: null };
    state.dismiss = function dismiss() {
      if (state.closed) return;
      state.closed = true;
      document.removeEventListener("keydown", onKeydown, true);
      frame.remove();
    };

    // The overlay has no window chrome, so Escape is the only way out if the
    // caller never renders a close control of its own. Upstream's print view
    // does render 닫기, which calls close().
    function onKeydown(event) {
      if (event.key === "Escape") state.dismiss();
    }
    document.addEventListener("keydown", onKeydown, true);
    // Same listener inside the frame, so Escape works while it has focus.
    // Re-registered on every load: anything that swaps the frame's document —
    // a navigation, or a caller using document.open()/write(), which fires
    // load too — drops listeners held on the old one, window-bound included.
    function bindFrameEscape() {
      try {
        frame.contentWindow.document.addEventListener("keydown", onKeydown, true);
      } catch {
        // A cross-origin document would throw; these never are, so this is
        // only belt-and-braces.
      }
    }
    bindFrameEscape();
    frame.addEventListener("load", bindFrameEscape);

    return facade(frame, state);
  };
})();
