// deno-lint-ignore-file no-window -- browser script, not a Deno module: `window` is the target.
// OpenHWP — window.open() shim for the deno-desktop (CEF) host.
//
// The CEF backend never creates popup windows: window.open() returns null
// unconditionally, with *and* without a user gesture (verified against
// deno 2.9.3's CEF backend). Nothing in `Deno.BrowserWindow` exposes a
// popup/new-window hook either, so the host cannot opt in.
//
// The studio's 파일 → 인쇄 (`file:print`) opens a blank popup and builds the
// rendered pages into it, so in the desktop app it only ever reached its
// "팝업이 차단되었습니다" fallback — printing was impossible. Printing itself
// works fine here (the system print dialog opens as usual); the only missing
// piece is something for window.open() to return.
//
// So return a same-origin about:blank iframe overlaid on the window. It
// provides everything the caller uses — `.document` to build into, `.print()`
// to print just that document, `.close()` to dismiss — and upstream's print
// stylesheet is already written for this: `@media screen` styles it as a
// centred preview with a fixed toolbar, and `@media print` hides the toolbar.
//
// This is additive, not an upstream source override: the studio is still built
// unmodified, and `config/rhwp-studio-overrides.json` stays empty.
(function () {
  "use strict";

  const nativeOpen = window.open;

  function isBlank(url) {
    return url === undefined || url === null || url === "" ||
      String(url) === "about:blank";
  }

  window.open = function (url) {
    // Only blank popups are shimmed. A popup with a real URL is left to the
    // host so this never silently changes where a link goes — it still
    // returns null there, which callers already have to handle.
    if (!isBlank(url)) {
      return nativeOpen.apply(window, arguments);
    }

    const mount = document.body || document.documentElement;
    if (!mount) return null;

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
    mount.appendChild(frame);

    const win = frame.contentWindow;
    if (!win) {
      // Nothing usable to hand back. Returning null keeps the caller's own
      // "popup blocked" path intact rather than failing further along on a
      // half-built object.
      frame.remove();
      return null;
    }

    let closed = false;
    function dismiss() {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKeydown, true);
      frame.remove();
    }

    // The overlay has no window chrome, so Escape is the only way out if the
    // caller never renders a close control of its own. Upstream's print view
    // does render 닫기, which calls close() below.
    function onKeydown(event) {
      if (event.key === "Escape") dismiss();
    }
    document.addEventListener("keydown", onKeydown, true);
    try {
      win.document.addEventListener("keydown", onKeydown, true);
    } catch {
      // A cross-origin document would throw; blank popups never are, so this
      // is only belt-and-braces.
    }

    // Shadow close() on the pseudo-window. Window.prototype.close() would be a
    // no-op for an iframe, leaving the overlay stuck over the editor.
    try {
      win.close = dismiss;
    } catch {
      // If the assignment is refused the overlay is still dismissable with
      // Escape, so this stays non-fatal.
    }

    return win;
  };
})();
