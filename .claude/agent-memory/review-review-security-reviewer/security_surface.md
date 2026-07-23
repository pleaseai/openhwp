---
name: openhwp-security-surface
description: OpenHWP (Deno desktop HWP viewer) security posture — CDN supply chain, webview XSS surface, menu-forwarding safety, workflow hardening
metadata:
  type: project
---

OpenHWP is a Deno **desktop** app (`deno desktop`, CEF/Chromium webview) that is a thin host shell (`main.ts`) around the third-party **rhwp** WASM engine. All document parsing/rendering happens in the webview (`src/ui/`), not the host.

Security surfaces observed at the scaffold PR (`feat/desktop-scaffold`, PR #1):

- **Supply chain:** the webview loads `@rhwp/core` / `@rhwp/editor` from **unpinned, unversioned** `https://esm.sh/@rhwp/...` via an import map in `src/ui/index.html` (no version pin, no SRI). Runs third-party JS + WASM in the app origin. Documented TODO to vendor `rhwp_bg.wasm` locally. **Why:** compromise of esm.sh or the package = arbitrary code in a webview holding File System Access API + host bindings. **How to apply:** re-check whether vendoring landed before treating this as resolved; a pinned digest URL or local vendor closes it.
- **Viewer XSS surface:** `src/ui/app.js` does `viewer.innerHTML = doc.renderPageSvg(page)` — untrusted HWP document → SVG → innerHTML with no sanitization. Exploitability depends on whether the rhwp engine escapes its SVG output (third-party, not in-repo). **How to apply:** if adding a save/write-back path (retained FileSystemFileHandle in `state.handle`), the XSS impact escalates to file overwrite — re-flag then.
- **Safe by design (do NOT re-flag):** `main.ts` `win.executeJs("...onMenu(" + JSON.stringify(event.detail.id) + ")")` — `event.detail.id` is always a fixed internal menu id (`open`/`save`/`save-as`), and JSON.stringify escapes it. Not attacker-controllable.
- **Workflows are hardened:** all third-party actions SHA-pinned with `# vX` comments (OSS policy); `ci.yml` top-level `contents: read`; `release-please.yml` top-level `permissions: {}` with job-scoped writes; no untrusted `${{ github.event.* }}` interpolation. CI uses `pull_request` (not `pull_request_target`), so `-A --no-lock` driver run has no secrets / read-only token.
- **Broad Deno perms:** `deno.json` dev/build tasks use `--allow-net --allow-read --allow-env` (unscoped). Host `Deno.serve` only needs loopback + read of `src/ui`; webview network (esm.sh) is Chromium's, not Deno's `--allow-net`. Least-privilege tightening possible but low risk.
