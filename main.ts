// OpenHWP — Deno desktop host (the "platform shell").
//
// The shell is intentionally thin: every document concern (parsing, layout,
// rendering, editing) lives in the webview via the rhwp engine. This module
// only:
//   1. serves the static webview UI (src/ui) over local HTTP,
//   2. opens the main application window and points it at that server,
//   3. installs the native application menu and forwards menu clicks to the UI,
//   4. exposes a couple of host functions to the webview through bindings.
//
// Runtime APIs used here come from the Deno desktop runtime — see
// https://docs.deno.com/runtime/desktop/ (Deno.serve, Deno.BrowserWindow,
// win.setApplicationMenu / menuclick, win.bind).

import { serveDir } from "@std/http/file-server";

const UI_ROOT = "src/ui";

// 1. Serve the UI. `deno desktop` selects a loopback port and exposes it via
// DENO_SERVE_ADDRESS ("tcp:127.0.0.1:<port>"); Deno.serve() binds to that
// address regardless of any port passed in code.
Deno.serve((req) => serveDir(req, { fsRoot: UI_ROOT, quiet: true }));

const address = Deno.env.get("DENO_SERVE_ADDRESS") ?? "tcp:127.0.0.1:0";
const port = Number(address.split(":").at(-1));

// 2. The runtime creates an implicit initial window; the first BrowserWindow
// construction adopts it. Navigate it to the local server.
const win = new Deno.BrowserWindow({
  title: "OpenHWP",
  width: 1100,
  height: 800,
});
win.navigate(`http://127.0.0.1:${port}`);

// 3. Native application menu. Items with an `id` emit `menuclick`; `role` items
// are handled by the OS and do not.
const menu: Deno.MenuItem[] = [
  {
    submenu: {
      label: "File",
      items: [
        { item: { label: "Open…", id: "open", accelerator: "CmdOrCtrl+O", enabled: true } },
        { item: { label: "Save", id: "save", accelerator: "CmdOrCtrl+S", enabled: true } },
        {
          item: {
            label: "Save As…",
            id: "save-as",
            accelerator: "CmdOrCtrl+Shift+S",
            enabled: true,
          },
        },
        "separator",
        { role: { role: "quit" } },
      ],
    },
  },
  {
    submenu: {
      label: "Edit",
      items: [
        { role: { role: "undo" } },
        { role: { role: "redo" } },
        "separator",
        { role: { role: "cut" } },
        { role: { role: "copy" } },
        { role: { role: "paste" } },
        { role: { role: "selectAll" } },
      ],
    },
  },
  {
    submenu: {
      label: "View",
      items: [
        { item: { label: "Reload", id: "reload", accelerator: "CmdOrCtrl+R", enabled: true } },
        { item: { label: "Toggle DevTools", id: "devtools", accelerator: "F12", enabled: true } },
      ],
    },
  },
];

win.setApplicationMenu(menu);

win.addEventListener("menuclick", (event) => {
  switch (event.detail.id) {
    case "reload":
      win.reload();
      break;
    case "devtools":
      win.openDevtools();
      break;
    // Document actions run in the webview (the File System Access API must be
    // invoked there). Forward them; the UI exposes `globalThis.openhwp.onMenu`.
    case "open":
    case "save":
    case "save-as":
      void win.executeJs(`globalThis.openhwp?.onMenu(${JSON.stringify(event.detail.id)})`);
      break;
  }
});

// 4. Host bindings, callable from the webview as `bindings.<name>(...)`. Kept
// minimal — file I/O happens in the webview via the File System Access API. The
// handler returns a Promise (the binding signature expects one).
win.bind("hostInfo", () =>
  Promise.resolve({
    denoVersion: Deno.version.deno,
    platform: Deno.build.os,
  }));
