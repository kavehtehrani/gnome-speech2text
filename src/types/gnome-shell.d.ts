declare module "resource:///org/gnome/shell/ui/main.js" {
  export interface Panel {
    addToStatusArea(role: string, indicator: any, position?: number, box?: string): void;
  }

  export interface LayoutManager {
    addChrome(actor: any, options?: any): void;
    addTopChrome(actor: any, options?: any): void;
    removeChrome(actor: any): void;
    primaryMonitor: any;
    currentMonitor: any;
  }

  export interface WmInterface {
    addKeybinding(
      name: string,
      settings: any,
      flags: any,
      modes: any,
      handler: Function
    ): number;
    removeKeybinding(name: string): void;
  }

  export const panel: Panel;
  export const layoutManager: LayoutManager;
  export const wm: WmInterface;
  export const overview: any;
  export const messageTray: any;
  export function notify(title: string, message?: string): void;
}

declare module "resource:///org/gnome/shell/ui/panelMenu.js" {
  export class Button {
    constructor(menuAlignment?: number, nameText?: string, dontCreateMenu?: boolean);
    menu: any;
    connect(signal: string, callback: Function): number;
    disconnect(id: number): void;
    destroy(): void;
    add_child(actor: any): void;
    remove_child(actor: any): void;
    set_reactive(reactive: boolean): void;
    vfunc_event(event: any): boolean;
  }

  export class SystemIndicator extends Button {}
}

declare module "resource:///org/gnome/shell/ui/popupMenu.js" {
  export class PopupMenuItem {
    constructor(text: string, params?: any);
    connect(signal: string, callback: Function): number;
    label: any;
    destroy(): void;
  }

  export class PopupSeparatorMenuItem {
    constructor(text?: string);
    destroy(): void;
  }

  export class PopupSubMenuMenuItem extends PopupMenuItem {
    constructor(text: string, wantIcon?: boolean);
    menu: PopupSubMenu;
  }

  export class PopupSubMenu {
    addMenuItem(menuItem: any, position?: number): void;
    removeAll(): void;
  }

  export class PopupMenuManager {
    constructor(owner: any, grabParams?: any);
    addMenu(menu: any, position?: number): void;
    removeMenu(menu: any): void;
  }
}

declare module "resource:///org/gnome/shell/extensions/extension.js" {
  export class Extension {
    constructor(metadata: any);
    metadata: any;
    uuid: string;
    dir: any;
    path: string;
    
    enable(): void;
    disable(): void;
    getSettings(schema?: string): any;
  }
}

declare global {
  const global: any;
  const imports: any;
  const log: (message: string) => void;
  const logError: (error: any, message?: string) => void;
  const Main: typeof import("resource:///org/gnome/shell/ui/main.js");
  const PanelMenu: typeof import("resource:///org/gnome/shell/ui/panelMenu.js");
  const PopupMenu: typeof import("resource:///org/gnome/shell/ui/popupMenu.js");
}