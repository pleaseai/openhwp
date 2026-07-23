---
name: run-openhwp
description: Build, launch, drive, and screenshot the OpenHWP Deno desktop app. Use to run OpenHWP, start the viewer, take a screenshot, smoke-test the webview UI, or verify the rhwp (HWP/HWPX → SVG) render pipeline.
---

# Run OpenHWP

OpenHWP is a Deno **desktop** app (`deno desktop`, CEF/Chromium backend) that is
a thin host shell around the [rhwp](https://github.com/edwardkim/rhwp) WASM
engine. `main.ts` (the host) serves the webview UI (`src/ui/`) over local HTTP
and points a Chromium window at it; the document work (open, render to SVG) all
happens in that webview.

The desktop window needs a display; a headless container / SSH session has none.
So the **primary way to run and observe this app is the driver**, which serves
the same `src/ui/` and drives it with headless Chrome — no display, CEF, or
WindowServer required. It reaches the exact UI + engine the desktop window shows.

**All paths below are relative to the unit root** (the repo root — the directory
with `deno.json` and `main.ts`). `cd` there first.

## Prerequisites

Verified on macOS (Darwin x86_64) this session:

- **Deno ≥ 2.9** (`deno desktop` was introduced in 2.9). This session: `deno 2.9.3`.
  ```bash
  deno --version
  ```
- **A Chromium-family browser** for the driver. This session used the installed
  Google Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
  (the driver's default). Point elsewhere with `OPENHWP_CHROME=/path/to/chrome`
  (e.g. a `chromium` binary on Linux). If the path is missing, [Astral](https://jsr.io/@astral/astral)
  downloads its own Chromium.
- Network access: the webview loads `@rhwp/core` from esm.sh (import map), and the
  driver uses Astral from `jsr:` — both fetch on first run.

## Build / verify

No compile step is needed to run the driver, but this fetches deps, writes
`deno.lock`, and type-checks the host (uses the official `deno.desktop` lib
declared in `deno.json` → `compilerOptions.lib`):

```bash
deno check main.ts
deno lint
deno fmt --check
```

## Run — agent path (driver, headless, screenshots)

This is the path to use. From the unit root:

```bash
deno run -A --no-lock .claude/skills/run-openhwp/driver.ts
```

It: (1) serves `src/ui/` on an ephemeral port, (2) opens it in headless Chrome,
(3) screenshots the UI shell, and (4) loads `@rhwp/core` and renders a blank
document page to SVG, screenshotting that too. Exit code is `0` only when the
shell smoke check passes. Expected output:

```
[driver] serving src/ui at http://127.0.0.1:<port>
[driver] shell: {"hasOpen":true,"placeholder":"Open a Hancom document to view it.","title":"OpenHWP"}
[driver] wrote .../screenshots/shell.png
[driver] render: {"ok":true,"svgLen":460,"pages":1}
[driver] wrote .../screenshots/render.png
[driver] PASS (shell smoke)
```

Screenshots land in `.claude/skills/run-openhwp/screenshots/`
(`shell.png` = the toolbar + "Open a Hancom document to view it." placeholder;
`render.png` = a blank page rendered by the rhwp engine). They are gitignored —
regenerated every run. **Open the PNGs and look** — a blank/error image means a
regression.

Drive a different browser:

```bash
OPENHWP_CHROME=/path/to/chromium deno run -A --no-lock .claude/skills/run-openhwp/driver.ts
```

### What the driver does NOT cover

- The real **File → Open** flow uses `window.showOpenFilePicker` (File System
  Access API), which needs a user gesture + a native picker — not driveable
  headless. The driver bypasses it with `HwpDocument.createBlankDocument()` to
  still exercise the render pipeline. To test rendering a *real* `.hwp`, do it in
  the running desktop app.

## Run — desktop path (real window)

Launches the actual desktop runtime. `deno task dev` uses the CEF backend from
`deno.json`, which **downloads Chromium (CEF) on first run** (large/slow). To
skip that download, force the system-webview backend — this is what was run this
session, and it compiled + started the runtime and served the UI:

```bash
deno desktop --hmr --backend webview --allow-net --allow-read --allow-env main.ts
```

Output ends with `Runtime started` … `Listening on http://127.0.0.1:<port>/` and
stays running (Ctrl-C to stop). On a session with a display a native window
opens; on a headless/no-display session the runtime + server start but no visible
window appears — use the driver above to see the UI. Kill a stuck run:

```bash
pkill -f "deno desktop"
```

## Gotchas (battle scars from this session)

- **`deno desktop` ships official types (`lib.deno.desktop.d.ts`).** Do **not**
  hand-write ambient declarations for `Deno.BrowserWindow` / `Deno.MenuItem` — they
  conflict/drift. Instead set `compilerOptions.lib: ["deno.window", "deno.desktop"]`
  in `deno.json` (works for plain `deno check`, verified). Plain `deno check`
  without that lib reports `Property 'BrowserWindow' does not exist on Deno`.
- **`win.bind(name, handler)` handlers must return a `Promise`.** A plain-object
  return fails type-check (`TS2739 … missing then/catch/finally`). But marking the
  handler `async` with no `await` trips the `require-await` lint. Use
  `() => Promise.resolve({...})` to satisfy both.
- **The viewer loads `@rhwp/core` from esm.sh** via the import map in
  `src/ui/index.html`. The driver confirmed esm.sh serves the package + its
  `rhwp_bg.wasm` and that `init()` with no argument works — but this makes the app
  **network-dependent at runtime**. Vendoring the wasm offline is a known TODO.
- **`rhwp` needs `globalThis.measureTextWidth`** defined before `init()` (a canvas
  text-measure callback); `src/ui/app.js` sets it. Without it, layout breaks.
- **Astral**: pass the installed browser via `path` (the driver reads
  `OPENHWP_CHROME`) to avoid a ~150MB Chromium download; launched with
  `--no-sandbox`.

## Troubleshooting

- **`TS2739 … Promise<BrowserWindowReturn>` / `TS1356 … mark this function as 'async'`**
  on a `win.bind` call → the handler must return a Promise. Use `Promise.resolve(...)`
  (see Gotchas), not a bare object.
- **`Property 'BrowserWindow' does not exist on type 'typeof Deno'`** → `deno.json`
  is missing `compilerOptions.lib: ["deno.window", "deno.desktop"]`.
- **Driver hangs / no screenshot** → Chrome path wrong or Astral is downloading
  Chromium on first run. Set `OPENHWP_CHROME` to an existing browser binary.
- **`deno task dev` seems stuck downloading** → that's CEF (first run). Use the
  `--backend webview` command above to avoid the download, or wait it out.

## The harness

`.claude/skills/run-openhwp/driver.ts` — committed next to this file. It reuses
the app's own `serveDir({ fsRoot: "src/ui" })` serving and drives the real UI +
engine. Edit it to add flows (e.g. load a sample `.hwp` fixture) as the app grows.
