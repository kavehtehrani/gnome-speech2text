export class Extension {
  constructor(metadata) {
    this.metadata = metadata;
    this.uuid = metadata.uuid;
    this.dir = { get_path: () => '/mock/extension/path' };
    this.path = '/mock/extension/path';
  }
  
  enable() {}
  disable() {}
  
  getSettings(schema) {
    return {
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
    };
  }
}