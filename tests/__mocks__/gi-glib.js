export default {
  spawn_async: jest.fn(),
  spawn_command_line_async: jest.fn(),
  spawn_command_line_sync: jest.fn(() => [true, 'mock output']),
  timeout_add: jest.fn(),
  source_remove: jest.fn(),
  child_watch_add: jest.fn(),
  spawn_close_pid: jest.fn(),
  get_tmp_dir: jest.fn(() => '/tmp'),
  build_filenamev: jest.fn((paths) => paths.join('/')),
  file_test: jest.fn(() => true),
  unlink: jest.fn(),
  SpawnFlags: {
    DEFAULT: 0,
    SEARCH_PATH: 4,
    DO_NOT_REAP_CHILD: 2,
  },
  FileTest: {
    IS_REGULAR: 1,
    IS_DIR: 4,
    EXISTS: 16,
  },
  PRIORITY_DEFAULT: 0,
};