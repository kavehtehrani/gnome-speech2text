import Meta from "gi://Meta";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { COLORS } from "./constants.js";

export class RecordingStateManager {
  constructor(icon, dbusManager) {
    this.icon = icon;
    this.dbusManager = dbusManager;
    this.currentRecordingId = null;
    this.recordingDialog = null;
    this.lastRecordingSettings = null; // Store settings for transcription handling
    this.isCancelled = false; // Flag to track if recording was cancelled
  }

  // Method to update dbusManager reference when extension recreates it
  updateDbusManager(dbusManager) {
    this.dbusManager = dbusManager;
  }

  async startRecording(settings) {
    if (this.currentRecordingId) {
      console.log("Recording already in progress");
      return false;
    }

    try {
      // Reset cancellation flag for new recording
      this.isCancelled = false;

      const recordingDuration = settings.get_int("recording-duration");
      const copyToClipboard = settings.get_boolean("copy-to-clipboard");
      const skipPreviewX11 = settings.get_boolean("skip-preview-x11");

      // Store settings for later use in transcription handling
      this.lastRecordingSettings = {
        recordingDuration,
        copyToClipboard,
        skipPreviewX11,
      };

      // Always use preview mode for D-Bus service (it just controls service behavior)
      // We'll handle the skip-preview logic in the extension when we get the transcription
      const previewMode = true;

      console.log(
        `Starting recording: duration=${recordingDuration}, clipboard=${copyToClipboard}, skipPreview=${skipPreviewX11}`
      );

      if (!this.dbusManager) {
        console.error("RecordingStateManager: dbusManager is null");
        return false;
      }

      const recordingId = await this.dbusManager.startRecording(
        recordingDuration,
        copyToClipboard,
        previewMode
      );

      this.currentRecordingId = recordingId;
      this.updateIcon(true);
      console.log(`Recording started with ID: ${recordingId}`);
      return true;
    } catch (e) {
      console.error(`Error starting recording: ${e}`);
      this.updateIcon(false);
      return false;
    }
  }

  async stopRecording() {
    if (!this.currentRecordingId) {
      console.log("No recording to stop");
      return false;
    }

    console.log(`Stopping recording: ${this.currentRecordingId}`);
    try {
      await this.dbusManager.stopRecording(this.currentRecordingId);
      this.updateIcon(false);

      // Show processing state instead of closing dialog
      if (
        this.recordingDialog &&
        typeof this.recordingDialog.showProcessing === "function"
      ) {
        console.log("Showing processing state after manual stop");
        this.recordingDialog.showProcessing();
      }

      // Don't set currentRecordingId to null or close dialog yet
      // Wait for transcription to complete
      // Also don't reset isCancelled flag here - we want to process the audio

      return true;
    } catch (e) {
      console.error(`Error stopping recording: ${e}`);
      return false;
    }
  }

  handleRecordingCompleted(recordingId) {
    console.log(`=== RECORDING COMPLETED ===`);
    console.log(`Recording ID: ${recordingId}`);
    console.log(`Current Recording ID: ${this.currentRecordingId}`);
    console.log(`Dialog exists: ${!!this.recordingDialog}`);
    console.log(`Is cancelled: ${this.isCancelled}`);

    // If the recording was cancelled, ignore the completion
    if (this.isCancelled) {
      console.log("Recording was cancelled - ignoring completion");
      return;
    }

    // If we don't have a dialog, the recording was already stopped manually
    if (!this.recordingDialog) {
      console.log(
        `Recording ${recordingId} completed but dialog already closed (manual stop)`
      );
      return;
    }

    // Show processing state
    if (
      this.recordingDialog &&
      typeof this.recordingDialog.showProcessing === "function"
    ) {
      console.log("Showing processing state after automatic completion");
      this.recordingDialog.showProcessing();
    } else {
      console.log(`ERROR: Dialog does not have showProcessing method`);
    }

    // Don't close the dialog here - wait for transcription
    // The dialog will be closed in handleTranscriptionReady based on settings
  }

  async cancelRecording() {
    if (!this.currentRecordingId) {
      return false;
    }

    console.log(
      "Recording cancelled by user - discarding audio without processing"
    );
    this.isCancelled = true; // Set the cancellation flag

    // Use the D-Bus service CancelRecording method to properly clean up
    try {
      await this.dbusManager.cancelRecording(this.currentRecordingId);
      console.log("D-Bus cancel recording completed successfully");
    } catch (error) {
      console.log("Error calling D-Bus cancel recording:", error.message);
      // Continue with local cleanup even if D-Bus call fails
    }

    // Clean up our local state
    this.currentRecordingId = null;
    this.updateIcon(false);

    // Close dialog on cancel with error handling
    if (this.recordingDialog) {
      try {
        console.log("Closing dialog after cancellation");
        this.recordingDialog.close();
      } catch (error) {
        console.log("Error closing dialog after cancellation:", error.message);
      } finally {
        this.recordingDialog = null;
      }
    }

    return true;
  }

  setRecordingDialog(dialog) {
    console.log(`=== SETTING RECORDING DIALOG ===`);
    console.log(`Previous dialog: ${!!this.recordingDialog}`);
    console.log(`New dialog: ${!!dialog}`);
    this.recordingDialog = dialog;
  }

  isRecording() {
    return this.currentRecordingId !== null;
  }

  updateIcon(isRecording) {
    if (this.icon) {
      if (isRecording) {
        this.icon.set_style(`color: ${COLORS.PRIMARY};`);
      } else {
        this.icon.set_style("");
      }
    }
  }

  handleTranscriptionReady(recordingId, text, settings) {
    console.log(`=== TRANSCRIPTION READY ===`);
    console.log(`Recording ID: ${recordingId}`);
    console.log(`Current Recording ID: ${this.currentRecordingId}`);
    console.log(`Text: "${text}"`);
    console.log(`Dialog exists: ${!!this.recordingDialog}`);
    console.log(`Is cancelled: ${this.isCancelled}`);

    // If the recording was cancelled, ignore the transcription
    if (this.isCancelled) {
      console.log("Recording was cancelled - ignoring transcription");
      return { action: "ignored", text: null };
    }

    // Check if transcription is empty (no speech detected)
    if (!text || text.trim().length === 0) {
      console.log("No speech detected - showing notification");
      Main.notify("Speech2Text", "No speech detected");

      // Close dialog and clean up
      if (this.recordingDialog) {
        this.recordingDialog.close();
        this.recordingDialog = null;
      }
      this.currentRecordingId = null;
      this.updateIcon(false);
      return { action: "ignored", text: null };
    }

    // Check if we should skip preview and auto-insert
    const skipPreviewX11 = settings.get_boolean("skip-preview-x11");
    const isWayland = Meta.is_wayland_compositor();

    console.log(`=== SETTINGS CHECK ===`);
    console.log(`skipPreviewX11 (auto-insert): ${skipPreviewX11}`);
    console.log(`isWayland: ${isWayland}`);
    console.log(`Should show preview: ${!(!isWayland && skipPreviewX11)}`);

    // Check if we should show preview or auto-insert
    const shouldShowPreview = !(!isWayland && skipPreviewX11);

    if (shouldShowPreview) {
      console.log("=== PREVIEW MODE ===");
      if (
        this.recordingDialog &&
        typeof this.recordingDialog.showPreview === "function"
      ) {
        console.log("Using existing dialog for preview");
        this.recordingDialog.showPreview(text);
        this.currentRecordingId = null;
        return { action: "preview", text };
      } else {
        console.log("No dialog available, need to create preview dialog");
        this.currentRecordingId = null;
        this.updateIcon(false);
        return { action: "createPreview", text };
      }
    } else {
      console.log("=== AUTO-INSERT MODE ===");
      console.log("Auto-inserting text (skip preview enabled)");
      if (this.recordingDialog) {
        this.recordingDialog.close();
        this.recordingDialog = null;
      }
      this.currentRecordingId = null;
      this.updateIcon(false);
      return { action: "insert", text };
    }
  }

  handleRecordingError(recordingId, errorMessage) {
    console.log(`=== RECORDING ERROR ===`);
    console.log(`Recording ID: ${recordingId}`);
    console.log(`Current Recording ID: ${this.currentRecordingId}`);
    console.log(`Error: ${errorMessage}`);
    console.log(`Is cancelled: ${this.isCancelled}`);

    // If the recording was cancelled, ignore the error
    if (this.isCancelled) {
      console.log("Recording was cancelled - ignoring error");
      return;
    }

    // Show error in dialog if available
    if (
      this.recordingDialog &&
      typeof this.recordingDialog.showError === "function"
    ) {
      this.recordingDialog.showError(errorMessage);
    } else {
      console.log("No dialog available for error display");
    }

    // Clean up state
    this.currentRecordingId = null;
    this.updateIcon(false);
  }

  cleanup() {
    console.log("Cleaning up recording state manager");

    // Reset all state
    this.currentRecordingId = null;
    this.isCancelled = false;
    this.lastRecordingSettings = null;

    // Clean up dialog with error handling
    if (this.recordingDialog) {
      try {
        console.log("Closing recording dialog during cleanup");
        this.recordingDialog.close();
      } catch (error) {
        console.log(
          "Error closing recording dialog during cleanup:",
          error.message
        );
      } finally {
        this.recordingDialog = null;
      }
    }

    // Reset icon safely
    try {
      this.updateIcon(false);
    } catch (error) {
      console.log("Error resetting icon during cleanup:", error.message);
    }
  }
}
