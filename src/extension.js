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
import { safeDisconnect, cleanupModal } from "./lib/resourceUtils.js";

let button;

// D-Bus interface XML for the speech2text service
const Speech2TextInterface = `
<node>
  <interface name="org.gnome.Speech2Text">
    <method name="StartRecording">
      <arg direction="in" type="i" name="duration" />
      <arg direction="in" type="b" name="copy_to_clipboard" />
      <arg direction="in" type="b" name="preview_mode" />
      <arg direction="out" type="s" name="recording_id" />
    </method>
    <method name="StopRecording">
      <arg direction="in" type="s" name="recording_id" />
      <arg direction="out" type="b" name="success" />
    </method>
    <method name="TypeText">
      <arg direction="in" type="s" name="text" />
      <arg direction="in" type="b" name="copy_to_clipboard" />
      <arg direction="out" type="b" name="success" />
    </method>
    <method name="GetServiceStatus">
      <arg direction="out" type="s" name="status" />
    </method>
    <method name="CheckDependencies">
      <arg direction="out" type="b" name="all_available" />
      <arg direction="out" type="as" name="missing_dependencies" />
    </method>
    <signal name="RecordingStarted">
      <arg type="s" name="recording_id" />
    </signal>
    <signal name="RecordingStopped">
      <arg type="s" name="recording_id" />
      <arg type="s" name="reason" />
    </signal>
    <signal name="TranscriptionReady">
      <arg type="s" name="recording_id" />
      <arg type="s" name="text" />
    </signal>
    <signal name="RecordingError">
      <arg type="s" name="recording_id" />
      <arg type="s" name="error_message" />
    </signal>
    <signal name="TextTyped">
      <arg type="s" name="text" />
      <arg type="b" name="success" />
    </signal>
  </interface>
</node>`;

export default class Speech2TextExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    this.recordingDialog = null;
    this.settings = null;
    this.settingsDialog = null;
    this.currentKeybinding = null;
    this.currentRecordingId = null;
    this.dbusProxy = null;
    this.signalConnections = [];
  }

  async _initDBusProxy() {
    try {
      const Speech2TextProxy =
        Gio.DBusProxy.makeProxyWrapper(Speech2TextInterface);

      this.dbusProxy = new Speech2TextProxy(
        Gio.DBus.session,
        "org.gnome.Speech2Text",
        "/org/gnome/Speech2Text"
      );

      // Connect to D-Bus signals
      this.signalConnections.push(
        this.dbusProxy.connectSignal(
          "RecordingStarted",
          (proxy, sender, [recordingId]) => {
            console.log(`Recording started: ${recordingId}`);
          }
        )
      );

      this.signalConnections.push(
        this.dbusProxy.connectSignal(
          "RecordingStopped",
          (proxy, sender, [recordingId, reason]) => {
            console.log(`Recording stopped: ${recordingId}, reason: ${reason}`);
          }
        )
      );

      this.signalConnections.push(
        this.dbusProxy.connectSignal(
          "TranscriptionReady",
          (proxy, sender, [recordingId, text]) => {
            console.log(`Transcription ready: ${recordingId}, text: ${text}`);
            this._handleTranscriptionReady(recordingId, text);
          }
        )
      );

      this.signalConnections.push(
        this.dbusProxy.connectSignal(
          "RecordingError",
          (proxy, sender, [recordingId, errorMessage]) => {
            console.log(
              `Recording error: ${recordingId}, error: ${errorMessage}`
            );
            this._handleRecordingError(recordingId, errorMessage);
          }
        )
      );

      this.signalConnections.push(
        this.dbusProxy.connectSignal(
          "TextTyped",
          (proxy, sender, [text, success]) => {
            if (success) {
              Main.notify("Speech2Text", "Text inserted successfully!");
            } else {
              Main.notify("Speech2Text Error", "Failed to insert text.");
            }
          }
        )
      );

      return true;
    } catch (e) {
      console.error(`Failed to initialize D-Bus proxy: ${e}`);
      return false;
    }
  }

  async _checkServiceStatus() {
    if (!this.dbusProxy) {
      return { available: false, error: "D-Bus proxy not initialized" };
    }

    try {
      const [status] = await this.dbusProxy.GetServiceStatusAsync();

      if (status.startsWith("dependencies_missing:")) {
        const missing = status
          .substring("dependencies_missing:".length)
          .split(",");
        return {
          available: false,
          error: `Missing dependencies: ${missing.join(", ")}`,
        };
      }

      if (status.startsWith("ready:")) {
        return { available: true };
      }

      if (status.startsWith("error:")) {
        const error = status.substring("error:".length);
        return { available: false, error };
      }

      return { available: false, error: "Unknown service status" };
    } catch (e) {
      return { available: false, error: `Service not available: ${e.message}` };
    }
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

    // Initialize D-Bus proxy
    const dbusInitialized = await this._initDBusProxy();
    if (!dbusInitialized) {
      Main.notify(
        "Speech2Text Error",
        "Failed to connect to speech-to-text service. Please ensure the service is running."
      );
      return;
    }

    // Check service status
    const serviceStatus = await this._checkServiceStatus();
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
    // Create a modal dialog to capture new shortcut
    let captureWindow = new St.BoxLayout({
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

    captureWindow.add_child(instructionLabel);
    captureWindow.add_child(hintLabel);

    // Create modal overlay
    let overlay = new St.Widget({
      style: `background-color: ${COLORS.TRANSPARENT_BLACK_70};`,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    overlay.add_child(captureWindow);

    let monitor = Main.layoutManager.primaryMonitor;
    overlay.set_size(monitor.width, monitor.height);
    overlay.set_position(monitor.x, monitor.y);

    // Center the capture window
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
      let [windowWidth, windowHeight] = captureWindow.get_size();
      if (windowWidth === 0) windowWidth = 400;
      if (windowHeight === 0) windowHeight = 200;

      captureWindow.set_position(
        (monitor.width - windowWidth) / 2,
        (monitor.height - windowHeight) / 2
      );
      return false;
    });

    Main.layoutManager.addTopChrome(overlay);

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
    captureWindow.add_child(statusLabel);

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
    let keyPressHandler = overlay.connect("key-press-event", (actor, event) => {
      const keyval = event.get_key_symbol();
      const state = event.get_state();
      const keyName = Clutter.keyval_name(keyval);

      if (keyval === Clutter.KEY_Escape) {
        // Cancel capture
        cleanupModal(overlay, { keyPressHandler, keyReleaseHandler });
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
        cleanupModal(overlay, { keyPressHandler, keyReleaseHandler });
        callback(shortcut);
        return Clutter.EVENT_STOP;
      }

      return Clutter.EVENT_STOP;
    });

    // Also handle key release to reset modifier state if needed
    let keyReleaseHandler = overlay.connect(
      "key-release-event",
      (actor, event) => {
        const keyval = event.get_key_symbol();
        const keyName = Clutter.keyval_name(keyval);

        // Don't reset modifiers on release - let user build combination
        // This allows holding multiple modifiers before pressing the final key
        return Clutter.EVENT_STOP;
      }
    );

    overlay.grab_key_focus();
    overlay.set_reactive(true);
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
        await this.dbusProxy.StopRecordingAsync(this.currentRecordingId);
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

      const [recordingId] = await this.dbusProxy.StartRecordingAsync(
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
            this.dbusProxy
              .StopRecordingAsync(this.currentRecordingId)
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
            this.dbusProxy
              .StopRecordingAsync(this.currentRecordingId)
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

      await this.dbusProxy.TypeTextAsync(text.trim(), copyToClipboard);
    } catch (e) {
      console.error(`Error typing text: ${e}`);
      Main.notify("Speech2Text Error", "Failed to insert text.");
    }
  }

  disable() {
    console.log("Disabling Speech2Text extension (D-Bus version)");

    // Stop any active recording
    if (this.currentRecordingId && this.dbusProxy) {
      this.dbusProxy
        .StopRecordingAsync(this.currentRecordingId)
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

    // Disconnect D-Bus signals
    this.signalConnections.forEach((connection) => {
      if (this.dbusProxy) {
        this.dbusProxy.disconnectSignal(connection);
      }
    });
    this.signalConnections = [];

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

    // Clear D-Bus proxy
    this.dbusProxy = null;
  }
}

function init(metadata) {
  return new Speech2TextExtension(metadata);
}
