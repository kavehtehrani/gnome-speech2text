import Meta from "gi://Meta";
import St from "gi://St";
import { COLORS, STYLES } from "./constants.js";

export interface ButtonStyle {
  normal: string;
  hover: string;
}

export interface TextButtonOptions {
  fontSize?: string;
  padding?: string;
  extraStyle?: string;
  hoverExtraStyle?: string;
  buttonProps?: Record<string, any>;
}

export type LabelStyle = "title" | "subtitle" | "description" | "normal" | "small" | "icon";

// Helper function to create button styles
export function createButtonStyle(baseColor: string, hoverColor: string): ButtonStyle {
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
export function addHandCursorToButton(button: St.Button): void {
  button.connect("enter-event", () => {
    global.display.set_cursor(Meta.Cursor.POINTING_HAND);
  });

  button.connect("leave-event", () => {
    global.display.set_cursor(Meta.Cursor.DEFAULT);
  });
}

// Helper function to create a button with hover effects
export function createHoverButton(label: string, baseColor: string, hoverColor: string): St.Button {
  const styles = createButtonStyle(baseColor, hoverColor);
  const button = new St.Button({
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
export function createTextButton(
  label: string, 
  normalColor: string, 
  hoverColor: string, 
  options: TextButtonOptions = {}
): St.Button {
  const baseStyle = `
    font-size: ${options.fontSize || "14px"};
    padding: ${options.padding || "8px"};
    border-radius: 4px;
    transition: all 0.2s ease;
  `;

  const button = new St.Button({
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
export function createStyledLabel(text: string, style: LabelStyle = "normal", customStyle = ""): St.Label {
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
export function createVerticalBox(
  spacing = "5px",
  marginTop = "5px",
  marginBottom = "5px"
): St.BoxLayout {
  return new St.BoxLayout({
    vertical: true,
    style: `spacing: ${spacing}; margin-top: ${marginTop}; margin-bottom: ${marginBottom};`,
  });
}

// Create a horizontal box layout with standard spacing
export function createHorizontalBox(spacing = "10px", marginBottom = "10px"): St.BoxLayout {
  return new St.BoxLayout({
    vertical: false,
    style: `spacing: ${spacing}; margin-bottom: ${marginBottom};`,
  });
}

// Create a separator line
export function createSeparator(): St.Widget {
  return new St.Widget({
    style: "background-color: #444; height: 1px; margin: 5px 5px;",
  });
}
