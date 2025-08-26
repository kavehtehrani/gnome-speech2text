import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { COLORS, STYLES } from "./constants.js";
import { createStyledLabel } from "./uiUtils.js";
import { cleanupModal } from "./resourceUtils.js";

export class ShortcutCapture {
  constructor() {
    this.overlay = null;
    this.captureWindow = null;
    this.keyPressHandler = null;
    this.keyReleaseHandler = null;
    this.centerTimeoutId = null;
  }

  capture(callback) {
    // Create a modal dialog to capture new shortcut
    this.captureWindow = new St.BoxLayout({
      style_class: "capture-shortcut-window",
      vertical: true,
      style: `
        background-color: rgba(20, 20, 20, 0.95);
        border-radius: 12px;
        padding: 30px;
        min-width: 400px;
        border: ${STYLES.DIALOG_BORDER};
      `,
    });

    let instructionLabel = createStyledLabel(
      "Press the key combination you want to use",
      "subtitle"
    );
    let hintLabel = createStyledLabel("Press Escape to cancel", "description");

    this.captureWindow.add_child(instructionLabel);
    this.captureWindow.add_child(hintLabel);

    // Create modal overlay
    this.overlay = new St.Widget({
      style: `background-color: ${COLORS.TRANSPARENT_BLACK_70};`,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    this.overlay.add_child(this.captureWindow);

    let monitor = Main.layoutManager.primaryMonitor;
    this.overlay.set_size(monitor.width, monitor.height);
    this.overlay.set_position(monitor.x, monitor.y);

    // Center the capture window
    if (this.centerTimeoutId) {
      GLib.Source.remove(this.centerTimeoutId);
    }
    this.centerTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
      let [windowWidth, windowHeight] = this.captureWindow.get_size();
      if (windowWidth === 0) windowWidth = 400;
      if (windowHeight === 0) windowHeight = 200;

      this.captureWindow.set_position(
        (monitor.width - windowWidth) / 2,
        (monitor.height - windowHeight) / 2
      );
      this.centerTimeoutId = null;
      return false;
    });

    Main.layoutManager.addTopChrome(this.overlay);

    // State tracking for modifier keys
    let modifierState = {
      control: false,
      shift: false,
      alt: false,
      super: false,
    };

    let statusLabel = createStyledLabel(
      "Waiting for key combination...",
      "normal",
      `color: ${COLORS.LIGHT_GRAY}; font-size: 14px; margin-top: 10px;`
    );
    this.captureWindow.add_child(statusLabel);

    // Function to update the display
    const updateDisplay = () => {
      let parts = [];
      if (modifierState.control) parts.push("Ctrl");
      if (modifierState.shift) parts.push("Shift");
      if (modifierState.alt) parts.push("Alt");
      if (modifierState.super) parts.push("Super");

      let display =
        parts.length > 0 ? parts.join(" + ") : "Waiting for key combination...";
      statusLabel.set_text(display);
    };

    // Capture keyboard input with better modifier handling
    this.keyPressHandler = this.overlay.connect(
      "key-press-event",
      (actor, event) => {
        const keyval = event.get_key_symbol();
        const keyName = Clutter.keyval_name(keyval);

        if (keyval === Clutter.KEY_Escape) {
          // Cancel capture
          this.cleanup();
          callback(null);
          return Clutter.EVENT_STOP;
        }

        // Update modifier state based on actual key presses
        if (keyName === "Control_L" || keyName === "Control_R") {
          modifierState.control = true;
          updateDisplay();
          return Clutter.EVENT_STOP;
        }
        if (keyName === "Shift_L" || keyName === "Shift_R") {
          modifierState.shift = true;
          updateDisplay();
          return Clutter.EVENT_STOP;
        }
        if (keyName === "Alt_L" || keyName === "Alt_R") {
          modifierState.alt = true;
          updateDisplay();
          return Clutter.EVENT_STOP;
        }
        if (keyName === "Super_L" || keyName === "Super_R") {
          modifierState.super = true;
          updateDisplay();
          return Clutter.EVENT_STOP;
        }

        // If it's a regular key (not just a modifier), complete the shortcut
        if (
          keyName &&
          !keyName.includes("_L") &&
          !keyName.includes("_R") &&
          !keyName.startsWith("Control") &&
          !keyName.startsWith("Shift") &&
          !keyName.startsWith("Alt") &&
          !keyName.startsWith("Super")
        ) {
          // Build final shortcut string
          let shortcut = "";
          if (modifierState.control) shortcut += "<Control>";
          if (modifierState.shift) shortcut += "<Shift>";
          if (modifierState.alt) shortcut += "<Alt>";
          if (modifierState.super) shortcut += "<Super>";
          shortcut += keyName.toLowerCase();

          // Clean up and return result
          this.cleanup();
          callback(shortcut);
          return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_STOP;
      }
    );

    // Also handle key release to reset modifier state if needed
    this.keyReleaseHandler = this.overlay.connect("key-release-event", () => {
      // Don't reset modifiers on release - let user build combination
      // This allows holding multiple modifiers before pressing the final key
      return Clutter.EVENT_STOP;
    });

    this.overlay.grab_key_focus();
    this.overlay.set_reactive(true);
  }

  cleanup() {
    // Clean up timeout sources
    if (this.centerTimeoutId) {
      GLib.Source.remove(this.centerTimeoutId);
      this.centerTimeoutId = null;
    }

    if (this.overlay) {
      cleanupModal(this.overlay, {
        keyPressHandler: this.keyPressHandler,
        keyReleaseHandler: this.keyReleaseHandler,
      });
      this.overlay = null;
      this.captureWindow = null;
      this.keyPressHandler = null;
      this.keyReleaseHandler = null;
    }
  }
}
