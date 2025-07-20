declare module "gi://Shell" {
  namespace Shell {
    interface Global {
      stage: any;
      display: any;
      screen: any;
      get_current_time(): number;
      begin_modal(timestamp?: number, options?: number): boolean;
      end_modal(timestamp?: number): void;
    }

    interface KeyBindingMode {
      NORMAL: number;
      OVERVIEW: number;
      LOCK_SCREEN: number;
      UNLOCK_SCREEN: number;
      LOGIN_SCREEN: number;
      MESSAGE_TRAY: number;
      SYSTEM_MODAL: number;
      LOOKING_GLASS: number;
      POPUP: number;
      ALL: number;
    }

    interface AppSystem {
      get_default(): AppSystem;
      lookup_app(id: string): App | null;
    }

    interface App {
      activate(): void;
      get_name(): string;
      get_id(): string;
    }
  }

  export = Shell;
}