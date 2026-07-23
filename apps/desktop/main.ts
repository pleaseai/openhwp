// OpenHWP — Deno desktop host (the native shell).
//
// The shell is intentionally thin: the entire document experience — parsing,
// layout, rendering, EDITING, and saving — lives in the webview, which runs the
// full upstream rhwp-studio editor (built into apps/studio-host/dist). This
// module only:
//   1. serves that studio bundle over local HTTP,
//   2. opens the main window and points it at that server,
//   3. installs a minimal native menu (window/host ops only).
//
// File/Edit are deliberately owned by the studio's own in-app menu bar and
// Ctrl/Cmd+O·S shortcuts: those run *inside* the webview, so the File System
// Access pickers get the transient user activation they require. A native-menu
// → executeJs path would not carry that activation, so native File/Edit
// integration (via a studio override exposing load/save hooks) is a later phase.
//
// Runtime APIs come from the Deno desktop runtime — https://docs.deno.com/runtime/desktop/

import { serveDir } from "@std/http/file-server";
import { fromFileUrl } from "@std/path";

// The studio bundle is produced by `deno task build:studio`
// (scripts/build-studio.ts) into apps/studio-host/dist. Resolve it relative to
// this module so the server works regardless of the current working directory.
const UI_ROOT = fromFileUrl(new URL("../studio-host/dist", import.meta.url));

const server = Deno.serve((req) => serveDir(req, { fsRoot: UI_ROOT, quiet: true }));
if (server.addr.transport !== "tcp") {
  throw new Error(
    `OpenHWP UI server expected a TCP address, got ${server.addr.transport}`,
  );
}
const port = server.addr.port;

const win = new Deno.BrowserWindow({
  title: "OpenHWP",
  width: 1200,
  height: 860,
});
win.navigate(`http://127.0.0.1:${port}`);

// Minimal native menu — window/host operations only. No File/Edit here: the
// studio provides them, and duplicating Cmd+O/S as native accelerators would
// let the OS intercept the keystroke before the webview (and its gesture) sees
// it. Reload/DevTools are host operations handled below without touching the
// webview's activation state.
const menu: Deno.MenuItem[] = [
  {
    submenu: {
      label: "OpenHWP",
      items: [{ role: { role: "quit" } }],
    },
  },
  {
    submenu: {
      label: "View",
      items: [
        {
          item: {
            label: "Reload",
            id: "reload",
            accelerator: "CmdOrCtrl+R",
            enabled: true,
          },
        },
        {
          item: {
            label: "Toggle DevTools",
            id: "devtools",
            accelerator: "F12",
            enabled: true,
          },
        },
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
  }
});

// Host info, callable from the webview as `bindings.hostInfo()`. Returns a
// Promise (the binding signature expects one).
win.bind("hostInfo", () =>
  Promise.resolve({
    denoVersion: Deno.version.deno,
    platform: Deno.build.os,
  }));
