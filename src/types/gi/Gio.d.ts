declare module "gi://Gio" {
  namespace Gio {
    interface Settings {
      new(schema_id: string): Settings;
      get_string(key: string): string;
      get_int(key: string): number;
      get_boolean(key: string): boolean;
      set_string(key: string, value: string): boolean;
      set_int(key: string, value: number): boolean;
      set_boolean(key: string, value: boolean): boolean;
      connect(signal: string, callback: Function): number;
      disconnect(id: number): void;
    }

    interface Subprocess {
      new(argv: string[], flags: SubprocessFlags): Subprocess;
      communicate_utf8_async(stdin_buf: string | null, cancellable: Cancellable | null, callback: Function): void;
      force_exit(): void;
      get_exit_status(): number;
      send_signal(signal_num: number): void;
      wait_async(cancellable: Cancellable | null, callback: Function): void;
    }

    interface Cancellable {
      new(): Cancellable;
      cancel(): void;
      is_cancelled(): boolean;
    }

    enum SubprocessFlags {
      NONE = 0,
      STDIN_PIPE = 1,
      STDIN_INHERIT = 2,
      STDOUT_PIPE = 4,
      STDOUT_SILENCE = 8,
      STDERR_PIPE = 16,
      STDERR_SILENCE = 32,
      STDERR_MERGE = 64,
    }

    interface File {
      new_for_path(path: string): File;
      get_path(): string;
      query_exists(cancellable?: Cancellable | null): boolean;
      query_info_async(
        attributes: string,
        flags: FileQueryInfoFlags,
        io_priority: number,
        cancellable: Cancellable | null,
        callback: Function
      ): void;
    }

    namespace File {
      function new_for_path(path: string): File;
    }

    function icon_new_for_string(str: string): any;

    enum FileCreateFlags {
      NONE = 0,
      PRIVATE = 1,
      REPLACE_DESTINATION = 2,
    }

    enum FileQueryInfoFlags {
      NONE = 0,
      NOFOLLOW_SYMLINKS = 1,
    }
  }

  export = Gio;
}