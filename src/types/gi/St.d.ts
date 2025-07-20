declare module "gi://St" {
  namespace St {
    interface Widget {
      new(properties?: any): Widget;
      add_child(child: Widget): void;
      remove_child(child: Widget): void;
      connect(signal: string, callback: Function): number;
      disconnect(id: number): void;
      show(): void;
      hide(): void;
      destroy(): void;
      set_style(style: string): void;
      get_style(): string;
      set_reactive(reactive: boolean): void;
      grab_key_focus(): void;
      set_position(x: number, y: number): void;
      set_size(width: number, height: number): void;
      get_parent(): Widget | null;
    }

    interface Bin extends Widget {
      new(properties?: any): Bin;
      set_child(child: Widget): void;
      get_child(): Widget | null;
    }

    interface BoxLayout extends Widget {
      new(properties?: any): BoxLayout;
      pack_start(child: Widget, expand?: boolean, x_fill?: boolean, y_fill?: boolean): void;
      pack_end(child: Widget, expand?: boolean, x_fill?: boolean, y_fill?: boolean): void;
    }

    interface Button extends Bin {
      new(properties?: any): Button;
      set_label(text: string): void;
      get_label(): string;
    }

    interface Label extends Widget {
      new(properties?: any): Label;
      set_text(text: string): void;
      get_text(): string;
      set_x_expand(expand: boolean): void;
      set_y_align(align: any): void;
    }

    interface Entry extends Widget {
      new(properties?: any): Entry;
      set_text(text: string): void;
      get_text(): string;
      grab_key_focus(): void;
    }

    interface ScrollView extends Bin {
      new(properties?: any): ScrollView;
    }

    interface Icon extends Widget {
      new(properties?: any): Icon;
      set_icon_name(name: string): void;
      set_icon_size(size: number): void;
    }

    interface ProgressBar extends Widget {
      new(properties?: any): ProgressBar;
      set_value(value: number): void;
    }

    // Constructor functions
    const Widget: {
      new(properties?: any): Widget;
    };
    const Bin: {
      new(properties?: any): Bin;
    };
    const BoxLayout: {
      new(properties?: any): BoxLayout;
    };
    const Button: {
      new(properties?: any): Button;
    };
    const Label: {
      new(properties?: any): Label;
    };
    const Entry: {
      new(properties?: any): Entry;
    };
    const ScrollView: {
      new(properties?: any): ScrollView;
    };
    const Icon: {
      new(properties?: any): Icon;
    };
    const ProgressBar: {
      new(properties?: any): ProgressBar;
    };
  }

  export = St;
}