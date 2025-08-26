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
    this.isEnabled = false;
  }

  async enable() {
    console.log("Enabling Speech2Text extension (D-Bus version)");

    try {
      // Initialize settings
      this.settings = super.getSettings("org.shell.extensions.speech2text");

      // Initialize service manager first
      this.serviceManager = new ServiceManager();
      await this.serviceManager.initialize();

      // Initialize UI manager
      this.uiManager = new UIManager(this);
      this.uiManager.initialize();

      // Initialize recording controller
      this.recordingController = new RecordingController(
        this.uiManager,
        this.serviceManager
      );
      this.recordingController.initialize();

      // Initialize keybinding manager
      this.keybindingManager = new KeybindingManager(this);
      this.keybindingManager.setupKeybinding();

      // Set up signal handlers
      this._setupSignalHandlers();

      // Mark as enabled and ensure global reference is correct
      this.isEnabled = true;
      extensionInstance = this;
      console.log("Extension enabled successfully");
    } catch (error) {
      console.error("Error enabling extension:", error);
      this.disable();
      throw error;
    }
  }

  _setupSignalHandlers() {
    // Connect service manager signals to recording controller
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

      // Auto-recovery: if extension state is inconsistent, try to fix it
      if (!this.isEnabled || !this.settings || !this.uiManager) {
        console.log(
          "Extension state inconsistent, attempting comprehensive auto-recovery"
        );
        await this._performAutoRecovery();
      }

      // Final safety check after auto-recovery attempt
      if (!this.settings || !this.uiManager) {
        console.error("Required components still missing after auto-recovery");
        return;
      }

      // Ensure service is available
      const serviceAvailable =
        await this.serviceManager.ensureServiceAvailable();
      if (!serviceAvailable) {
        this.uiManager.showServiceSetupDialog(
          "Speech-to-text service is not available"
        );
        return;
      }

      // Handle the actual recording toggle
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

      // Step 1: Reinitialize settings if missing
      if (!this.settings) {
        console.log("Recovering settings");
        this.settings = super.getSettings("org.shell.extensions.speech2text");
      }

      // Step 2: Recreate UI manager if missing
      if (!this.uiManager) {
        console.log("Recovering UI manager");
        this.uiManager = new UIManager(this);
      }

      // Step 3: Reinitialize service manager if needed
      if (!this.serviceManager) {
        console.log("Recovering service manager");
        this.serviceManager = new ServiceManager();
      }

      // Step 4: Reinitialize recording controller
      if (this.uiManager && this.serviceManager) {
        if (this.recordingController) {
          console.log("Cleaning up old recording controller before recreating");
          this.recordingController.cleanup();
        }
        console.log("Recovering recording controller");
        this.recordingController = new RecordingController(
          this.uiManager,
          this.serviceManager
        );
      }

      // Step 5: Re-establish keybindings if needed
      if (this.settings && !this.keybindingManager) {
        console.log("Recovering keybinding manager");
        this.keybindingManager = new KeybindingManager(this);
      }

      // Step 6: Mark as enabled if we have all core components
      if (this.settings && this.uiManager) {
        this.isEnabled = true;
        extensionInstance = this;
        console.log("Full extension state recovered successfully");

        // Re-setup signal handlers
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

  refreshEventHandlers() {
    if (!this.isEnabled || !this.uiManager || !this.settings) {
      console.error(
        "Extension not properly enabled, cannot refresh event handlers"
      );
      return;
    }

    console.log("Refreshing event handlers after session change");

    // Re-setup keybinding
    this.keybindingManager?.setupKeybinding();

    // Refresh UI event handlers
    this.uiManager.refreshEventHandlers();
  }

  disable() {
    console.log("Disabling Speech2Text extension (D-Bus version)");

    // Mark as disabled immediately to prevent race conditions
    this.isEnabled = false;
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
      console.log("Destroying service manager");
      try {
        this.serviceManager.destroy();
      } catch (error) {
        console.log("Error destroying service manager:", error.message);
      } finally {
        this.serviceManager = null;
      }
    }

    // Clear settings reference
    this.settings = null;
  }

  // Getters for components
  getUIManager() {
    return this.uiManager;
  }

  getRecordingController() {
    return this.recordingController;
  }

  getServiceManager() {
    return this.serviceManager;
  }

  getSettingsObject() {
    return this.settings;
  }

  // Static method to get the global instance
  static getInstance() {
    return extensionInstance;
  }

  // Delegate methods to UI manager
  captureNewShortcut(callback) {
    return this.uiManager?.captureNewShortcut(callback);
  }

  showSettingsWindow() {
    return this.uiManager?.showSettingsWindow();
  }

  showServiceSetupDialog(errorMessage, isFirstRun = false) {
    return this.uiManager?.showServiceSetupDialog(errorMessage, isFirstRun);
  }
}
