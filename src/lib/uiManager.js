import Clutter from "gi://Clutter";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

export class UIManager {
  constructor(extensionCore) {
    this.extensionCore = extensionCore;
    this.icon = null;
    this._buttonPressSignalId = null;
  }

  initialize() {
    // Create the panel button
    this.icon = new PanelMenu.Button(0.0, "Speech2Text Indicator");

    // Set up the icon
    let icon = new St.Icon({
      icon_name: "radio-checked-symbolic",
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
    // Settings menu item - opens standard GNOME extension preferences
    let settingsItem = new PopupMenu.PopupMenuItem("Settings");
    settingsItem.connect("activate", () => {
      this.openPreferences();
    });
    this.icon.menu.addMenuItem(settingsItem);
  }

  _setupClickHandler() {
    // Store reference to 'this' to avoid context issues in callback
    const self = this;
    this._buttonPressSignalId = this.icon.connect("button-press-event", (_actor, event) => {
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

  openPreferences() {
    try {
      this.extensionCore.openPreferences();
    } catch (e) {
      console.error("Failed to open preferences:", e);
      Main.notify("Speech2Text", "Failed to open preferences window");
    }
  }

  showErrorNotification(title, message) {
    Main.notify(title, message);
  }

  showSuccessNotification(title, message) {
    Main.notify(title, message);
  }

  showServiceMissingNotification(errorMessage) {
    const title = "WhisperCpp Service Not Installed";
    const message = (errorMessage || "Service not found") + "\n\n" +
      "Quick install (2 commands):\n" +
      "  pipx install gnome-speech2text-service-whispercpp\n" +
      "  gnome-speech2text-whispercpp-setup\n\n" +
      "Or use one-liner:\n" +
      "  curl -fsSL https://raw.githubusercontent.com/kavehtehrani/gnome-speech2text/main/service-whispercpp/install.sh | bash\n\n" +
      "Documentation:\n" +
      "  github.com/kavehtehrani/gnome-speech2text#installation";

    Main.notify(title, message);
  }

  cleanup() {
    // Disconnect signal handler
    if (this._buttonPressSignalId && this.icon) {
      try {
        this.icon.disconnect(this._buttonPressSignalId);
        console.log("Button press signal disconnected");
      } catch (error) {
        console.log("Error disconnecting button press signal:", error.message);
      }
      this._buttonPressSignalId = null;
    }

    // Clean up panel icon (this.icon and statusArea reference the same object)
    try {
      if (this.icon) {
        console.log("Removing panel icon from status area");
        // Only destroy once - this.icon and statusArea["speech2text-indicator"] are the same object
        this.icon.destroy();
        this.icon = null;
        // Clean up the reference in statusArea
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
