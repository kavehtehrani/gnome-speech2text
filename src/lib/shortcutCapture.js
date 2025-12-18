import Clutter from "gi://Clutter";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { COLORS, STYLES } from "./constants.js";
import { createCloseButton, createHeaderLayout } from "./buttonUtils.js";
import { createStyledLabel, createHoverButton } from "./uiUtils.js";
import { cleanupModal } from "./resourceUtils.js";

export class ShortcutCapture {
  constructor() {
    this.overlay = null;
    this.captureWindow = null;
    this.keyPressHandler = null;
    this.keyReleaseHandler = null;
    this.clickHandler = null;
    this.callback = null;
  }

  capture(callback) {
    this.callback = callback;

    // Create modal overlay FIRST (same pattern as other dialogs)
    this.overlay = new St.Widget({
      style: `background-color: ${COLORS.TRANSPARENT_BLACK_70};`,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    // Create a modal dialog to capture new shortcut
    this.captureWindow = new St.BoxLayout({
      style_class: "capture-shortcut-window",
      vertical: true,
      style: `
        background-color: rgba(20, 20, 20, 0.95);
        border-radius: 12px;
        padding: 24px;
        min-width: 400px;
        border: ${STYLES.DIALOG_BORDER};
      `,
      x_align: Clutter.ActorAlign.CENTER,
      y_align: Clutter.ActorAlign.CENTER,
    });

    // Header with close button (matching other modals)
    const titleContainer = new St.BoxLayout({
      vertical: false,
      style: "spacing: 10px;",
      x_align: Clutter.ActorAlign.START,
      x_expand: true,
    });
    const titleIcon = createStyledLabel("⌨️", "icon", "font-size: 24px;");
    const titleLabel = createStyledLabel("Set Keyboard Shortcut", "subtitle");
    titleContainer.add_child(titleIcon);
    titleContainer.add_child(titleLabel);

    this.closeButton = createCloseButton(28);
    this.closeButton.connect("clicked", () => {
      this._cancel();
    });

    const headerBox = createHeaderLayout(titleContainer, this.closeButton);
    this.captureWindow.add_child(headerBox);

    // Instructions
    const instructionLabel = createStyledLabel(
      "Press the key combination you want to use",
      "normal",
      `color: ${COLORS.LIGHT_GRAY}; margin-top: 15px; margin-bottom: 5px;`
    );
    const hintLabel = createStyledLabel(
      "Use modifier keys (Ctrl, Alt, Shift, Super) + a letter or key",
      "description"
    );

    this.captureWindow.add_child(instructionLabel);
    this.captureWindow.add_child(hintLabel);

    this.overlay.add_child(this.captureWindow);

    const monitor = Main.layoutManager.primaryMonitor;
    this.overlay.set_position(monitor.x, monitor.y);
    this.overlay.set_size(monitor.width, monitor.height);

    Main.layoutManager.addTopChrome(this.overlay);

    // State tracking for modifier keys
    let modifierState = {
      control: false,
      shift: false,
      alt: false,
      super: false,
    };

    // Status display
    const statusLabel = createStyledLabel(
      "Waiting for key combination...",
      "normal",
      `
        color: ${COLORS.WARNING};
        font-size: 14px;
        margin-top: 15px;
        background-color: rgba(255, 140, 0, 0.1);
        padding: 10px 15px;
        border-radius: 6px;
        border: 1px solid rgba(255, 140, 0, 0.3);
      `
    );
    this.captureWindow.add_child(statusLabel);

    // Cancel button
    const buttonBox = new St.BoxLayout({
      vertical: false,
      style: "margin-top: 20px;",
      x_align: Clutter.ActorAlign.CENTER,
    });
    const cancelButton = createHoverButton(
      "Cancel",
      COLORS.SECONDARY,
      COLORS.DANGER
    );
    cancelButton.connect("clicked", () => {
      this._cancel();
    });
    buttonBox.add_child(cancelButton);
    this.captureWindow.add_child(buttonBox);

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

    // Modal overlay click handler (close on backdrop click)
    this.clickHandler = this.overlay.connect(
      "button-press-event",
      (actor, event) => {
        try {
          if (event.get_source() === this.overlay) {
            this._cancel();
            return Clutter.EVENT_STOP;
          }
          return Clutter.EVENT_PROPAGATE;
        } catch {
          return Clutter.EVENT_STOP;
        }
      }
    );

    // Capture keyboard input with better modifier handling
    this.keyPressHandler = this.overlay.connect(
      "key-press-event",
      (actor, event) => {
        const keyval = event.get_key_symbol();
        const keyName = Clutter.keyval_name(keyval);

        if (keyval === Clutter.KEY_Escape) {
          this._cancel();
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
          this._complete(shortcut);
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

  _cancel() {
    const cb = this.callback;
    this.cleanup();
    if (cb) cb(null);
  }

  _complete(shortcut) {
    const cb = this.callback;
    this.cleanup();
    if (cb) cb(shortcut);
  }

  cleanup() {
    if (this.overlay) {
      cleanupModal(this.overlay, {
        keyPressHandler: this.keyPressHandler,
        keyReleaseHandler: this.keyReleaseHandler,
        clickHandler: this.clickHandler,
      });
      this.overlay = null;
      this.captureWindow = null;
      this.keyPressHandler = null;
      this.keyReleaseHandler = null;
      this.clickHandler = null;
    }
    this.callback = null;
  }
}
