# `@openhwp/studio-host`

The web layer of OpenHWP: the full [rhwp-studio](https://github.com/edwardkim/rhwp) editor (menus,
toolbar, tables, formatting, undo, open/save), built into `dist/` and served by the deno-desktop
shell (`apps/desktop`).

OpenHWP embeds the **unmodified upstream** studio. Upstream's file open/save use the web File System
Access API, which works in the CEF webview as-is, so no source overrides are needed yet.
(Desktop-native integration — native menu ↔ editor, PDF export — will arrive as overrides under
`src/`, tracked in `config/rhwp-studio-overrides.json`.)

One host gap is patched additively, without touching upstream source: `shims/openhwp-popup.js`
replaces `window.open()`, because the CEF backend never creates popup windows and upstream's 파일 →
인쇄 builds its preview into one. `scripts/build-studio.ts` copies the shim into `dist/` and injects
a `<script>` tag for it (step 7); the shim itself explains the reasoning.

## Layout

| Path                | Committed?      | What                                                                                                                  |
| ------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `vendor/rhwp-core/` | yes             | `@rhwp/core@0.7.19` wasm engine (`rhwp.js` + `rhwp_bg.wasm`), the `@wasm` alias for the build. See `PROVENANCE.json`. |
| `shims/`            | yes             | Host gap-fillers injected into the built bundle. Additive — not upstream source overrides.                            |
| `dist/`             | no (gitignored) | Built studio bundle — produced by the build below.                                                                    |

The upstream studio **source** is not vendored here; it is materialized at `third_party/rhwp`
(gitignored) from the pin in `config/rhwp-studio-overrides.json`.

## Build

From the repo root:

```bash
deno task setup          # materialize third_party/rhwp (sparse, pinned) — once
deno task build:studio   # build the studio → apps/studio-host/dist
```

`scripts/build-studio.ts` builds upstream's Vite project in place — see
[The build](../../README.en.md#the-build) for the full recipe. It restores the Vite config
afterward, but leaves the rest of its in-place edits (the injected `pkg/`, the dropped samples, the
npm-refreshed lockfile) in `third_party/rhwp`; the next `deno task setup` force-checks-out the pin
and discards them.

## Updating rhwp

Bump `upstream.version`/`tag`/`commit` in `config/rhwp-studio-overrides.json`, refresh
`vendor/rhwp-core` to the matching `@rhwp/core` version (see its `PROVENANCE.json`), then re-run
`deno task setup && deno task build:studio`.
