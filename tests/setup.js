// Jest setup file for GNOME Shell extension testing

// Mock Node.js module resolution for GI imports
jest.mock('gi://Clutter', () => ({}), { virtual: true });
jest.mock('gi://Gio', () => ({}), { virtual: true });
jest.mock('gi://GLib', () => ({
  spawn_async: jest.fn(),
  spawn_command_line_async: jest.fn(),
  timeout_add: jest.fn(),
  source_remove: jest.fn(),
}), { virtual: true });
jest.mock('gi://Meta', () => ({
  is_wayland_compositor: jest.fn(() => false),
  Cursor: {
    DEFAULT: 'default',
    POINTING_HAND: 'pointer',
  },
}), { virtual: true });
jest.mock('gi://Shell', () => ({}), { virtual: true });
jest.mock('gi://St', () => ({
  Button: jest.fn(),
  Label: jest.fn(),
  BoxLayout: jest.fn(),
  ScrollView: jest.fn(),
}), { virtual: true });

// Mock GNOME Shell resource imports
jest.mock('resource:///org/gnome/shell/ui/main.js', () => ({
  panel: {
    addToStatusArea: jest.fn(),
  },
  layoutManager: {
    addTopChrome: jest.fn(),
    removeChrome: jest.fn(),
  },
  pushModal: jest.fn(),
  popModal: jest.fn(),
}), { virtual: true });

jest.mock('resource:///org/gnome/shell/ui/panelMenu.js', () => ({
  Button: jest.fn(),
}), { virtual: true });

jest.mock('resource:///org/gnome/shell/ui/popupMenu.js', () => ({
  PopupMenuItem: jest.fn(),
  PopupSeparatorMenuItem: jest.fn(),
}), { virtual: true });

jest.mock('resource:///org/gnome/shell/extensions/extension.js', () => ({
  Extension: class MockExtension {
    constructor(metadata) {
      this.metadata = metadata;
    }
  },
}), { virtual: true });

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