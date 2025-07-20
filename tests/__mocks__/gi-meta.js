export default {
  is_wayland_compositor: jest.fn(() => false),
  Cursor: {
    DEFAULT: 'default',
    POINTING_HAND: 'pointer',
  },
  KeyBindingFlags: {
    NONE: 0,
    PER_WINDOW: 1,
  },
  KeyBindingAction: {
    NONE: 0,
  }
};