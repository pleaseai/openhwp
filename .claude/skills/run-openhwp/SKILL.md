---
name: run-openhwp
description: Build, launch, drive, and screenshot the OpenHWP Deno desktop app. Use to run OpenHWP, start the editor, take a screenshot, smoke-test the embedded rhwp-studio editor, or verify the HWP/HWPX edit/save pipeline boots.
---

# Run OpenHWP

OpenHWP is a Deno **desktop** app (`deno desktop`, CEF/Chromium backend) that is
a thin native shell around the full
[rhwp-studio](https://github.com/edwardkim/rhwp) editor (menus, toolbar, tables,
formatting, undo, open/save). The shell lives in `apps/desktop`; it serves the
studio's built bundle (`apps/studio-host/dist`) over local HTTP and points a
Chromium window at it. All document work — open, edit, render, save — happens
inside that webview via the studio's own UI.

The desktop window needs a display; a headless container / SSH session has none.
So the **primary way to run and observe this app is the driver**, which serves
the same `apps/studio-host/dist` and drives it with headless Chrome — no
display, CEF, or WindowServer required. It reaches the exact editor the desktop
window shows.

**All paths below are relative to the unit root** (the repo root — the directory
with the workspace `deno.json`). `cd` there first.

## Prerequisites

Verified on macOS (Darwin x86_64) this session:

- **Deno ≥ 2.9** (`deno desktop` was introduced in 2.9). This session:
  `deno 2.9.3`.
  ```bash
  deno --version
  ```
- **Node.js + npm** — only to _build_ the studio bundle (Vite); the app itself
  needs no Node at runtime. This session: `node v24.14.0`, `npm 11.9.0`.
- **git** — `deno task setup` materializes the pinned upstream via a sparse
  partial clone. This session: `git 2.49.0`.
- **A Chromium-family browser** for the driver. This session used the installed
  Google Chrome at
  `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (the driver's
  default). Point elsewhere with `OPENHWP_CHROME=/path/to/chrome` (e.g. a
  `chromium` binary on Linux). If the path is missing,
  [Astral](https://jsr.io/@astral/astral) downloads its own Chromium.
- Network access is needed **only at build time** (npm + the sparse clone). The
  built app + the vendored wasm engine run fully offline.

## Build

The studio bundle (`apps/studio-host/dist`) is **not committed** — build it
once. From the unit root:

```bash
deno task setup          # materialize third_party/rhwp (sparse, pinned) — once
deno task build:studio   # build the studio → apps/studio-host/dist
```

- `deno task setup` (`scripts/setup-rhwp.ts`) sparse-partial-clones upstream
  rhwp into `third_party/rhwp`, pinned to the commit in
  `config/rhwp-studio-overrides.json` (~80 MB, not the full 1.1 GB monorepo). It
  is idempotent: re-running verifies `HEAD` matches the pin and re-pins if not.
- `deno task build:studio` (`scripts/build-studio.ts`) supplies `pkg/` from the
  committed `apps/studio-host/vendor/rhwp-core` (so the Rust/wasm-pack step is
  skipped), disables the PWA service worker, drops the bundled sample docs, runs
  the upstream Vite build with `--base=/`, and restores the upstream tree.
  Output is a ~48 MB self-contained `apps/studio-host/dist` (no `sw.js`).

Type-check the shell (uses the official `deno.desktop` lib declared in
`apps/desktop/deno.json` → `compilerOptions.lib`):

```bash
deno task check
```

## Run — agent path (driver, headless, screenshot)

This is the path to use. It needs `apps/studio-host/dist` (build it first). From
the unit root:

```bash
deno run -A --no-lock .claude/skills/run-openhwp/driver.ts
```

It: (1) serves `apps/studio-host/dist` on an ephemeral port (the same bundle
`apps/desktop/main.ts` serves), (2) opens it in headless Chrome, (3) gates on
the editor **booting** — the static shell (`#menu-bar`, `#scroll-container`)
plus the document engine leaving its loading states (`#sb-message` reaches the
ready prompt, not an init-failure message), and (4) screenshots. Exit code is
`0` only when the studio boots with no uncaught page errors. Expected output:

```
[driver] serving studio at http://127.0.0.1:<port>
[driver] studio: {"ready":true,"message":"HWP 파일을 선택해주세요."}
[driver] wrote .../screenshots/studio.png
[driver] PASS (studio boots)
```

`screenshots/studio.png` shows the full editor toolbar (cut/copy/paste,
formatting, table, list, image…) over the empty editor canvas — the ready state
before a document is opened. It is gitignored — regenerated every run. **Open
the PNG and look** — a blank/error image means a regression.

Drive a different browser:

```bash
OPENHWP_CHROME=/path/to/chromium deno run -A --no-lock .claude/skills/run-openhwp/driver.ts
```

### What the driver does NOT cover

- **File → Open / Save** use the web File System Access API
  (`showOpenFilePicker` / `showSaveFilePicker`), which need a real user
  gesture + a native picker — not driveable headless. The driver asserts only
  that the editor boots to its ready state. To test opening / editing / saving a
  real `.hwp`, do it in the running desktop app (below), using the studio's
  **own** menu / `Ctrl+O` / `Ctrl+S` (which carry the gesture — the native OS
  menu does not).

## Run — desktop path (real window)

Launches the actual desktop runtime. From the unit root, `deno task dev` uses
the CEF backend from `apps/desktop/deno.json`, which **downloads Chromium (CEF)
on first run** (large/slow):

```bash
deno task dev
```

To skip the CEF download, force the system-webview backend:

```bash
cd apps/desktop && deno desktop --hmr --backend webview --allow-net --allow-read --allow-env main.ts
```

On a session with a display a native window opens showing the full editor; on a
headless/no-display session the runtime + server start but no window appears —
use the driver above to see the UI. Kill a stuck run:

```bash
pkill -f "deno desktop"
```

## Gotchas (battle scars from this session)

- **The studio owns the File / Edit menus, not the native OS menu.** File System
  Access pickers require _transient user activation_; a native-menu →
  `executeJs` path does not carry that gesture, so file open/save fails from the
  OS menu. The studio's in-webview menu / shortcuts carry the real gesture. So
  `main.ts` keeps only a minimal native menu (Reload, Toggle DevTools) and lets
  the studio drive open/edit/save.
- **The build skips Rust/wasm-pack.** `scripts/build-studio.ts` copies the
  committed `apps/studio-host/vendor/rhwp-core` (`@rhwp/core@0.7.19`, the
  wasm-bindgen `pkg/` output) into the upstream tree as `pkg/`, so no Rust
  toolchain is needed. The upstream **source** is pinned to the matching
  `v0.7.19` tag so studio ↔ core APIs stay consistent. Bump both together via
  `config/rhwp-studio-overrides.json` + `vendor/rhwp-core/PROVENANCE.json`.
- **`third_party/rhwp` is a sparse partial clone**, not a full submodule — the
  upstream monorepo is 1.1 GB (samples/pdf/mydocs); a cone sparse-checkout of
  `rhwp-studio` + `assets` at the pinned commit is ~80 MB. It is gitignored and
  materialized by `deno task setup`.
- **Prod builds expose no DEV globals.** Upstream only sets `window.__wasm`
  under `import.meta.env.DEV`, so the driver cannot poll it. Readiness is gated
  on the static shell plus `#sb-message` leaving the `...로딩 중...` loading
  messages without hitting a `...실패`/`...오류` init-failure message.
- **Astral**: pass the installed browser via `path` (the driver reads
  `OPENHWP_CHROME`) to avoid a ~150 MB Chromium download; launched with
  `--no-sandbox`.

## Troubleshooting

- **`[driver] studio bundle missing at …`** → the bundle isn't built. Run
  `deno task setup && deno task build:studio`, then re-run the driver.
- **`[driver] FAIL (studio boots)` with a `실패`/`오류` message or page errors**
  → the document engine failed to initialize (e.g. CanvasKit couldn't start).
  Open `screenshots/studio.png` and re-run with the desktop path to see the
  console.
- **Driver hangs / no screenshot** → Chrome path wrong or Astral is downloading
  Chromium on first run. Set `OPENHWP_CHROME` to an existing browser binary.
- **`deno task dev` seems stuck downloading** → that's CEF (first run). Use the
  `--backend webview` command above to avoid the download, or wait it out.

## The harness

`.claude/skills/run-openhwp/driver.ts` — committed next to this file. It serves
`apps/studio-host/dist` (the same bundle `apps/desktop/main.ts` serves) and
drives the real embedded editor. Edit it to add flows (e.g. load a sample `.hwp`
fixture) as the app grows.
