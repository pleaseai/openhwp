// Minimal ambient declarations for the Deno desktop runtime APIs that main.ts
// uses. `deno desktop` provides these globals at build/run time, but they are
// not part of the default Deno type library, so this stopgap lets `deno check`
// and editors resolve them. Replace with the official types once they ship.
//
// Scope: only the subset used by this project, transcribed from
// https://docs.deno.com/runtime/desktop/ (windows, menus, bindings).

declare namespace Deno {
  export interface BrowserWindowOptions {
    title?: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    resizable?: boolean;
    alwaysOnTop?: boolean;
    frameless?: boolean;
    noActivate?: boolean;
    transparentTitlebar?: boolean;
  }

  export type MenuItem =
    | { item: { label: string; id?: string; accelerator?: string; enabled: boolean } }
    | { submenu: { label: string; items: MenuItem[] } }
    | "separator"
    | { role: { role: string } };

  export interface MenuClickDetail {
    id?: string;
  }

  export class BrowserWindow extends EventTarget {
    constructor(options?: BrowserWindowOptions);
    navigate(url: string): void;
    reload(): void;
    show(): void;
    hide(): void;
    focus(): void;
    close(): void;
    openDevtools(): void;
    executeJs(code: string): Promise<unknown>;
    setApplicationMenu(menu: MenuItem[]): void;
    bind(name: string, handler: (...args: unknown[]) => unknown): void;
    unbind(name: string): void;
    addEventListener(
      type: "menuclick",
      listener: (event: CustomEvent<MenuClickDetail>) => void,
    ): void;
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void;
  }
}
