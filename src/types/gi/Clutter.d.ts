declare module "gi://Clutter" {
  namespace Clutter {
    interface Actor {
      connect(signal: string, callback: Function): number;
      disconnect(id: number): void;
      show(): void;
      hide(): void;
      destroy(): void;
      add_child(child: Actor): void;
      remove_child(child: Actor): void;
      get_parent(): Actor | null;
      set_reactive(reactive: boolean): void;
      get_reactive(): boolean;
      grab_key_focus(): void;
    }

    const EVENT_STOP: boolean;
    const EVENT_PROPAGATE: boolean;

    enum EventType {
      KEY_PRESS = 0,
      KEY_RELEASE = 1,
      BUTTON_PRESS = 2,
      BUTTON_RELEASE = 3,
      MOTION = 4,
      ENTER = 5,
      LEAVE = 6,
    }

    interface Event {
      type(): EventType;
      get_key_symbol(): number;
      get_key_code(): number;
      get_state(): number;
    }

    enum ActorAlign {
      FILL = 0,
      START = 1,
      CENTER = 2,
      END = 3,
    }
  }

  export = Clutter;
}