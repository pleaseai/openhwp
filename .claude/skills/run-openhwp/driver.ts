// OpenHWP driver — launches and drives the embedded rhwp-studio editor headlessly.
//
// The desktop shell (apps/desktop/main.ts) serves the built studio bundle
// (apps/studio-host/dist) and points a CEF window at it. This driver serves the
// same bundle and drives it with headless Chrome via Astral, so it works without
// a display / CEF / WindowServer — the reproducible harness for the web layer.
//
// Run from the UNIT ROOT (the repo root):
//   deno task setup            # once: materialize third_party/rhwp
//   deno task build:studio     # once: produce apps/studio-host/dist
//   deno run -A --no-lock .claude/skills/run-openhwp/driver.ts
// Screenshots land in .claude/skills/run-openhwp/screenshots/
//
// Exit code is 0 only if the studio boots: the static shell is present
// (#menu-bar + #scroll-container) AND the document engine reaches its ready
// state (the status bar leaves the "...로딩 중..." messages without an init
// failure), with no uncaught page errors.

// This is a standalone agent-tooling script, run with `deno run -A --no-lock`
// outside the workspace import graph — so it pins its deps with inline `jsr:`
// specifiers rather than a shared import map. Silence no-import-prefix for it.
// deno-lint-ignore-file no-import-prefix

// page.evaluate() callbacks below run in the browser, so this file references
// DOM globals that deno.json's lib does not provide. Pull in the DOM lib.
/// <reference lib="dom" />

import { serveDir } from "jsr:@std/http@1/file-server";
import { fromFileUrl } from "jsr:@std/path@1";
import { launch } from "jsr:@astral/astral@0.5";

// The studio bundle, resolved relative to this file so cwd does not matter.
const DIST = fromFileUrl(
  new URL("../../../apps/studio-host/dist", import.meta.url),
);
const built = await Deno.stat(`${DIST}/index.html`).then(() => true).catch(() => false);
if (!built) {
  console.error(`[driver] studio bundle missing at ${DIST}`);
  console.error(`[driver] run: deno task setup && deno task build:studio`);
  Deno.exit(1);
}

// Chrome to drive. macOS default; override with OPENHWP_CHROME (e.g. a Linux
// chromium path). Astral downloads its own Chromium if this path is missing.
const CHROME = Deno.env.get("OPENHWP_CHROME") ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const SHOT_DIR = new URL("./screenshots/", import.meta.url);
await Deno.mkdir(SHOT_DIR, { recursive: true });
const shotPath = (name: string) => decodeURIComponent(new URL(name, SHOT_DIR).pathname);

// Serve the built studio (same bundle main.ts serves). Loopback only.
let port = 0;
const server = Deno.serve(
  { hostname: "127.0.0.1", port: 0, onListen: (addr) => (port = addr.port) },
  (req) => serveDir(req, { fsRoot: DIST, quiet: true }),
);
const base = `http://127.0.0.1:${port}`;
console.log(`[driver] serving studio at ${base}`);

const chromeExists = await Deno.stat(CHROME).then(() => true).catch(() => false);
const browser = await launch({
  headless: true,
  ...(chromeExists ? { path: CHROME } : {}),
  args: ["--no-sandbox"],
});

let ok = false;
try {
  const page = await browser.newPage();
  const pageErrors: string[] = [];
  page.addEventListener("pageerror", (e) => {
    // deno-lint-ignore no-explicit-any
    pageErrors.push(String((e as any).detail?.message ?? e.detail));
  });

  await page.goto(base, { waitUntil: "networkidle2" });
  // Static studio shell must be present (menu bar + editor scroll area).
  await page.waitForSelector("#menu-bar");
  await page.waitForSelector("#scroll-container");

  // Poll the studio status bar until the engine leaves its loading states.
  // Upstream main.ts drives #sb-message through "...로딩 중..." during init and
  // a ready prompt afterward; an init failure sets a "...실패"/"...오류" message.
  const readyState = await page.evaluate(async () => {
    const msg = () => document.getElementById("sb-message")?.textContent?.trim() ?? "";
    const isLoading = (t: string) =>
      t === "" || t.includes("로딩") || t.endsWith("중...") ||
      t.includes("중…");
    const isError = (t: string) => t.includes("실패") || t.includes("오류");
    for (let i = 0; i < 60; i++) { // up to ~30s
      const t = msg();
      if (isError(t)) return { ready: false, message: t };
      if (!isLoading(t)) return { ready: true, message: t };
      await new Promise((r) => setTimeout(r, 500));
    }
    return { ready: false, message: msg() || "(timeout, still loading)" };
  });

  await Deno.writeFile(shotPath("studio.png"), await page.screenshot());
  console.log(`[driver] studio:`, JSON.stringify(readyState));
  console.log(`[driver] wrote ${shotPath("studio.png")}`);
  if (pageErrors.length) console.log(`[driver] page errors:`, pageErrors);

  ok = readyState.ready && pageErrors.length === 0;
} finally {
  // Settle both cleanups independently — a browser.close() rejection must not
  // mask the smoke failure or skip server.shutdown() (which would leak the port).
  await browser.close().catch((e) => console.error(`[driver] browser.close: ${e}`));
  await server.shutdown().catch((e) => console.error(`[driver] server.shutdown: ${e}`));
}

console.log(
  ok ? "[driver] PASS (studio boots)" : "[driver] FAIL (studio boots)",
);
Deno.exit(ok ? 0 : 1);
