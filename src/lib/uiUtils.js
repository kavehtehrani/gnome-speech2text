import Meta from "gi://Meta";
import St from "gi://St";
import * as Config from "resource:///org/gnome/shell/misc/config.js";
import { COLORS, STYLES } from "./constants.js";
import { log } from "./resourceUtils.js";

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
  // Check if we're on a problematic GNOME version/platform
  const isGNOME48Plus = (() => {
    try {
      const version = Config.PACKAGE_VERSION;
      const major = parseInt(version.split(".")[0], 10);
      return major >= 48;
    } catch (_e) {
      return true; // Assume newer version if detection fails
    }
  })();

  const isWayland = Meta.is_wayland_compositor();

  // Disable cursor changes on GNOME 48+ Wayland due to crashes
  if (isGNOME48Plus && isWayland) {
    log.debug("Skipping cursor changes on GNOME 48+ Wayland for stability");
    return;
  }

  button.connect("enter-event", () => {
    try {
      // Multiple safety checks to prevent crashes
      if (
        global.display &&
        global.display.set_cursor &&
        typeof global.display.set_cursor === "function" &&
        Meta.Cursor &&
        Meta.Cursor.POINTING_HAND !== undefined
      ) {
        global.display.set_cursor(Meta.Cursor.POINTING_HAND);
      }
    } catch (error) {
      log.warn("Failed to set pointing hand cursor:", error.message);
      // Continue without cursor change if it fails
    }
  });

  button.connect("leave-event", () => {
    try {
      // Multiple safety checks to prevent crashes
      if (
        global.display &&
        global.display.set_cursor &&
        typeof global.display.set_cursor === "function" &&
        Meta.Cursor &&
        Meta.Cursor.DEFAULT !== undefined
      ) {
        global.display.set_cursor(Meta.Cursor.DEFAULT);
      }
    } catch (error) {
      log.warn("Failed to set default cursor:", error.message);
      // Continue without cursor change if it fails
    }
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

  // Add hand cursor effect (safe for GNOME 48+ Wayland)
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
export function createVerticalBox(
  spacing = "5px",
  marginTop = "5px",
  marginBottom = "5px"
) {
  return new St.BoxLayout({
    vertical: true,
    style: `spacing: ${spacing}; margin-top: ${marginTop}; margin-bottom: ${marginBottom};`,
  });
}

// Create a horizontal box layout with standard spacing
export function createHorizontalBox(spacing = "10px", marginBottom = "10px") {
  return new St.BoxLayout({
    vertical: false,
    style: `spacing: ${spacing}; margin-bottom: ${marginBottom};`,
  });
}

// Create a separator line
export function createSeparator() {
  return new St.Widget({
    style: "background-color: #444; height: 1px; margin: 5px 5px;",
  });
}
