/**
 * Tests for uiUtils.ts module
 */

// Imports are automatically mocked via moduleNameMapper

import { createButtonStyle, addHandCursorToButton, ButtonStyle } from '../../../src/lib/uiUtils.ts';
import { COLORS, STYLES } from '../../../src/lib/constants.ts';

// Define mock button interface for testing
interface MockButton {
  connect: jest.Mock;
}

describe('UI Utils Module', () => {
  describe('createButtonStyle', () => {
    test('should create button style with normal and hover states', () => {
      const style: ButtonStyle = createButtonStyle('#ff0000', '#00ff00');
      
      expect(style).toHaveProperty('normal');
      expect(style).toHaveProperty('hover');
      expect(style.normal).toContain('background-color: #ff0000');
      expect(style.hover).toContain('background-color: #00ff00');
    });

    test('should include base button styles', () => {
      const style: ButtonStyle = createButtonStyle('#123456', '#654321');
      
      expect(style.normal).toContain(STYLES.BUTTON_BASE);
      expect(style.hover).toContain(STYLES.BUTTON_BASE);
    });

    test('should include transform scale on hover', () => {
      const style: ButtonStyle = createButtonStyle('#123456', '#654321');
      
      expect(style.hover).toContain('transform: scale(1.05)');
    });
  });

  describe('addHandCursorToButton', () => {
    let mockButton: MockButton;

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
      
      const enterHandler: () => void = mockButton.connect.mock.calls[0][1];
      enterHandler();
      
      expect(global.display.set_cursor).toHaveBeenCalledWith('pointer');
    });

    test('should reset cursor to default on leave', () => {
      addHandCursorToButton(mockButton);
      
      const leaveHandler: () => void = mockButton.connect.mock.calls[1][1];
      leaveHandler();
      
      expect(global.display.set_cursor).toHaveBeenCalledWith('default');
    });
  });
});