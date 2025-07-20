declare module "gi://Meta" {
  namespace Meta {
    function is_wayland_compositor(): boolean;
    
    interface KeyBinding {
      get_name(): string;
      get_modifiers(): number;
      get_mask(): number;
    }

    enum KeyBindingFlags {
      NONE = 0,
      PER_WINDOW = 1,
      BUILTIN = 2,
      REVERSES = 4,
      IS_REVERSED = 8,
      NON_MASKABLE = 16,
      IGNORE_AUTOREPEAT = 32,
    }

    enum KeyBindingAction {
      NONE = 0,
      WORKSPACE_1 = 1,
      WORKSPACE_2 = 2,
      // ... more actions
    }

    interface Display {
      connect(signal: string, callback: Function): number;
      disconnect(id: number): void;
      get_focus_window(): Window | null;
    }

    interface Window {
      get_title(): string;
      get_wm_class(): string;
      has_focus(): boolean;
      focus(timestamp: number): void;
      activate(timestamp: number): void;
    }

    enum Cursor {
      DEFAULT = 0,
      NORTH_RESIZE = 1,
      SOUTH_RESIZE = 2,
      WEST_RESIZE = 3,
      EAST_RESIZE = 4,
      SE_RESIZE = 5,
      SW_RESIZE = 6,
      NE_RESIZE = 7,
      NW_RESIZE = 8,
      MOVE_OR_RESIZE_WINDOW = 9,
      BUSY = 10,
      DND_IN_DRAG = 11,
      DND_MOVE = 12,
      DND_COPY = 13,
      DND_UNSUPPORTED_TARGET = 14,
      POINTING_HAND = 15,
      CROSSHAIR = 16,
      IBEAM = 17,
    }
  }

  export = Meta;
}