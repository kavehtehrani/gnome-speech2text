import St from "gi://St";
import Clutter from "gi://Clutter";
import {
  COLORS,
  createButtonStyle,
  createHoverButtonStyle,
} from "./constants.js";

/**
 * Create a circular button with hover effects
 * @param {string} text - Button text
 * @param {number} size - Button size (width and height)
 * @param {string} normalBg - Normal background color
 * @param {string} normalBorder - Normal border color
 * @param {string} hoverBg - Hover background color
 * @param {string} hoverBorder - Hover border color
 * @param {string} fontSize - Font size
 * @returns {St.Button} Configured button
 */
export function createCircularButton(
  text,
  size = 28,
  normalBg = "rgba(108, 117, 125, 0.2)",
  normalBorder = "#6c757d",
  hoverBg = "#6c757d",
  hoverBorder = "#6c757d",
  fontSize = "16px"
) {
  const button = new St.Button({
    style: createButtonStyle(size, size, normalBg, normalBorder, fontSize),
    reactive: true,
    can_focus: true,
  });

  const icon = new St.Label({
    text: text,
    style: `color: white; font-size: ${fontSize}; font-weight: bold; text-align: center;`,
    y_align: Clutter.ActorAlign.CENTER,
  });
  button.add_child(icon);

  // Add hover effects
  const normalStyle = createButtonStyle(
    size,
    size,
    normalBg,
    normalBorder,
    fontSize
  );
  const hoverStyle = createHoverButtonStyle(
    size,
    size,
    hoverBg,
    hoverBorder,
    fontSize
  );

  button.connect("enter-event", () => {
    button.set_style(hoverStyle);
  });

  button.connect("leave-event", () => {
    button.set_style(normalStyle);
  });

  return button;
}

/**
 * Create a close button with standard styling
 * @param {number} size - Button size
 * @returns {St.Button} Configured close button
 */
export function createCloseButton(size = 32) {
  return createCircularButton(
    "×",
    size,
    "rgba(255, 255, 255, 0.1)",
    COLORS.SECONDARY,
    COLORS.DANGER,
    COLORS.DANGER,
    "18px"
  );
}

/**
 * Create increment/decrement buttons
 * @param {string} symbol - "+" or "−"
 * @param {number} size - Button size
 * @returns {St.Button} Configured button
 */
export function createIncrementButton(symbol, size = 28) {
  return createCircularButton(
    symbol,
    size,
    "rgba(108, 117, 125, 0.2)",
    "#6c757d",
    "#6c757d",
    "#6c757d",
    "16px"
  );
}

/**
 * Create a centered layout box
 * @param {boolean} vertical - Whether the layout is vertical
 * @param {string} spacing - Spacing between elements
 * @returns {St.BoxLayout} Configured box layout
 */
export function createCenteredBox(vertical = false, spacing = "8px") {
  return new St.BoxLayout({
    vertical: vertical,
    style: `spacing: ${spacing};`,
    x_align: Clutter.ActorAlign.CENTER,
    y_align: Clutter.ActorAlign.CENTER,
  });
}

/**
 * Create a header layout with title on left and close button on right
 * @param {St.Widget} titleContainer - Container with title elements
 * @param {St.Button} closeButton - Close button
 * @returns {St.BoxLayout} Configured header layout
 */
export function createHeaderLayout(titleContainer, closeButton) {
  const headerBox = new St.BoxLayout({
    vertical: false,
    style: "spacing: 15px;",
    x_align: Clutter.ActorAlign.FILL,
    y_align: Clutter.ActorAlign.CENTER,
    x_expand: true,
  });

  headerBox.add_child(titleContainer);
  headerBox.add_child(closeButton);

  return headerBox;
}
