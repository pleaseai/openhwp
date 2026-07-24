# OpenHWP

> 한국어: [README.md](./README.md)

**OpenHWP is an open-source HWP/HWPX desktop app built with [Deno desktop](https://docs.deno.com/runtime/desktop/) and [rhwp](https://github.com/edwardkim/rhwp).**

It opens, edits, and saves Korean HWP and HWPX documents on macOS, Windows, and Linux — no Hancom Office required. The full [rhwp-studio](https://github.com/edwardkim/rhwp) editor (Rust + WebAssembly) does the document work; OpenHWP is a thin desktop shell around it.

> **Status: early / work in progress.** OpenHWP is a thin native shell that embeds the full rhwp-studio editor (see Quick start below). Both the engine and the Deno desktop runtime are young, so expect breaking changes.

## How it works

OpenHWP runs on a single Deno toolchain. It keeps the desktop shell thin and delegates every document concern to rhwp, separating the "document engine" from the "platform shell".

- **Desktop shell** — `deno desktop`. A native window's webview displays whatever `Deno.serve()` returns.
- **Rendering backend** — CEF (Chromium). Setting `"backend": "cef"` in `deno.json` makes rendering identical on every OS and enables the modern web APIs below.
- **Document engine** — rhwp, loaded as WebAssembly through npm packages rather than compiled into the shell.
- **File open / save** — the File System Access API.
- **Native menus / windows** — Deno desktop menus and `bindings`.

### Document engine: rhwp

Use [`@rhwp/core`](https://www.npmjs.com/package/@rhwp/core), the WASM parser/renderer, for viewing:

```js
import init, { HwpDocument } from "@rhwp/core";

await init();
const doc = new HwpDocument(bytes);
document.querySelector("#viewer").innerHTML = doc.renderPageSvg(0);
```

Use [`@rhwp/editor`](https://www.npmjs.com/package/@rhwp/editor), the full editor UI embedded as an iframe, for editing:

```js
import { createEditor } from "@rhwp/editor";

const editor = await createEditor("#editor");
```

### File open / save: the File System Access API

The CEF backend is Chromium, and Deno serves the app from `localhost` (a secure context), so OpenHWP uses the standard [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker) directly. As a result, the Deno side needs no native file picker (Deno desktop does not ship one yet).

```js
// Open — restrict the picker to .hwp / .hwpx.
const [handle] = await window.showOpenFilePicker({
  types: [{ accept: { "application/octet-stream": [".hwp", ".hwpx"] } }],
});
const file = await handle.getFile();
const bytes = new Uint8Array(await file.arrayBuffer());

// Save — reuse the handle from Open to write back without prompting again.
const writable = await handle.createWritable();
await writable.write(bytes);
await writable.close();
```

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

1. **Viewer** — open `.hwp` / `.hwpx` with the File System Access API and render pages to SVG with `@rhwp/core`.
2. **Editor** — embed `@rhwp/editor` and wire Save / Save As to disk through `FileSystemFileHandle`, with native menus and multiple windows.
3. **Export & print** — PDF export (via rhwp) and the webview print path.
4. **Packaging** — signed and notarized `.dmg`, `.msi`, and `.deb` / `.AppImage` / `.rpm` builds in CI.

## Contributing

File bugs and ideas in the [issue tracker](https://github.com/pleaseai/openhwp/issues). The project is early, so its structure changes often.

## Credits

- Document engine: [rhwp](https://github.com/edwardkim/rhwp) by Edward Kim — the Rust/WASM HWP engine that makes this possible.

## License

[MIT](./LICENSE) © Passion Factory
