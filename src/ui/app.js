// OpenHWP webview app (Phase 1: viewer).
//
// Runs inside the desktop window's Chromium (CEF) webview. It:
//   1. loads the rhwp WASM engine (@rhwp/core),
//   2. opens a .hwp/.hwpx file through the File System Access API, and
//   3. renders pages to SVG with HwpDocument.renderPageSvg().
//
// Host (Deno) functions are exposed as `bindings.<name>()`; native menu clicks
// are forwarded here by main.ts via `globalThis.openhwp.onMenu(id)`.

const viewer = document.getElementById("viewer");
const statusEl = document.getElementById("status");
const pager = document.querySelector(".pager");
const pageIndicator = document.getElementById("page-indicator");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");

const state = {
  doc: null,
  handle: null,
  page: 0,
  pageCount: 0,
};

function setStatus(message) {
  statusEl.textContent = message;
}

// rhwp needs a text-measurement callback for layout. It must exist on
// globalThis before the engine initializes.
globalThis.measureTextWidth = (font, text) => {
  const ctx = globalThis.__measureCtx ??
    (globalThis.__measureCtx = document.createElement("canvas").getContext("2d"));
  ctx.font = font;
  return ctx.measureText(text).width;
};

let enginePromise;
function loadEngine() {
  enginePromise ??= (async () => {
    // Vendored locally (src/ui/vendor/rhwp) — no CDN at runtime. `default()`
    // loads rhwp_bg.wasm relative to rhwp.js, i.e. from the same vendor dir.
    const mod = await import("./vendor/rhwp/rhwp.js");
    await mod.default(); // init WASM
    return mod;
  })();
  return enginePromise;
}

async function openFile() {
  if (!globalThis.showOpenFilePicker) {
    setStatus("File System Access API is unavailable in this webview.");
    return;
  }
  let handle;
  try {
    [handle] = await globalThis.showOpenFilePicker({
      types: [{
        description: "Hancom documents",
        accept: { "application/octet-stream": [".hwp", ".hwpx"] },
      }],
    });
  } catch (err) {
    if (err?.name === "AbortError") return; // user cancelled the picker
    throw err;
  }

  setStatus("Loading engine…");
  const { HwpDocument } = await loadEngine();

  setStatus("Opening document…");
  const file = await handle.getFile();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = new HwpDocument(bytes);

  state.doc = doc;
  state.handle = handle;
  state.pageCount = doc.pageCount();
  state.page = 0;
  renderPage();
  setStatus(file.name);
}

function renderPage() {
  const { doc, page, pageCount } = state;
  if (!doc) return;
  // SECURITY: renderPageSvg() returns SVG built from an untrusted document, so
  // this trusts the rhwp engine to escape document-derived content. TODO(Phase 2):
  // sanitize before injection (or confirm rhwp's output is safe). The CSP in
  // index.html is the defense-in-depth backstop.
  viewer.innerHTML = doc.renderPageSvg(page);
  pager.hidden = pageCount <= 1;
  prevBtn.disabled = page <= 0;
  nextBtn.disabled = page >= pageCount - 1;
  // #page-indicator is an aria-live region (index.html) — give it explicit
  // context so screen readers announce the page change.
  pageIndicator.textContent = `Page ${page + 1} of ${pageCount}`;
}

function turnPage(delta) {
  if (!state.doc) return;
  const next = Math.min(Math.max(state.page + delta, 0), state.pageCount - 1);
  if (next === state.page) return;
  state.page = next;
  renderPage();
}

const reportError = (err) => setStatus(`Error: ${err?.message ?? err}`);

document.getElementById("open").addEventListener("click", () => openFile().catch(reportError));
prevBtn.addEventListener("click", () => turnPage(-1));
nextBtn.addEventListener("click", () => turnPage(1));

// Bridge for the native application menu (main.ts forwards clicks here).
globalThis.openhwp = {
  onMenu(id) {
    switch (id) {
      case "open":
        openFile().catch(reportError);
        break;
      case "save":
      case "save-as":
        // TODO(Phase 2): write back through the retained FileSystemFileHandle.
        setStatus("Saving is not implemented yet.");
        break;
    }
  },
};

// Show runtime info from the host binding, when available. The optional chain
// tolerates environments with no host bridge (e.g. the headless driver); once
// the binding exists, a rejection is a real failure, so log it instead of
// swallowing. NOTE: on Deno 2.9.3 this binding can reject due to an upstream
// desktop bug (denoland/deno#36033, fixed by #36065 — not yet in a stable
// release); the status line then just omits the runtime info, which is non-fatal.
if (globalThis.bindings?.hostInfo) {
  globalThis.bindings.hostInfo()
    .then((info) => setStatus(`OpenHWP · Deno ${info.denoVersion} · ${info.platform}`))
    .catch((err) => console.warn("hostInfo binding failed:", err));
}
