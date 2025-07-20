/**
 * Tests for uiUtils.js module
 */

// Mock the GI imports before importing the module
jest.mock('gi://Meta', () => ({
  Cursor: {
    DEFAULT: 'default',
    POINTING_HAND: 'pointer',
  },
}), { virtual: true });

import { createButtonStyle, addHandCursorToButton } from '../../../src/lib/uiUtils.js';
import { COLORS, STYLES } from '../../../src/lib/constants.js';

describe('UI Utils Module', () => {
  describe('createButtonStyle', () => {
    test('should create button style with normal and hover states', () => {
      const style = createButtonStyle('#ff0000', '#00ff00');
      
      expect(style).toHaveProperty('normal');
      expect(style).toHaveProperty('hover');
      expect(style.normal).toContain('background-color: #ff0000');
      expect(style.hover).toContain('background-color: #00ff00');
    });

    test('should include base button styles', () => {
      const style = createButtonStyle('#123456', '#654321');
      
      expect(style.normal).toContain(STYLES.BUTTON_BASE);
      expect(style.hover).toContain(STYLES.BUTTON_BASE);
    });

    test('should include transform scale on hover', () => {
      const style = createButtonStyle('#123456', '#654321');
      
      expect(style.hover).toContain('transform: scale(1.05)');
    });
  });

  describe('addHandCursorToButton', () => {
    let mockButton;

    beforeEach(() => {
      mockButton = {
        connect: jest.fn(),
      };
    });

    test('should add enter and leave event handlers', () => {
      addHandCursorToButton(mockButton);
      
      expect(mockButton.connect).toHaveBeenCalledWith('enter-event', expect.any(Function));
      expect(mockButton.connect).toHaveBeenCalledWith('leave-event', expect.any(Function));
      expect(mockButton.connect).toHaveBeenCalledTimes(2);
    });

    test('should set cursor to pointing hand on enter', () => {
      addHandCursorToButton(mockButton);
      
      const enterHandler = mockButton.connect.mock.calls[0][1];
      enterHandler();
      
      expect(global.display.set_cursor).toHaveBeenCalledWith('pointer');
    });

    test('should reset cursor to default on leave', () => {
      addHandCursorToButton(mockButton);
      
      const leaveHandler = mockButton.connect.mock.calls[1][1];
      leaveHandler();
      
      expect(global.display.set_cursor).toHaveBeenCalledWith('default');
    });
  });
});