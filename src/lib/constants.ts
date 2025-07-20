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
} as const;

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
} as const;

export type ColorsType = typeof COLORS;
export type StylesType = typeof STYLES;
