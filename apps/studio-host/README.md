# `@openhwp/studio-host`

The web layer of OpenHWP: the full [rhwp-studio](https://github.com/edwardkim/rhwp) editor (menus,
toolbar, tables, formatting, undo, open/save), built into `dist/` and served by the deno-desktop
shell (`apps/desktop`).

OpenHWP embeds the **unmodified upstream** studio. Upstream's file open/save use the web File System
Access API, which works in the CEF webview as-is, so no source overrides are needed yet.
(Desktop-native integration — native menu ↔ editor, PDF/print — will arrive as overrides under
`src/`, tracked in `config/rhwp-studio-overrides.json`.)

## Layout

| Path                | Committed?      | What                                                                                                                  |
| ------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `vendor/rhwp-core/` | yes             | `@rhwp/core@0.7.19` wasm engine (`rhwp.js` + `rhwp_bg.wasm`), the `@wasm` alias for the build. See `PROVENANCE.json`. |
| `dist/`             | no (gitignored) | Built studio bundle — produced by the build below.                                                                    |

The upstream studio **source** is not vendored here; it is materialized at `third_party/rhwp`
(gitignored) from the pin in `config/rhwp-studio-overrides.json`.

## Build

From the repo root:

```bash
deno task setup          # materialize third_party/rhwp (sparse, pinned) — once
deno task build:studio   # build the studio → apps/studio-host/dist
```

`scripts/build-studio.ts` supplies `pkg/` from `vendor/rhwp-core` (so the Rust/wasm-pack step is
skipped), disables the PWA service worker, drops bundled sample docs, and runs the upstream Vite
build with `--base=/`. The upstream tree is restored afterward.

## Updating rhwp

Bump `upstream.version`/`tag`/`commit` in `config/rhwp-studio-overrides.json`, refresh
`vendor/rhwp-core` to the matching `@rhwp/core` version (see its `PROVENANCE.json`), then re-run
`deno task setup && deno task build:studio`.
