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
  }

  async startRecording(settings) {
    if (this.currentRecordingId) {
      console.log("Recording already in progress");
      return false;
    }

    try {
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

    // If we don't have a dialog, the recording was already stopped manually
    if (!this.recordingDialog) {
      console.log(
        `Recording ${recordingId} completed but dialog already closed (manual stop)`
      );
      return;
    }

    if (recordingId !== this.currentRecordingId) {
      console.log(
        `Received completion for different recording: ${recordingId}`
      );
      return;
    }

    console.log(
      `Recording completed automatically: ${recordingId} - showing processing state`
    );
    // Don't set currentRecordingId to null yet - we need it for transcription
    this.updateIcon(false);

    // Show processing state in the dialog
    if (
      this.recordingDialog &&
      typeof this.recordingDialog.showProcessing === "function"
    ) {
      console.log(`Calling showProcessing on dialog`);
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

    console.log("Recording cancelled by user");
    try {
      await this.dbusManager.stopRecording(this.currentRecordingId);
    } catch (e) {
      console.error(`Error cancelling recording: ${e}`);
    }

    this.currentRecordingId = null;
    this.updateIcon(false);

    // Close dialog on cancel
    if (this.recordingDialog) {
      this.recordingDialog.close();
      this.recordingDialog = null;
    }

    return true;
  }

  setRecordingDialog(dialog) {
    console.log(`=== SETTING RECORDING DIALOG ===`);
    console.log(`Previous dialog: ${!!this.recordingDialog}`);
    console.log(`New dialog: ${!!dialog}`);
    this.recordingDialog = dialog;
  }

  getCurrentRecordingId() {
    return this.currentRecordingId;
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

  cleanup() {
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

    this.updateIcon(false);
  }
}
