import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { UIManager } from "./lib/uiManager.js";
import { RecordingController } from "./lib/recordingController.js";
import { ServiceManager } from "./lib/serviceManager.js";
import { KeybindingManager } from "./lib/keybindingManager.js";

let extensionInstance = null;

export default class Speech2TextExtension extends Extension {
  constructor(metadata) {
    super(metadata);

    this.settings = null;
    this.uiManager = null;
    this.recordingController = null;
    this.serviceManager = null;
    this.keybindingManager = null;
  }

  async enable() {
    console.log("Enabling Speech2Text extension (D-Bus version)");
    this.settings = this.getSettings("org.gnome.shell.extensions.speech2text");

    this.serviceManager = new ServiceManager();
    await this.serviceManager.initialize();

    this.uiManager = new UIManager(this);
    this.uiManager.initialize();

    this.recordingController = new RecordingController(
      this.uiManager,
      this.serviceManager
    );
    this.recordingController.initialize();

    this.keybindingManager = new KeybindingManager(this);
    this.keybindingManager.setupKeybinding();

    this._setupSignalHandlers();

    extensionInstance = this;
    console.log("Extension enabled successfully");
  }

  _setupSignalHandlers() {
    this.serviceManager.connectSignals({
      onTranscriptionReady: (recordingId, text) => {
        this.recordingController.handleTranscriptionReady(recordingId, text);
      },
      onRecordingError: (recordingId, errorMessage) => {
        this.recordingController.handleRecordingError(
          recordingId,
          errorMessage
        );
      },
      onRecordingStopped: (recordingId, reason) => {
        this.recordingController.handleRecordingStopped(recordingId, reason);
      },
    });
  }

  async toggleRecording() {
    try {
      console.log("=== TOGGLE RECORDING (D-Bus) ===");

      if (!this.settings || !this.uiManager) {
        console.log(
          "Extension state inconsistent, attempting comprehensive auto-recovery"
        );
        await this._performAutoRecovery();
      }

      if (!this.settings || !this.uiManager) {
        console.error("Required components still missing after auto-recovery");
        return;
      }

      const serviceAvailable =
        await this.serviceManager.ensureServiceAvailable();
      if (!serviceAvailable) {
        this.uiManager.showErrorNotification(
          "Speech2Text",
          "Service is not available. Please check if the service is running."
        );
        return;
      }

      await this.recordingController.toggleRecording(this.settings);
    } catch (error) {
      console.error("Error in toggleRecording:", error);
      this.uiManager.showErrorNotification(
        "Speech2Text Error",
        "An error occurred while toggling recording. Please check the logs."
      );
    }
  }

  async _performAutoRecovery() {
    try {
      console.log("Attempting full extension state recovery");

      if (!this.settings) {
        this.settings = this.getSettings(
          "org.gnome.shell.extensions.speech2text"
        );
      }

      if (!this.uiManager) {
        this.uiManager = new UIManager(this);
      }

      if (!this.serviceManager) {
        this.serviceManager = new ServiceManager();
      }

      if (this.uiManager && this.serviceManager) {
        if (this.recordingController) {
          this.recordingController.cleanup();
        }
        this.recordingController = new RecordingController(
          this.uiManager,
          this.serviceManager
        );
      }

      if (this.settings && !this.keybindingManager) {
        this.keybindingManager = new KeybindingManager(this);
      }

      if (this.settings && this.uiManager) {
        extensionInstance = this;
        this._setupSignalHandlers();
      }
    } catch (recoveryError) {
      console.error("Comprehensive auto-recovery failed:", recoveryError);
      this.uiManager?.showErrorNotification(
        "Speech2Text Error",
        "Extension recovery failed. Please restart GNOME Shell: Alt+F2 → 'r' → Enter"
      );
      throw recoveryError;
    }
  }

  disable() {
    console.log("Disabling Speech2Text extension (D-Bus version)");

    extensionInstance = null;

    // Clean up components in reverse order of initialization
    if (this.keybindingManager) {
      this.keybindingManager.cleanup();
      this.keybindingManager = null;
    }

    if (this.recordingController) {
      console.log("Cleaning up recording controller");
      this.recordingController.cleanup();
      this.recordingController = null;
    }

    if (this.uiManager) {
      console.log("Cleaning up UI manager");
      this.uiManager.cleanup();
      this.uiManager = null;
    }

    if (this.serviceManager) {
      this.serviceManager.destroy();
      this.serviceManager = null;
    }

    // Clear settings reference
    this.settings = null;
  }
}
