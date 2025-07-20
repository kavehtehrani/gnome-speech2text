/**
 * Tests for constants.ts module
 */

import { COLORS, STYLES } from '../../../src/lib/constants.ts';

describe('Constants Module', () => {
  describe('COLORS', () => {
    test('should have all required color constants', () => {
      expect(COLORS.PRIMARY).toBe('#ff8c00');
      expect(COLORS.SUCCESS).toBe('#28a745');
      expect(COLORS.DANGER).toBe('#ff4444');
      expect(COLORS.SECONDARY).toBe('#666666');
      expect(COLORS.INFO).toBe('#0066cc');
      expect(COLORS.WARNING).toBe('#dc3545');
      expect(COLORS.WHITE).toBe('white');
      expect(COLORS.LIGHT_GRAY).toBe('#ccc');
      expect(COLORS.DARK_GRAY).toBe('#888888');
    });

    test('should have transparent color variants', () => {
      expect(COLORS.TRANSPARENT_BLACK_30).toBe('rgba(0, 0, 0, 0.3)');
      expect(COLORS.TRANSPARENT_BLACK_70).toBe('rgba(0, 0, 0, 0.7)');
      expect(COLORS.TRANSPARENT_BLACK_85).toBe('rgba(0, 0, 0, 0.85)');
    });

    test('all colors should be strings', () => {
      Object.values(COLORS).forEach((color: string) => {
        expect(typeof color).toBe('string');
      });
    });
  });

  describe('STYLES', () => {
    test('should have button base style', () => {
      expect(STYLES.BUTTON_BASE).toContain('color: white');
      expect(STYLES.BUTTON_BASE).toContain('border-radius: 6px');
      expect(STYLES.BUTTON_BASE).toContain('padding: 12px 20px');
      expect(STYLES.BUTTON_BASE).toContain('font-size: 14px');
    });

    test('should have dialog styles', () => {
      expect(STYLES.DIALOG_BORDER).toContain(COLORS.PRIMARY);
      expect(STYLES.DIALOG_PADDING).toBe('30px');
      expect(STYLES.DIALOG_BORDER_RADIUS).toBe('12px');
    });

    test('all styles should be strings', () => {
      Object.values(STYLES).forEach((style: string) => {
        expect(typeof style).toBe('string');
      });
    });
  });
});