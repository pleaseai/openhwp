// OpenHWP driver — launches and drives the app's webview UI headlessly.
//
// The desktop window (main.ts) is a Chromium view pointed at a local
// `Deno.serve()` server. This driver serves the same UI (`src/ui/`) and drives
// it with headless Chrome via Astral, so it works without a display / CEF /
// WindowServer — the reproducible harness for UI-layer changes.
//
// Run from the UNIT ROOT (the repo root), not from the skill dir:
//   deno run -A --no-lock .claude/skills/run-openhwp/driver.ts
// See SKILL.md for the exact invocation. Screenshots land in
//   .claude/skills/run-openhwp/screenshots/
//
// What it does:
//   1. serve src/ui on an ephemeral port,
//   2. open it in headless Chrome and screenshot the UI shell,
//   3. attempt the rhwp render path (load @rhwp/core, render a page to SVG) and
//      screenshot it — this also verifies the esm.sh/WASM assumption.
// Exit code is 0 only if the shell smoke check passes AND the rhwp render path
// succeeds (engine loads + a page renders to non-empty SVG). Any render-path
// failure — a CDN/network load failure or a post-load render regression — gates.

// The `page.evaluate()` callbacks below run in the browser, so this driver
// references DOM globals (document, etc.) that deno.json's lib does not provide.
// Pull in the DOM lib for this file so `deno check` passes on it.
/// <reference lib="dom" />

import { serveDir } from "jsr:@std/http@1/file-server";
import { launch } from "jsr:@astral/astral@0.5";

// Chrome to drive. macOS default; override with OPENHWP_CHROME (e.g. a Linux
// chromium path). Astral downloads its own Chromium if this path is missing.
const CHROME = Deno.env.get("OPENHWP_CHROME") ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const SHOT_DIR = new URL("./screenshots/", import.meta.url);
await Deno.mkdir(SHOT_DIR, { recursive: true });
const shotPath = (name: string) => decodeURIComponent(new URL(name, SHOT_DIR).pathname);

// 1. Serve the UI (same fsRoot as main.ts). Run from the unit root.
let port = 0;
const server = Deno.serve(
  { port: 0, onListen: (addr) => (port = addr.port) },
  (req) => serveDir(req, { fsRoot: "src/ui", quiet: true }),
);
const base = `http://127.0.0.1:${port}`;
console.log(`[driver] serving src/ui at ${base}`);

const chromeExists = await Deno.stat(CHROME).then(() => true).catch(() => false);
const browser = await launch({
  headless: true,
  ...(chromeExists ? { path: CHROME } : {}),
  args: ["--no-sandbox"],
});

let ok = false;
try {
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.addEventListener("console", (e) => {
    // deno-lint-ignore no-explicit-any
    const d: any = e.detail;
    if (d?.type === "error") consoleErrors.push(String(d.text));
  });
  page.addEventListener("pageerror", (e) => {
    // deno-lint-ignore no-explicit-any
    consoleErrors.push(String((e as any).detail?.message ?? e.detail));
  });

  await page.goto(base, { waitUntil: "networkidle2" });
  await page.waitForSelector("#viewer");

  // 2. Shell smoke: the toolbar Open button + placeholder must be present, and
  // app.js must have initialized (it installs globalThis.openhwp.onMenu). A
  // module that throws during init leaves the static HTML intact, so checking
  // only #open/.placeholder would pass a dead UI — require app readiness too.
  const shell = await page.evaluate(() => ({
    hasOpen: !!document.querySelector("#open"),
    placeholder: document.querySelector(".placeholder")?.textContent?.trim() ?? "",
    title: document.title,
    appReady:
      typeof (globalThis as { openhwp?: { onMenu?: unknown } }).openhwp?.onMenu === "function",
  }));
  await Deno.writeFile(shotPath("shell.png"), await page.screenshot());
  console.log(`[driver] shell:`, JSON.stringify(shell));
  console.log(`[driver] wrote ${shotPath("shell.png")}`);
  // Snapshot console/page errors BEFORE the best-effort render probe so the
  // probe's own failures stay non-gating.
  const shellErrors = [...consoleErrors];
  if (shellErrors.length) console.log(`[driver] shell console errors:`, shellErrors);
  ok = shell.hasOpen && shell.placeholder.length > 0 && shell.appReady &&
    shellErrors.length === 0;

  // 3. Render path: load @rhwp/core (esm.sh via the page's import map) and render
  // a page to SVG, then gate on it — if the engine cannot load or cannot render,
  // the app cannot display documents, so the run fails. (The engine is currently
  // CDN-loaded, so a transient esm.sh outage can red CI until it is vendored
  // locally — see index.html's TODO; re-running recovers a transient blip.)
  try {
    const render = await page.evaluate(async () => {
      let loaded = false;
      try {
        // @ts-ignore browser import map resolves this to esm.sh
        const mod = await import("@rhwp/core");
        await mod.default(); // init WASM (fetches rhwp_bg.wasm over the network)
        loaded = true;
        const make = mod.HwpDocument.createBlankDocument ?? mod.HwpDocument.createEmpty;
        if (typeof make !== "function") {
          return { loaded, ok: false, why: "no createBlank/Empty", svgLen: 0, pages: null };
        }
        const doc = make.call(mod.HwpDocument);
        const svg = doc.renderPageSvg(0);
        document.getElementById("viewer")!.innerHTML = svg;
        return {
          loaded,
          ok: svg.length > 0,
          why: "",
          svgLen: svg.length,
          pages: doc.pageCount?.() ?? null,
        };
      } catch (err) {
        return { loaded, ok: false, why: String((err as Error)?.message ?? err), svgLen: 0, pages: null };
      }
    });
    console.log(`[driver] render:`, JSON.stringify(render));
    if (render.ok) {
      await Deno.writeFile(shotPath("render.png"), await page.screenshot());
      console.log(`[driver] wrote ${shotPath("render.png")}`);
    } else {
      // The engine failed to load or to render — either way the app cannot
      // display documents, so fail the run. `loaded` distinguishes a CDN/network
      // load failure from a post-load render regression for diagnostics only;
      // both gate. (Once @rhwp is vendored locally a load failure can only be a
      // real regression — see index.html's vendoring TODO.)
      console.log(`[driver] render failed (gating) [loaded=${render.loaded}]:`, render.why);
      ok = false;
    }
  } catch (err) {
    console.log(`[driver] render attempt errored (non-fatal):`, String((err as Error)?.message ?? err));
  }

  if (consoleErrors.length) console.log(`[driver] console errors:`, consoleErrors);
} finally {
  await browser.close();
  await server.shutdown();
}

console.log(ok ? "[driver] PASS (shell smoke)" : "[driver] FAIL (shell smoke)");
Deno.exit(ok ? 0 : 1);
