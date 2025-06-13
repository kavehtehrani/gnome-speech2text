import Clutter from "gi://Clutter";
import Meta from "gi://Meta";
import St from "gi://St";
import { COLORS, STYLES } from "./constants.js";

// Helper function to create button styles
export function createButtonStyle(baseColor, hoverColor) {
  return {
    normal: `
      background-color: ${baseColor};
      ${STYLES.BUTTON_BASE}
    `,
    hover: `
      background-color: ${hoverColor};
      ${STYLES.BUTTON_BASE}
      transform: scale(1.05);
    `,
  };
}

// Helper function to add hand cursor on button hover
export function addHandCursorToButton(button) {
  button.connect("enter-event", () => {
    global.display.set_cursor(Meta.Cursor.POINTING_HAND);
  });

  button.connect("leave-event", () => {
    global.display.set_cursor(Meta.Cursor.DEFAULT);
  });
}

// Helper function to create a button with hover effects
export function createHoverButton(label, baseColor, hoverColor) {
  let styles = createButtonStyle(baseColor, hoverColor);
  let button = new St.Button({
    label: label,
    style: styles.normal,
    reactive: true,
    can_focus: true,
    track_hover: true,
  });

  button.connect("enter-event", () => {
    button.set_style(styles.hover);
  });

  button.connect("leave-event", () => {
    button.set_style(styles.normal);
  });

  // Add hand cursor effect
  addHandCursorToButton(button);

  return button;
}

// Create a simple text button with hover effects (no background style)
export function createTextButton(label, normalColor, hoverColor, options = {}) {
  const baseStyle = `
    font-size: ${options.fontSize || "14px"};
    padding: ${options.padding || "8px"};
    border-radius: 4px;
    transition: all 0.2s ease;
  `;

  let button = new St.Button({
    label: label,
    style: `
      color: ${normalColor};
      ${baseStyle}
      ${options.extraStyle || ""}
    `,
    reactive: true,
    can_focus: true,
    track_hover: true,
    ...(options.buttonProps || {}),
  });

  // Add hover effects
  button.connect("enter-event", () => {
    button.set_style(`
      color: ${hoverColor};
      ${baseStyle}
      ${options.hoverExtraStyle || options.extraStyle || ""}
    `);
  });

  button.connect("leave-event", () => {
    button.set_style(`
      color: ${normalColor};
      ${baseStyle}
      ${options.extraStyle || ""}
    `);
  });

  // Add hand cursor effect
  addHandCursorToButton(button);

  return button;
}

// Create a label with predefined styles
export function createStyledLabel(text, style = "normal", customStyle = "") {
  const styles = {
    title: `font-size: 20px; font-weight: bold; color: ${COLORS.WHITE};`,
    subtitle: `font-size: 18px; font-weight: bold; color: ${COLORS.WHITE}; margin-bottom: 10px;`,
    description: `font-size: 14px; color: ${COLORS.LIGHT_GRAY}; margin-bottom: 15px;`,
    normal: `font-size: 14px; color: ${COLORS.WHITE};`,
    small: `font-size: 12px; color: ${COLORS.DARK_GRAY};`,
    icon: `font-size: 28px; margin-right: 8px;`,
  };

  return new St.Label({
    text: text,
    style: `${styles[style] || styles.normal} ${customStyle}`,
  });
}

// Create a vertical box layout with standard spacing
export function createVerticalBox(spacing = "15px", marginBottom = "20px") {
  return new St.BoxLayout({
    vertical: true,
    style: `spacing: ${spacing}; margin-bottom: ${marginBottom};`,
  });
}

// Create a horizontal box layout with standard spacing
export function createHorizontalBox(spacing = "15px", marginBottom = "15px") {
  return new St.BoxLayout({
    vertical: false,
    style: `spacing: ${spacing}; margin-bottom: ${marginBottom};`,
  });
}

// Create a separator line
export function createSeparator() {
  return new St.Widget({
    style: "background-color: #444; height: 1px; margin: 20px 0;",
  });
}
