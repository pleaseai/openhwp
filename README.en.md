# OpenHWP

> 한국어: [README.md](./README.md)

**OpenHWP is an open-source HWP/HWPX desktop app built with [Deno desktop](https://docs.deno.com/runtime/desktop/) and [rhwp](https://github.com/edwardkim/rhwp).**

It opens, edits, and saves Korean HWP and HWPX documents on macOS, Windows, and Linux — no Hancom Office required. The full [rhwp-studio](https://github.com/edwardkim/rhwp) editor (Rust + WebAssembly) does the document work; OpenHWP is a thin desktop shell around it.

> **Status: early / work in progress.** OpenHWP is a thin native shell that embeds the full rhwp-studio editor (see Quick start below). Both the engine and the Deno desktop runtime are young, so expect breaking changes.

## How it works

OpenHWP is a Deno workspace with two halves: a native shell and a web layer. Every document concern — parsing, layout, rendering, editing, and saving — belongs to the web layer, which is the **unmodified upstream rhwp-studio editor**. The shell only hosts it.

| Path               | Committed? | What it is                                                                                                       |
| ------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `apps/desktop`     | yes        | The `deno desktop` (CEF) shell — serves the bundle, opens the window, installs the native menu.                   |
| `apps/studio-host` | partly     | The web layer. `vendor/rhwp-core/` (the `@rhwp/core` WASM engine) is committed; the built `dist/` is not.         |
| `third_party/rhwp` | no         | Upstream rhwp, materialized as a sparse checkout pinned by `config/rhwp-studio-overrides.json`.                   |
| `scripts/`         | yes        | `setup-rhwp.ts` materializes that pin; `build-studio.ts` builds the bundle.                                       |

### The shell

`apps/desktop/main.ts` is around a hundred lines and does three things:

1. Serves `apps/studio-host/dist` over HTTP, bound to `127.0.0.1` on an ephemeral port.
2. Opens a `Deno.BrowserWindow` and navigates it to that server.
3. Installs a native menu limited to host operations — Quit, Reload, and Toggle DevTools.

Rendering runs on CEF (Chromium), selected by `"backend": "cef"` in `apps/desktop/deno.json`, so the webview behaves identically on every OS and the web APIs below are available everywhere.

### Why there are no source overrides

The shell serves the studio from `http://127.0.0.1`, which the webview treats as a secure context, so upstream's **web** code path works unchanged. Its bridge loads the WASM engine, and its open and save commands call [`showOpenFilePicker`](https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker) and `showSaveFilePicker` from the File System Access API. Chromium implements both in CEF, so the pristine upstream build is already a fully working editor and OpenHWP ships it with zero source patches. The Deno side needs no native file picker (Deno desktop does not ship one yet).

**File and Edit stay in the studio's own menu bar**, alongside its `Cmd`/`Ctrl`+`O` and `+S` shortcuts, rather than moving to the native menu. The File System Access pickers require transient user activation, and a native menu click does not carry that activation into the webview. Wiring the native menu to the editor therefore needs a studio override that exposes load and save hooks — planned, not present.

### The build

`deno task setup` materializes `third_party/rhwp`: a blob-filtered, cone-sparse clone of upstream limited to `rhwp-studio` and `assets` — roughly 80 MB rather than the full 1.1 GB monorepo — checked out at the exact commit pinned in `config/rhwp-studio-overrides.json`.

`deno task build:studio` then builds upstream's own Vite project in place. It supplies `pkg/` from the committed `vendor/rhwp-core` (so no Rust or `wasm-pack` toolchain is required), drops the bundled sample documents, disables the PWA service worker, and runs `vite build --base=/`. The upstream tree is restored afterward and the result moves to `apps/studio-host/dist`.

The engine, the studio, and 36 substitute fonts are all served locally, so the app works without a network connection. One exception remains: upstream's font loader fetches the 함초롬 (Hamchorom) family — the default in most HWP documents — from a public CDN, so that family alone needs the network to render in its own typeface. Tracked in [#12](https://github.com/pleaseai/openhwp/issues/12).

## Quick start

You need [Deno](https://deno.com) 2.9.0 or later (`deno desktop` arrived in 2.9), plus Node.js and npm to build the studio bundle. Check with `deno --version`.

OpenHWP embeds the full [rhwp-studio](https://github.com/edwardkim/rhwp) editor. Its bundle (`apps/studio-host/dist`) is not committed, so build it first.

```sh
# 1. Materialize the pinned upstream rhwp checkout (third_party/rhwp) — once
deno task setup

# 2. Build the studio bundle → apps/studio-host/dist
deno task build:studio

# 3. Run in development (the apps/desktop shell serves the bundle)
deno task dev

# Build a standalone binary / installers (.dmg / .msi / .AppImage) — configured via apps/desktop/deno.json's desktop.output
deno task build
```

## Roadmap

1. **Embedded editor** — *shipped in 0.1.0.* Open, edit, and save `.hwp` / `.hwpx` through the full rhwp-studio editor.
2. **Native integration** — bridge the native menu to the editor, reflect the document title and unsaved state in the window, and add app branding. Arrives as overrides tracked in `config/rhwp-studio-overrides.json`.
3. **Export & print** — PDF export (via rhwp) and the webview print path.
4. **Packaging** — signed and notarized `.dmg`, `.msi`, and `.deb` / `.AppImage` / `.rpm` builds in CI.

## Contributing

File bugs and ideas in the [issue tracker](https://github.com/pleaseai/openhwp/issues). The project is early, so its structure changes often.

## Credits

- Document engine: [rhwp](https://github.com/edwardkim/rhwp) by Edward Kim — the Rust/WASM HWP engine that makes this possible.

## License

[MIT](./LICENSE) © Passion Factory
