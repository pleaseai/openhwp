# Vendored `@rhwp/core`

The rhwp document engine, vendored locally so the app runs offline and does not
fetch executable code or WASM from a third-party CDN at runtime.

| | |
| --- | --- |
| Package | [`@rhwp/core`](https://www.npmjs.com/package/@rhwp/core) |
| Version | `0.7.19` |
| Source | npm registry tarball (`npm pack @rhwp/core@0.7.19`) |
| License | MIT (see `LICENSE`) |

## Files

- `rhwp.js` — wasm-bindgen `--target web` ESM glue. `default()` loads
  `rhwp_bg.wasm` relative to its own URL, so the two files must stay together.
- `rhwp_bg.wasm` — the engine binary.
- `rhwp.d.ts`, `rhwp_bg.wasm.d.ts` — type declarations (reference only).
- `LICENSE` — upstream MIT license.

## Updating

```bash
npm pack @rhwp/core@<version>
tar xzf rhwp-core-<version>.tgz
cp package/{rhwp.js,rhwp_bg.wasm,rhwp.d.ts,rhwp_bg.wasm.d.ts,LICENSE} src/ui/vendor/rhwp/
```

Then bump the version in this file and re-run the `run-openhwp` driver to confirm
the engine still loads and renders. Do not hand-edit the vendored files.
