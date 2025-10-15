// Constants for consistent styling and colors
export const COLORS = {
  PRIMARY: "#ff8c00",
  SUCCESS: "#28a745",
  DANGER: "#ff4444",
  SECONDARY: "#666666",
  INFO: "#0066cc",
  WARNING: "#dc3545",
  WHITE: "white",
  LIGHT_GRAY: "#ccc",
  DARK_GRAY: "#888888",
  TRANSPARENT_BLACK_30: "rgba(0, 0, 0, 0.3)",
  TRANSPARENT_BLACK_70: "rgba(0, 0, 0, 0.7)",
  TRANSPARENT_BLACK_85: "rgba(0, 0, 0, 0.85)",
};

export const STYLES = {
  BUTTON_BASE: `
    color: white;
    border-radius: 6px;
    padding: 12px 20px;
    font-size: 14px;
    border: none;
    transition: all 0.2s ease;
  `,
  DIALOG_BORDER: `2px solid ${COLORS.PRIMARY}`,
  DIALOG_PADDING: "30px",
  DIALOG_BORDER_RADIUS: "12px",

  // Common button styles
  CIRCULAR_BUTTON_BASE: `
    border-radius: 50%;
    color: white;
    font-weight: bold;
    text-align: center;
    transition-duration: 200ms;
    reactive: true;
    can_focus: true;
  `,

  // Input/display styles
  INPUT_DISPLAY: `
    text-align: center;
    font-weight: bold;
    font-size: 16px;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid;
  `,

  // Layout styles
  CENTERED_BOX: `
    spacing: 8px;
    x_align: center;
    y_align: center;
  `,
};
