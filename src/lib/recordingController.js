import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { RecordingStateManager } from "./recordingStateManager.js";
import { RecordingDialog } from "./recordingDialog.js";

export class RecordingController {
  constructor(uiManager, serviceManager) {
    this.uiManager = uiManager;
    this.serviceManager = serviceManager;
    this.recordingStateManager = null;
  }

  initialize() {
    // Initialize recording state manager
    this.recordingStateManager = new RecordingStateManager(
      this.uiManager.icon,
      this.serviceManager.dbusManager
    );
  }

  async toggleRecording(settings) {
    // Check if service is available and initialize if needed
    if (!this.recordingStateManager || !this.serviceManager.isInitialized) {
      console.log("Checking service manager and service status");

      const serviceAvailable =
        await this.serviceManager.ensureServiceAvailable();
      if (!serviceAvailable) {
        console.log("Service initialization failed");
        this.uiManager.showServiceMissingNotification(
          "Speech-to-text service is not available.\nPlease install the WhisperCpp service."
        );
        return;
      }

      const serviceStatus =
        await this.serviceManager.dbusManager.checkServiceStatus();
      if (!serviceStatus.available) {
        console.log("Service not available:", serviceStatus.error);
        this.uiManager.showServiceMissingNotification(serviceStatus.error);
        return;
      }

      // Initialize recording state manager if not already done
      if (!this.recordingStateManager) {
        console.log("Initializing recording state manager");
        this.initialize();
      }
    }

    // Now handle the actual recording toggle
    if (this.recordingStateManager.isRecording()) {
      console.log("Stopping recording");
      this.recordingStateManager.stopRecording();
    } else {
      console.log("Starting recording");

      // Ensure RecordingStateManager has current service manager reference
      if (
        this.recordingStateManager &&
        this.serviceManager.dbusManager &&
        this.recordingStateManager.dbusManager !==
          this.serviceManager.dbusManager
      ) {
        this.recordingStateManager.updateDbusManager(
          this.serviceManager.dbusManager
        );
      }

      const success = await this.recordingStateManager.startRecording(settings);

      if (success) {
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
          settings.get_int("recording-duration")
        );

        this.recordingStateManager.setRecordingDialog(recordingDialog);
        console.log(
          "RecordingController: Created and set recording dialog, opening now"
        );
        recordingDialog.open();
      } else {
        this.uiManager.showErrorNotification(
          "Speech2Text Error",
          "Failed to start recording. Please try again."
        );
      }
    }
  }

  handleRecordingStopped(recordingId, reason) {
    if (!this.recordingStateManager) {
      console.log("Recording state manager not initialized");
      return;
    }

    console.log(
      `RecordingController: Recording stopped - ID: ${recordingId}, reason: ${reason}`
    );
    if (reason === "completed") {
      // Recording completed automatically - don't close dialog yet
      this.recordingStateManager.handleRecordingCompleted(recordingId);
    }
    // For manual stops (reason === "stopped"), the dialog is already closed
    // in the stopRecording method
  }

  handleTranscriptionReady(recordingId, text) {
    if (!this.recordingStateManager) {
      console.log("Recording state manager not initialized");
      return;
    }

    console.log(
      `RecordingController: Transcription ready - ID: ${recordingId}, text: "${text}"`
    );
    const result = this.recordingStateManager.handleTranscriptionReady(
      recordingId,
      text,
      this.uiManager.extensionCore.settings
    );

    console.log(
      `RecordingController: Transcription result - action: ${result?.action}`
    );
    if (result && result.action === "insert") {
      this._typeText(result.text);
    } else if (result && result.action === "createPreview") {
      console.log("Creating new preview dialog for transcribed text");
      this._showPreviewDialog(result.text);
    } else if (result && result.action === "ignored") {
      console.log("Transcription ignored - recording was cancelled");
      // Nothing to do - recording was cancelled
    }
  }

  handleRecordingError(recordingId, errorMessage) {
    if (!this.recordingStateManager) {
      console.log("Recording state manager not initialized");
      return;
    }

    // Log error to journal for debugging
    console.error(`Recording error for ${recordingId}: ${errorMessage}`);

    this.recordingStateManager.handleRecordingError(recordingId, errorMessage);
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

  async _typeText(text) {
    try {
      await this.serviceManager.typeText(
        text,
        this.uiManager.extensionCore.settings.get_boolean("copy-to-clipboard")
      );
    } catch (e) {
      console.error(`Error typing text: ${e}`);
      this.uiManager.showErrorNotification(
        "Speech2Text Error",
        "Failed to insert text."
      );
    }
  }

  cleanup() {
    if (this.recordingStateManager) {
      console.log("Cleaning up recording state manager");
      this.recordingStateManager.cleanup();
      this.recordingStateManager = null;
    }
  }
}
