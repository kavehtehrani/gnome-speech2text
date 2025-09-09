import Clutter from "gi://Clutter";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import { SettingsDialog } from "./settingsDialog.js";
import { ServiceSetupDialog } from "./setupDialog.js";
import { ShortcutCapture } from "./shortcutCapture.js";

export class UIManager {
  constructor(extensionCore) {
    this.extensionCore = extensionCore;
    this.icon = null;
    this.settingsDialog = null;
  }

  initialize() {
    // Create the panel button
    this.icon = new PanelMenu.Button(0.0, "Speech2Text Indicator");

    // Set up the icon
    let icon = new St.Icon({
      icon_name: "microphone-symbolic",
      style_class: "system-status-icon",
    });
    this.icon.add_child(icon);

    // Create popup menu
    this.createPopupMenu();

    // Add click handler for left-click recording toggle
    this._setupClickHandler();

    // Add to panel (remove existing first to avoid conflicts)
    this._addToPanel();
  }

  createPopupMenu() {
    // Settings menu item
    let settingsItem = new PopupMenu.PopupMenuItem("Settings");
    settingsItem.connect("activate", () => {
      this.showSettingsWindow();
    });
    this.icon.menu.addMenuItem(settingsItem);

    // Setup Guide menu item
    let setupItem = new PopupMenu.PopupMenuItem("Setup");
    setupItem.connect("activate", () => {
      this.showServiceSetupDialog("Manual setup guide requested");
    });
    this.icon.menu.addMenuItem(setupItem);
  }

  _setupClickHandler() {
    // Store reference to 'this' to avoid context issues in callback
    const self = this;
    this.icon.connect("button-press-event", (actor, event) => {
      const buttonPressed = event.get_button();

      if (buttonPressed === 1) {
        // Left click - toggle recording
        self.icon.menu.close(true);
        console.log("Click handler triggered");

        // Use direct reference to this extension instance
        self.extensionCore.toggleRecording();
        return Clutter.EVENT_STOP;
      } else if (buttonPressed === 3) {
        // Right click - show menu
        return Clutter.EVENT_PROPAGATE;
      }

      return Clutter.EVENT_STOP;
    });
  }

  _addToPanel() {
    try {
      // Remove any existing indicator first
      Main.panel.statusArea["speech2text-indicator"]?.destroy();
      delete Main.panel.statusArea["speech2text-indicator"];
    } catch (e) {
      console.log("No existing indicator to remove:", e.message);
    }

    Main.panel.addToStatusArea("speech2text-indicator", this.icon);
  }

  showSettingsWindow() {
    if (!this.extensionCore.settings) {
      console.error("Extension not properly enabled, cannot show settings");
      return;
    }

    if (!this.settingsDialog) {
      this.settingsDialog = new SettingsDialog(this.extensionCore);
    }
    this.settingsDialog.show();
  }

  showServiceSetupDialog(errorMessage, isFirstRun = false) {
    const setupDialog = new ServiceSetupDialog(
      this.extensionCore,
      errorMessage,
      isFirstRun
    );
    setupDialog.show();
  }

  showErrorNotification(title, message) {
    Main.notify(title, message);
  }

  showSuccessNotification(title, message) {
    Main.notify(title, message);
  }

  captureNewShortcut(callback) {
    const shortcutCapture = new ShortcutCapture();
    shortcutCapture.capture(callback);
  }

  cleanup() {
    // Close settings dialog
    if (this.settingsDialog) {
      console.log("Closing settings dialog");
      this.settingsDialog.close();
      this.settingsDialog = null;
    }

    // Clean up panel icon first (CRITICAL for avoiding conflicts)
    try {
      if (this.icon) {
        console.log("Removing panel icon from status area");
        this.icon.destroy();
        this.icon = null;
      }

      // Remove from status area to prevent conflicts
      if (Main.panel.statusArea["speech2text-indicator"]) {
        console.log("Cleaning up status area indicator");
        Main.panel.statusArea["speech2text-indicator"].destroy();
        delete Main.panel.statusArea["speech2text-indicator"];
      }
    } catch (error) {
      console.log("Error cleaning up panel icon:", error.message);
      // Force cleanup even if there are errors
      this.icon = null;
      try {
        delete Main.panel.statusArea["speech2text-indicator"];
      } catch (e) {
        // Ignore secondary cleanup errors
      }
    }
  }
}
