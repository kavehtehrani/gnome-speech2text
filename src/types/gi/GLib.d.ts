declare module "gi://GLib" {
  namespace GLib {
    function timeout_add(priority: number, interval: number, callback: () => boolean): number;
    function timeout_add_seconds(priority: number, interval: number, callback: () => boolean): number;
    function source_remove(source_id: number): boolean;
    function spawn_async(
      working_directory: string | null,
      argv: string[],
      envp: string[] | null,
      flags: SpawnFlags,
      child_setup: Function | null,
      data: any
    ): [boolean, number];
    function spawn_command_line_async(command_line: string): boolean;
    function spawn_command_line_sync(command_line: string): [boolean, Uint8Array, Uint8Array, number];
    function child_watch_add(priority: number, pid: number, callback: Function): number;
    function spawn_close_pid(pid: number): void;
    function get_home_dir(): string;
    function get_tmp_dir(): string;
    function unlink(filename: string): number;
    function build_filenamev(args: string[]): string;
    function file_test(filename: string, test: FileTest): boolean;

    namespace Source {
      function remove(source_id: number): boolean;
    }

    enum SpawnFlags {
      DEFAULT = 0,
      LEAVE_DESCRIPTORS_OPEN = 1,
      DO_NOT_REAP_CHILD = 2,
      SEARCH_PATH = 4,
      STDOUT_TO_DEV_NULL = 8,
      STDERR_TO_DEV_NULL = 16,
      CHILD_INHERITS_STDIN = 32,
      FILE_AND_ARGV_ZERO = 64,
    }

    enum FileTest {
      IS_REGULAR = 1,
      IS_SYMLINK = 2,
      IS_DIR = 4,
      IS_EXECUTABLE = 8,
      EXISTS = 16,
    }

    const PRIORITY_DEFAULT: number;
    const PRIORITY_HIGH: number;
    const PRIORITY_LOW: number;
  }

  export = GLib;
}