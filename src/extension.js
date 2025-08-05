import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import St from "gi://St";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import { SettingsDialog } from "./lib/settingsDialog.js";
import { RecordingDialog } from "./lib/recordingDialog.js";
import { ServiceSetupDialog } from "./lib/setupDialog.js";
import { DBusManager } from "./lib/dbusManager.js";
import { ShortcutCapture } from "./lib/shortcutCapture.js";
import { RecordingStateManager } from "./lib/recordingStateManager.js";

let button;

export default class Speech2TextExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    this.settings = null;
    this.settingsDialog = null;
    this.currentKeybinding = null;
    this.dbusManager = new DBusManager();
    this.recordingStateManager = null; // Will be initialized after icon creation
  }

  async _initDBus() {
    const initialized = await this.dbusManager.initialize();
    if (!initialized) {
      return false;
    }

    // Connect signals with handlers - will be updated after recording state manager is initialized
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

  _handleRecordingStopped(recordingId, reason) {
    if (!this.recordingStateManager) {
      console.log("Recording state manager not initialized");
      return;
    }

    console.log(
      `Extension: Recording stopped - ID: ${recordingId}, reason: ${reason}`
    );
    if (reason === "completed") {
      // Recording completed automatically - don't close dialog yet
      this.recordingStateManager.handleRecordingCompleted(recordingId);
    }
    // For manual stops (reason === "stopped"), the dialog is already closed
    // in the stopRecording method
  }

  _handleTranscriptionReady(recordingId, text) {
    if (!this.recordingStateManager) {
      console.log("Recording state manager not initialized");
      return;
    }

    console.log(
      `Extension: Transcription ready - ID: ${recordingId}, text: "${text}"`
    );
    const result = this.recordingStateManager.handleTranscriptionReady(
      recordingId,
      text,
      this.settings
    );

    console.log(`Extension: Transcription result - action: ${result?.action}`);
    if (result && result.action === "insert") {
      this._typeText(result.text);
    } else if (result && result.action === "createPreview") {
      console.log("Creating new preview dialog for transcribed text");
      this._showPreviewDialog(result.text);
    }
  }

  _handleRecordingError(recordingId, errorMessage) {
    if (!this.recordingStateManager) {
      console.log("Recording state manager not initialized");
      return;
    }

    this.recordingStateManager.handleRecordingError(recordingId, errorMessage);
  }

  enable() {
    console.log("Enabling Speech2Text extension (D-Bus version)");

    this.settings = this.getSettings();

    // Create button with microphone icon (always create UI, regardless of service status)
    button = new PanelMenu.Button(0.0, "Speech2Text");
    this.button = button;

    this.icon = new St.Icon({
      gicon: Gio.icon_new_for_string(
        `${this.path}/icons/microphone-symbolic.svg`
      ),
      style_class: "system-status-icon",
    });
    button.add_child(this.icon);

    // Don't initialize D-Bus or recording state manager here
    // We'll do it lazily when the user first tries to use the extension

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

    // Setup Guide menu item
    let setupItem = new PopupMenu.PopupMenuItem("Setup");
    setupItem.connect("activate", () => {
      this._showServiceSetupDialog("Manual setup guide requested");
    });
    this.button.menu.addMenuItem(setupItem);
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
    // Check if keybinding exists before trying to remove it
    try {
      // Get current keybindings to check if ours exists
      const currentBindings = Main.wm.getKeybindingMode();
      // Try to remove existing keybinding only if it might exist
      Main.wm.removeKeybinding("toggle-recording");
    } catch (e) {
      // Ignore errors - keybinding might not exist
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
    try {
      console.log("=== TOGGLE RECORDING (D-Bus) ===");

      // Check if this is the first time the user is trying to use the extension
      const isFirstRun = this.settings.get_boolean("first-run");

      if (isFirstRun) {
        console.log("First-time usage detected - checking service status");

        // Initialize D-Bus manager if not already done
        if (!this.dbusManager || !this.dbusManager.isInitialized) {
          console.log("Initializing D-Bus manager for first-time usage");
          const dbusInitialized = await this._initDBus();
          if (!dbusInitialized) {
            console.log("D-Bus initialization failed for first-time usage");
            // Don't set first-run to false yet - user should get another chance
            this._showServiceSetupDialog("Let's get started!", true);
            return;
          }
        }

        // Check service status
        console.log("Checking service status for first-time usage");
        const serviceStatus = await this.dbusManager.checkServiceStatus();
        if (!serviceStatus.available) {
          console.log(
            "Service not available for first-time usage:",
            serviceStatus.error
          );
          // Don't set first-run to false yet - user should get another chance
          this._showServiceSetupDialog("Ready to set up speech-to-text!", true);
          return;
        }

        console.log("Service is available - completing first-time setup");
        // Service is working! Mark first run as complete and show welcome
        this.settings.set_boolean("first-run", false);
        Main.notify(
          "Speech2Text",
          "🎉 Welcome! Extension is ready to use. Right-click the microphone icon for settings."
        );

        // Initialize recording state manager if not already done
        if (!this.recordingStateManager) {
          console.log(
            "Initializing recording state manager for first-time usage"
          );
          this.recordingStateManager = new RecordingStateManager(
            this.icon,
            this.dbusManager
          );

          // Update signal handlers to use recording state manager
          this.dbusManager.connectSignals({
            onRecordingStopped: (recordingId, reason) => {
              this._handleRecordingStopped(recordingId, reason);
            },
            onTranscriptionReady: (recordingId, text) => {
              this._handleTranscriptionReady(recordingId, text);
            },
            onRecordingError: (recordingId, errorMessage) => {
              this._handleRecordingError(recordingId, errorMessage);
            },
          });
        }
      }

      // For non-first-run usage, check if service is available
      if (
        !this.recordingStateManager ||
        !this.dbusManager ||
        !this.dbusManager.isInitialized
      ) {
        // Try to initialize if not already done
        const dbusInitialized = await this._initDBus();
        if (!dbusInitialized) {
          this._showServiceSetupDialog(
            "Failed to connect to speech-to-text service"
          );
          return;
        }

        const serviceStatus = await this.dbusManager.checkServiceStatus();
        if (!serviceStatus.available) {
          this._showServiceSetupDialog(serviceStatus.error);
          return;
        }

        // Initialize recording state manager if needed
        if (!this.recordingStateManager) {
          this.recordingStateManager = new RecordingStateManager(
            this.icon,
            this.dbusManager
          );

          this.dbusManager.connectSignals({
            onRecordingStopped: (recordingId, reason) => {
              this._handleRecordingStopped(recordingId, reason);
            },
            onTranscriptionReady: (recordingId, text) => {
              this._handleTranscriptionReady(recordingId, text);
            },
            onRecordingError: (recordingId, errorMessage) => {
              this._handleRecordingError(recordingId, errorMessage);
            },
          });
        }
      }

      if (!this.recordingStateManager) {
        console.log("Recording state manager not initialized");
        return;
      }

      if (this.recordingStateManager.isRecording()) {
        // Stop current recording
        await this.recordingStateManager.stopRecording();
        return;
      }

      // Start new recording
      const success = await this.recordingStateManager.startRecording(
        this.settings
      );
      if (!success) {
        Main.notify(
          "Speech2Text Error",
          "Failed to start recording. Please try again."
        );
        return;
      }

      // Create and show recording dialog
      const recordingDialog = new RecordingDialog(
        () => {
          // Cancel callback
          this.recordingStateManager.cancelRecording();
          this.recordingStateManager.setRecordingDialog(null);
        },
        (text) => {
          // Insert callback
          console.log(`Inserting text: ${text}`);
          this._typeText(text);
          this.recordingStateManager.setRecordingDialog(null);
        },
        () => {
          // Stop callback
          console.log("Stop recording button clicked");
          this.recordingStateManager.stopRecording();
        },
        this.settings.get_int("recording-duration")
      );

      this.recordingStateManager.setRecordingDialog(recordingDialog);
      console.log(`Extension: Created and set recording dialog, opening now`);
      recordingDialog.open();
    } catch (error) {
      console.error("Error in toggleRecording:", error);
      // Show setup dialog if there's any error - likely service related
      this._showServiceSetupDialog(
        "An error occurred. Service setup may be required."
      );
    }
  }

  _showPreviewDialog(text) {
    console.log("Creating preview dialog for text:", text);

    // Create a new preview-only dialog
    const previewDialog = new RecordingDialog(
      () => {
        // Cancel callback - just close
        previewDialog.close();
      },
      (finalText) => {
        // Insert callback
        console.log(`Inserting text from preview: ${finalText}`);
        this._typeText(finalText);
        previewDialog.close();
      },
      null, // No stop callback needed for preview-only
      0 // No duration for preview-only
    );

    // First open the dialog, then show preview
    console.log("Opening preview dialog");
    previewDialog.open();
    console.log("Showing preview in opened dialog");
    previewDialog.showPreview(text);
  }

  _showServiceSetupDialog(errorMessage, isFirstRun = false) {
    const setupDialog = new ServiceSetupDialog(errorMessage, isFirstRun);
    setupDialog.show();
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

    // Clean up recording state manager
    if (this.recordingStateManager) {
      this.recordingStateManager.cleanup();
      this.recordingStateManager = null;
    }

    // Close settings dialog
    if (this.settingsDialog) {
      this.settingsDialog.close();
      this.settingsDialog = null;
    }

    // Destroy D-Bus manager
    if (this.dbusManager) {
      this.dbusManager.destroy();
      this.dbusManager = null;
    }

    // Clear settings reference
    this.settings = null;
    this.currentKeybinding = null;

    // Remove keybinding
    try {
      // Check if keybinding exists before trying to remove it
      const currentBindings = Main.wm.getKeybindingMode();
      Main.wm.removeKeybinding("toggle-recording");
    } catch (e) {
      // Ignore errors - keybinding might not exist
    }

    // Clean up button references
    if (button) {
      button.destroy();
      button = null;
    }

    if (this.button) {
      this.button = null;
    }

    if (this.icon) {
      this.icon = null;
    }
  }
}

function init(metadata) {
  return new Speech2TextExtension(metadata);
}
