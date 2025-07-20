export const panel = {
  addToStatusArea: jest.fn(),
};

export const layoutManager = {
  addTopChrome: jest.fn(),
  removeChrome: jest.fn(),
  addChrome: jest.fn(),
  primaryMonitor: {
    width: 1920,
    height: 1080,
    x: 0,
    y: 0,
  },
};

export const wm = {
  addKeybinding: jest.fn(),
  removeKeybinding: jest.fn(),
};

export const notify = jest.fn();
export const pushModal = jest.fn();
export const popModal = jest.fn();
export const overview = {};
export const messageTray = {};