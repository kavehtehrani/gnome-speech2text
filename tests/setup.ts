// Jest setup file for GNOME Shell extension testing

// Extend global type to include our mocks
declare global {
  namespace globalThis {
    var global: any;
    var Main: any;
    var PanelMenu: any;
    var PopupMenu: any;
    var console: any;
    var log: any;
  }
}

// Mock GNOME Shell APIs and globals
global.global = {
  display: {
    set_cursor: jest.fn(),
  },
  screen: {
    get_display: jest.fn(),
  },
  log: jest.fn(),
  logError: jest.fn(),
};

// Mock GNOME Shell modules
global.Main = {
  panel: {
    addToStatusArea: jest.fn(),
  },
  layoutManager: {
    addTopChrome: jest.fn(),
    removeChrome: jest.fn(),
  },
  pushModal: jest.fn(),
  popModal: jest.fn(),
};

global.PanelMenu = {
  Button: jest.fn(),
};

global.PopupMenu = {
  PopupMenuItem: jest.fn(),
  PopupSeparatorMenuItem: jest.fn(),
};

// Mock console methods for testing
global.console = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};

// Mock global log function
global.log = jest.fn();