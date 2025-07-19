import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import St from "gi://St";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

// Import modularized utilities (keeping some for UI)
import { COLORS, STYLES, createAccentDisplayStyle } from "./lib/constants.js";
import {
  createHoverButton,
  createTextButton,
  createStyledLabel,
  createVerticalBox,
  createHorizontalBox,
  createSeparator,
} from "./lib/uiUtils.js";
import {
  createCloseButton,
  createIncrementButton,
  createCenteredBox,
  createHeaderLayout,
} from "./lib/buttonUtils.js";
import { SettingsDialog } from "./lib/settingsDialog.js";
import { RecordingDialog } from "./lib/recordingDialog.js";
import { DBusManager } from "./lib/dbusManager.js";
import { ShortcutCapture } from "./lib/shortcutCapture.js";
import { safeDisconnect, cleanupModal } from "./lib/resourceUtils.js";

let button;

export default class Speech2TextExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    this.recordingDialog = null;
    this.settings = null;
    this.settingsDialog = null;
    this.currentKeybinding = null;
    this.currentRecordingId = null;
    this.dbusManager = new DBusManager();
  }

  async _initDBus() {
    const initialized = await this.dbusManager.initialize();
    if (!initialized) {
      return false;
    }

    // Connect signals with handlers
    this.dbusManager.connectSignals({
      onTranscriptionReady: (recordingId, text) => {
        this._handleTranscriptionReady(recordingId, text);
      },
      onRecordingError: (recordingId, errorMessage) => {
        this._handleRecordingError(recordingId, errorMessage);
      },
    });

    return true;
  }

  _handleTranscriptionReady(recordingId, text) {
    if (recordingId !== this.currentRecordingId) {
      console.log(
        `Received transcription for different recording: ${recordingId}`
      );
      return;
    }

    // Check if we should skip preview and auto-insert
    const skipPreviewX11 = this.settings.get_boolean("skip-preview-x11");
    const isWayland = Meta.is_wayland_compositor();

    if (this.recordingDialog) {
      if (!isWayland && skipPreviewX11) {
        // Auto-insert mode: close dialog and insert text directly
        console.log("Auto-inserting text (skip preview enabled)");
        this.recordingDialog.close();
        this.recordingDialog = null;
        this.currentRecordingId = null;
        this.icon.set_style("");
        this._typeText(text);
      } else {
        // Normal mode: show preview dialog
        this.recordingDialog.showPreview(text);
      }
    } else {
      // No dialog, insert directly (fallback)
      this._typeText(text);
    }
  }

  _handleRecordingError(recordingId, errorMessage) {
    if (recordingId !== this.currentRecordingId) {
      console.log(`Received error for different recording: ${recordingId}`);
      return;
    }

    if (this.recordingDialog) {
      this.recordingDialog.showError(errorMessage);
    } else {
      Main.notify("Speech2Text Error", errorMessage);
    }
  }

  async enable() {
    console.log("Enabling Speech2Text extension (D-Bus version)");

    // Initialize D-Bus manager
    const dbusInitialized = await this._initDBus();
    if (!dbusInitialized) {
      Main.notify(
        "Speech2Text Error",
        "Failed to connect to speech-to-text service. Please ensure the service is running."
      );
      return;
    }

    // Check service status
    const serviceStatus = await this.dbusManager.checkServiceStatus();
    if (!serviceStatus.available) {
      Main.notify(
        "Speech2Text Error",
        `Service unavailable: ${serviceStatus.error}`
      );
      return;
    }

    this.settings = this.getSettings();

    // Create button with microphone icon
    button = new PanelMenu.Button(0.0, "Speech2Text");
    this.button = button;

    this.icon = new St.Icon({
      gicon: Gio.icon_new_for_string(
        `${this.path}/icons/microphone-symbolic.svg`
      ),
      style_class: "system-status-icon",
    });
    button.add_child(this.icon);

    // Create popup menu
    this.createPopupMenu();

    // Handle button clicks
    button.connect("button-press-event", (actor, event) => {
      const buttonPressed = event.get_button();

      if (buttonPressed === 1) {
        // Left click - toggle recording
        button.menu.close(true);
        this.toggleRecording();
        return Clutter.EVENT_STOP;
      } else if (buttonPressed === 3) {
        // Right click - show menu
        return Clutter.EVENT_PROPAGATE;
      }

      return Clutter.EVENT_STOP;
    });

    // Set up keyboard shortcut
    this.setupKeybinding();

    Main.panel.addToStatusArea("Speech2Text", button);
  }

  createPopupMenu() {
    // Settings menu item
    let settingsItem = new PopupMenu.PopupMenuItem("Settings");
    settingsItem.connect("activate", () => {
      this.showSettingsWindow();
    });
    this.button.menu.addMenuItem(settingsItem);

    // Separator
    this.button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // Current shortcut display
    this.shortcutLabel = new PopupMenu.PopupMenuItem("", { reactive: false });
    this.updateShortcutLabel();
    this.button.menu.addMenuItem(this.shortcutLabel);
  }

  updateShortcutLabel() {
    if (this.currentKeybinding) {
      this.shortcutLabel.label.set_text(`Shortcut: ${this.currentKeybinding}`);
    } else {
      this.shortcutLabel.label.set_text("No shortcut set");
    }
  }

  captureNewShortcut(callback) {
    const shortcutCapture = new ShortcutCapture();
    shortcutCapture.capture(callback);
  }

  showSettingsWindow() {
    if (!this.settingsDialog) {
      this.settingsDialog = new SettingsDialog(this);
    }
    this.settingsDialog.show();
  }

  setupKeybinding() {
    // Remove existing keybinding
    try {
      Main.wm.removeKeybinding("toggle-recording");
    } catch (e) {
      // Ignore errors
    }

    // Get shortcut from settings
    let shortcuts = this.settings.get_strv("toggle-recording");
    if (shortcuts.length > 0) {
      this.currentKeybinding = shortcuts[0];
    } else {
      this.currentKeybinding = "<Control><Shift><Alt>c";
      this.settings.set_strv("toggle-recording", [this.currentKeybinding]);
    }

    // Register keybinding
    try {
      Main.wm.addKeybinding(
        "toggle-recording",
        this.settings,
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL,
        () => {
          console.log("Keyboard shortcut triggered");
          this.toggleRecording();
        }
      );
      console.log(`Keybinding registered: ${this.currentKeybinding}`);
    } catch (e) {
      console.error(`Error registering keybinding: ${e}`);
    }
  }

  async toggleRecording() {
    console.log("=== TOGGLE RECORDING (D-Bus) ===");

    if (this.currentRecordingId) {
      // Stop current recording
      console.log(`Stopping recording: ${this.currentRecordingId}`);
      try {
        await this.dbusManager.stopRecording(this.currentRecordingId);
      } catch (e) {
        console.error(`Error stopping recording: ${e}`);
      }
      return;
    }

    // Start new recording
    try {
      const recordingDuration = this.settings.get_int("recording-duration");
      const copyToClipboard = this.settings.get_boolean("copy-to-clipboard");
      const skipPreviewX11 = this.settings.get_boolean("skip-preview-x11");

      // Always use preview mode for D-Bus service (it just controls service behavior)
      // We'll handle the skip-preview logic in the extension when we get the transcription
      const previewMode = true;

      console.log(
        `Starting recording: duration=${recordingDuration}, clipboard=${copyToClipboard}, skipPreview=${skipPreviewX11}`
      );

      const recordingId = await this.dbusManager.startRecording(
        recordingDuration,
        copyToClipboard,
        previewMode
      );

      this.currentRecordingId = recordingId;
      this.icon.set_style(`color: ${COLORS.PRIMARY};`);

      console.log(`Recording started with ID: ${recordingId}`);

      // Always show recording dialog during recording
      this.recordingDialog = new RecordingDialog(
        () => {
          // Cancel callback
          console.log("Recording cancelled by user");
          if (this.currentRecordingId) {
            this.dbusManager
              .stopRecording(this.currentRecordingId)
              .catch(console.error);
          }
          this.currentRecordingId = null;
          this.recordingDialog = null;
          this.icon.set_style("");
        },
        (text) => {
          // Insert callback
          console.log(`Inserting text: ${text}`);
          this._typeText(text);
          this.currentRecordingId = null;
          this.recordingDialog = null;
          this.icon.set_style("");
        },
        () => {
          // Stop callback
          console.log("Stop recording button clicked");
          if (this.currentRecordingId) {
            this.dbusManager
              .stopRecording(this.currentRecordingId)
              .catch(console.error);
          }
        },
        recordingDuration
      );

      this.recordingDialog.open();
    } catch (e) {
      console.error(`Error starting recording: ${e}`);
      Main.notify(
        "Speech2Text Error",
        `Failed to start recording: ${e.message}`
      );
      this.icon.set_style("");
    }
  }

  async _typeText(text) {
    if (!text || !text.trim()) {
      console.log("No text to type");
      return;
    }

    try {
      const copyToClipboard = this.settings.get_boolean("copy-to-clipboard");
      console.log(`Typing text via D-Bus: "${text}"`);

      await this.dbusManager.typeText(text.trim(), copyToClipboard);
    } catch (e) {
      console.error(`Error typing text: ${e}`);
      Main.notify("Speech2Text Error", "Failed to insert text.");
    }
  }

  disable() {
    console.log("Disabling Speech2Text extension (D-Bus version)");

    // Stop any active recording
    if (this.currentRecordingId && this.dbusManager) {
      this.dbusManager
        .stopRecording(this.currentRecordingId)
        .catch(console.error);
      this.currentRecordingId = null;
    }

    // Close recording dialog
    if (this.recordingDialog) {
      this.recordingDialog.close();
      this.recordingDialog = null;
    }

    // Close settings dialog
    if (this.settingsDialog) {
      this.settingsDialog.close();
      this.settingsDialog = null;
    }

    // Destroy D-Bus manager
    if (this.dbusManager) {
      this.dbusManager.destroy();
    }

    // Remove keybinding
    try {
      Main.wm.removeKeybinding("toggle-recording");
    } catch (e) {
      console.error(`Error removing keybinding: ${e}`);
    }

    // Clean up button
    if (button) {
      button.destroy();
      button = null;
    }
  }
}

function init(metadata) {
  return new Speech2TextExtension(metadata);
}
