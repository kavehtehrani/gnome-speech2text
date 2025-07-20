export default {
  Global: jest.fn(),
  KeyBindingMode: {
    NORMAL: 1,
    OVERVIEW: 2,
    POPUP: 3,
    ALL: 255,
  },
  AppSystem: {
    get_default: jest.fn(() => ({
      lookup_app: jest.fn(),
    })),
  },
};