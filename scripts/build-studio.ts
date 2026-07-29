#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env
// Builds the pristine upstream rhwp-studio (from third_party/rhwp) into
// apps/studio-host/dist — the web bundle the deno-desktop shell serves.
//
// Why a build script instead of a normal Vite project: openhwp embeds the
// UNMODIFIED upstream studio (no source overrides yet), so we build upstream's
// own project in place. We supply pkg/ from the vendored @rhwp/core (skipping
// the Rust/wasm-pack step), disable the PWA service worker (pointless offline +
// it would intercept fetches under the headless driver), and drop the bundled
// sample docs. The upstream tree is restored afterward so re-runs stay clean.
//
//   deno run -A scripts/build-studio.ts

const ROOT = `${import.meta.dirname}/../`;
const SUB = `${ROOT}third_party/rhwp`;
const STUDIO = `${SUB}/rhwp-studio`;
const VENDOR = `${ROOT}apps/studio-host/vendor/rhwp-core`;
const OUT = `${ROOT}apps/studio-host/dist`;
// The CEF host cannot open popup windows, so the built bundle gets a
// window.open shim injected (step 7).
const SHIM_NAME = "openhwp-popup.js";
const SHIM_SRC = `${ROOT}apps/studio-host/shims/${SHIM_NAME}`;
const SHIM_TAG = `<script src="/${SHIM_NAME}"></script>`;
const CORE_FILES = [
  "rhwp.js",
  "rhwp_bg.wasm",
  "rhwp.d.ts",
  "rhwp_bg.wasm.d.ts",
  "package.json",
];

async function exists(path: string): Promise<boolean> {
  return await Deno.stat(path).then(() => true).catch(() => false);
}

async function removeIfExists(path: string): Promise<void> {
  // Ignore a missing path, but surface a real removal failure (permissions, a
  // busy file) instead of silently packaging/renaming broken output over it.
  try {
    await Deno.remove(path, { recursive: true });
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) throw err;
  }
}

async function run(bin: string, args: string[], cwd: string): Promise<void> {
  console.log(
    `[build-studio] ${bin} ${args.join(" ")}  (cwd: ${cwd.replace(ROOT, "")})`,
  );
  const { code } = await new Deno.Command(bin, {
    args,
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  })
    .output();
  if (code !== 0) throw new Error(`${bin} ${args.join(" ")} exited ${code}`);
}

async function copyInto(
  srcDir: string,
  destDir: string,
  files: string[],
): Promise<void> {
  await Deno.mkdir(destDir, { recursive: true });
  for (const f of files) {
    await Deno.copyFile(`${srcDir}/${f}`, `${destDir}/${f}`);
  }
}

if (!await exists(`${STUDIO}/vite.config.ts`)) {
  console.error(
    "[build-studio] third_party/rhwp is missing. Run: deno run -A scripts/setup-rhwp.ts",
  );
  Deno.exit(1);
}

// 1. Supply pkg/ from the vendored core (the studio's `@wasm` alias → ../pkg).
await copyInto(VENDOR, `${SUB}/pkg`, CORE_FILES);
// 2. The upstream deploy recipe also copies the engine into public/.
await copyInto(`${SUB}/pkg`, `${STUDIO}/public`, ["rhwp_bg.wasm", "rhwp.js"]);
// 3. Drop bundled sample documents (demo content; host drives file loading).
await removeIfExists(`${STUDIO}/public/samples`);
// 4. Install the studio's build deps from its committed lockfile. Run every
//    build (not only when node_modules is absent) so a re-pin to a different
//    upstream commit reconciles deps to that commit's lockfile instead of
//    building against a stale tree; npm is a fast no-op when already in sync.
await run("npm", ["install", "--no-audit", "--no-fund"], STUDIO);

// 5. Disable the PWA service worker for this build, then restore the config.
const cfgPath = `${STUDIO}/vite.config.ts`;
const cfgOrig = await Deno.readTextFile(cfgPath);
const cfgPatched = cfgOrig.replace(
  "VitePWA({",
  "VitePWA({\n      disable: true, // openhwp: no service worker\n",
);
// String.replace is a no-op (not an error) when the literal is absent — guard
// against silently shipping a service worker if upstream reformats the config.
if (cfgPatched === cfgOrig && cfgOrig.includes("VitePWA(")) {
  throw new Error(
    "[build-studio] could not disable VitePWA — upstream vite.config format " +
      "changed; update the patch in scripts/build-studio.ts",
  );
}
await Deno.writeTextFile(cfgPath, cfgPatched);
let buildError: unknown;
try {
  await run("npx", ["vite", "build", "--base=/"], STUDIO);
} catch (err) {
  buildError = err;
}
// Always restore the config, but never let a restore failure replace the build
// error (a plain finally would mask the real cause).
await Deno.writeTextFile(cfgPath, cfgOrig).catch((restoreErr) => {
  console.error(
    `[build-studio] WARNING: failed to restore ${cfgPath}: ${restoreErr}`,
  );
});
if (buildError) throw buildError;

// 6. Move the freshly built bundle to apps/studio-host/dist.
await removeIfExists(OUT);
await Deno.rename(`${STUDIO}/dist`, OUT);

// 7. Install the window.open shim (see the shim for why the CEF host needs it).
//    Done on the built output rather than on upstream's source, so the studio
//    itself stays unmodified. A classic (non-module) script tag mirrors what
//    upstream already does for theme-init.js and runs before the deferred module
//    bundle, which is what the shim needs. A separate file rather than an inline
//    script: it stays a real source file (linted, formatted, reviewable) and
//    survives a script-src CSP if one is ever added.
await Deno.copyFile(SHIM_SRC, `${OUT}/${SHIM_NAME}`);
const htmlPath = `${OUT}/index.html`;
const htmlOrig = await Deno.readTextFile(htmlPath);
// HTML end tags are case-insensitive and may carry trailing whitespace, so
// match that way rather than failing the build over upstream's formatting.
const htmlPatched = htmlOrig.replace(/<\/head\s*>/i, `  ${SHIM_TAG}\n$&`);
// Fail loudly rather than shipping a bundle where 파일 → 인쇄 silently reports
// "팝업이 차단되었습니다" again.
if (htmlPatched === htmlOrig) {
  throw new Error(
    `[build-studio] could not inject ${SHIM_NAME} into index.html — no </head> ` +
      "found; update the injection in scripts/build-studio.ts",
  );
}
await Deno.writeTextFile(htmlPath, htmlPatched);

console.log(`[build-studio] done → ${OUT.replace(ROOT, "")}`);
