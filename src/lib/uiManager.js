import Clutter from "gi://Clutter";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";

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

  showServiceSetupDialog(errorMessage) {
    const setupDialog = new ServiceSetupDialog(
      this.extensionCore,
      errorMessage
    );
    setupDialog.show();
  }

  showErrorNotification(title, message) {
    Main.notify(title, message);
  }

  showSuccessNotification(title, message) {
    Main.notify(title, message);
  }

  /**
   * Show a clickable notification (GNOME Shell 46–49).
   * Falls back to Main.notify if MessageTray API changes.
   */
  showActionableNotification(title, message, onActivate) {
    try {
      // Follow the upstream docs for GNOME Shell extensions:
      // https://gjs.guide/extensions/topics/notifications.html#notifications
      const source = MessageTray.getSystemSource?.();
      if (!source) {
        Main.notify(title, message);
        return;
      }

      const notification = new MessageTray.Notification({
        source,
        title,
        body: message,
        iconName: "microphone-symbolic",
        urgency: MessageTray.Urgency?.NORMAL ?? undefined,
      });

      // Connect click activation (works across versions).
      if (onActivate) {
        const handler = () => {
          try {
            onActivate();
          } catch (e) {
            console.error("Notification activation handler failed:", e);
            Main.notify(
              "Speech2Text Error",
              "Failed to open transcription view."
            );
          }
        };

        // Banner/body activation
        try {
          notification.connect("activated", handler);
        } catch {
          // ignore
        }

        // Some versions also emit action-invoked for default action
        try {
          notification.connect("action-invoked", handler);
        } catch {
          // ignore
        }
      }

      // Add an explicit action button where supported (more reliable than body click).
      if (onActivate && typeof notification.addAction === "function") {
        try {
          notification.addAction("View", () => {
            try {
              onActivate();
            } catch (e) {
              console.error("Notification action handler failed:", e);
              Main.notify(
                "Speech2Text Error",
                "Failed to open transcription view."
              );
            }
          });
        } catch {
          // Optional, ignore if unsupported.
        }
      }

      source.addNotification?.(notification);
    } catch (e) {
      console.error("Failed to show actionable notification:", e);
      Main.notify(title, message);
    }
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
