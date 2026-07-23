# OpenHWP

> 한국어: [README.md](./README.md)

**OpenHWP is an open-source HWP/HWPX desktop app built on [Deno desktop](https://docs.deno.com/runtime/desktop/) and [rhwp](https://github.com/edwardkim/rhwp).**

It opens, views, and (on the roadmap) edits Korean **HWP** and **HWPX** documents on macOS,
Windows, and Linux — without Hancom Office. The document engine is [rhwp](https://github.com/edwardkim/rhwp)
(Rust + WebAssembly); OpenHWP is a thin desktop shell around it.

> **Status: early / work in progress.** The engine and desktop runtime this project builds on are
> both young. Expect breaking changes. This repository currently contains the project scaffold and
> documentation; application code lands next.

## Stack

OpenHWP runs on a single **Deno** toolchain and keeps the desktop shell thin, delegating every
document concern to `rhwp`.

| Concern                | Choice                                                          |
| ---------------------- | -------------------------------------------------------------- |
| Desktop shell          | `deno desktop` (Deno host + webview)                           |
| Rendering engine       | **CEF backend** (Chromium — consistent everywhere)             |
| Document engine        | `rhwp` via WebAssembly (`@rhwp/core` / `@rhwp/editor`)          |
| File open / save       | **File System Access API** (`showOpenFilePicker` / `showSaveFilePicker`) |
| Native menus / windows | Deno desktop menus + `bindings`                                |
| Toolchain              | Deno (single toolchain)                                        |

## Architecture

OpenHWP keeps the shell thin and delegates every document concern to `rhwp`, cleanly separating the
"document engine" from the "platform shell".

```
┌────────────────────────────────────────────────────────────┐
│  deno desktop binary                                        │
│                                                             │
│  ┌───────────────┐          ┌───────────────────────────┐  │
│  │ Deno host      │  bind()  │ Webview (CEF / Chromium)  │  │
│  │  (main.ts)     │◀────────▶│                           │  │
│  │                │ bindings │  rhwp engine (WASM):      │  │
│  │ • Deno.serve() │          │   @rhwp/core  → render     │  │
│  │ • app menus    │          │   @rhwp/editor → edit UI   │  │
│  │ • windows      │          │                           │  │
│  │                │          │  File System Access API:  │  │
│  │                │          │   showOpenFilePicker()    │  │
│  │                │          │   showSaveFilePicker()    │  │
│  └───────────────┘          └───────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

- **Deno desktop shell** — `Deno.serve()` provides the UI to a native window; the **CEF backend**
  (`"backend": "cef"` in `deno.json`) embeds Chromium so rendering is identical across platforms and
  the modern web APIs below are available. Native application menus and window management use
  `Deno.BrowserWindow` (`setApplicationMenu`, the `menuclick` event) and expose host functions to
  the webview through [`bindings`](https://docs.deno.com/runtime/desktop/bindings/).
- **rhwp engine (WebAssembly)** — parsing, layout, and rendering come from `rhwp`, consumed as npm
  packages rather than compiled into the shell:
  - [`@rhwp/core`](https://www.npmjs.com/package/@rhwp/core) — the WASM parser/renderer
    (`import init, { HwpDocument } from '@rhwp/core'` → `await init()` → `new HwpDocument(bytes)` →
    `doc.renderPageSvg(0)`), used for viewing.
  - [`@rhwp/editor`](https://www.npmjs.com/package/@rhwp/editor) — the full editor UI
    (`createEditor('#editor')`, iframe-embedded), used for editing.
- **File open / save** — the **[File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker)**.
  Because the CEF backend is Chromium and Deno serves the app from `localhost` (a secure context),
  `window.showOpenFilePicker({ types: [{ accept: { 'application/octet-stream': ['.hwp', '.hwpx'] } }] })`
  and `window.showSaveFilePicker(...)` give real native dialogs, and the returned
  `FileSystemFileHandle` is retained so **Save** rewrites the same file with no re-prompt. This
  removes the need for a native file-picker on the Deno side (Deno desktop does not yet ship one).

## Development

> Application code (the `deno.json` `desktop` block, `main.ts`, and UI) is not in the repository yet.
> The workflow below is the intended shape and will be filled in as the app is implemented.

### Prerequisites

- [Deno](https://deno.com) **≥ 2.9.0** (`deno desktop` was introduced in 2.9). Check with `deno --version`.

### Planned commands

```sh
# Run in development (webview follows Deno.serve())
deno task dev

# Build a standalone desktop binary with the Chromium (CEF) backend
deno desktop main.ts --backend cef

# Produce platform installers (.dmg / .msi / .deb) — configured via deno.json `desktop.output`
deno desktop main.ts
```

## Roadmap

1. **Viewer** — open an `.hwp` / `.hwpx` file via the File System Access API and render pages to SVG
   with `@rhwp/core`.
2. **Editor** — embed `@rhwp/editor`; wire **Save** / **Save As** back to disk through
   `FileSystemFileHandle`, plus native menus and multi-window support.
3. **Export & print** — PDF export (via `rhwp`) and the webview print path.
4. **Packaging** — signed/notarized `.dmg`, `.msi`, and `.deb` / `.AppImage` / `.rpm` builds in CI.

## Credits

- Document engine: [**rhwp**](https://github.com/edwardkim/rhwp) by Edward Kim — the Rust/WASM HWP
  engine that makes this possible.

## License

[MIT](./LICENSE) © Passion Factory
