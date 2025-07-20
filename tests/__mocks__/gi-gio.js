export default {
  Settings: jest.fn().mockImplementation(() => ({
    get_string: jest.fn(),
    get_int: jest.fn(),
    get_boolean: jest.fn(),
    set_string: jest.fn(),
    set_int: jest.fn(),
    set_boolean: jest.fn(),
    get_strv: jest.fn(() => []),
    set_strv: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  })),
  File: {
    new_for_path: jest.fn().mockImplementation(() => ({
      query_exists: jest.fn(() => true),
      query_info: jest.fn(() => ({
        get_attribute_uint32: jest.fn(() => 0o644),
      })),
      set_attribute_uint32: jest.fn(),
      create: jest.fn(),
      replace_contents: jest.fn(),
    })),
  },
  icon_new_for_string: jest.fn(),
  FileCreateFlags: {
    NONE: 0,
    PRIVATE: 1,
  },
  FileQueryInfoFlags: {
    NONE: 0,
  },
  Subprocess: jest.fn(),
  SubprocessFlags: {
    NONE: 0,
    STDIN_PIPE: 1,
    STDOUT_PIPE: 4,
    STDERR_PIPE: 16,
  },
};