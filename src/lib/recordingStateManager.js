import Meta from "gi://Meta";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { COLORS } from "./constants.js";
import { log } from "./resourceUtils.js";

export class RecordingStateManager {
  constructor(icon, dbusManager) {
    this.icon = icon;
    this.dbusManager = dbusManager;
    this.currentRecordingId = null;
    this.recordingDialog = null;
    this.isCancelled = false; // Flag to track if recording was cancelled
  }

  // Method to update dbusManager reference when extension recreates it
  updateDbusManager(dbusManager) {
    this.dbusManager = dbusManager;
  }

  async startRecording(settings) {
    if (this.currentRecordingId) {
      log.debug("Recording already in progress");
      return false;
    }

    try {
      // Reset cancellation flag for new recording
      this.isCancelled = false;

      const recordingDuration = settings.get_int("recording-duration");
      const copyToClipboard = settings.get_boolean("copy-to-clipboard");
      const skipPreviewX11 = settings.get_boolean("skip-preview-x11");
      const whisperModel = settings.get_string("whisper-model") || "base";
      const whisperDevice = settings.get_string("whisper-device") || "cpu";

      // Always use preview mode for D-Bus service (it just controls service behavior)
      // We'll handle the skip-preview logic in the extension when we get the transcription
      const previewMode = true;

      log.debug(
        `Starting recording: duration=${recordingDuration}, clipboard=${copyToClipboard}, skipPreview=${skipPreviewX11}, model=${whisperModel}, device=${whisperDevice}`
      );

      if (!this.dbusManager) {
        console.error("RecordingStateManager: dbusManager is null");
        return false;
      }

      // Ensure the service uses the user's selected model/device before recording starts.
      try {
        const applied = await this.dbusManager.setWhisperConfig(
          whisperModel,
          whisperDevice
        );
        if (!applied) {
          // Service is an older version without SetWhisperConfig.
          // Allow default behavior (base+cpu) to continue for backwards compatibility.
          if (whisperModel === "base" && whisperDevice === "cpu") {
            log.debug(
              "Service does not support SetWhisperConfig yet; continuing with default base+cpu."
            );
          } else {
            Main.notify(
              "Speech2Text",
              "Your installed service is outdated and doesn't support model/device selection yet. Please reinstall/upgrade the service."
            );
            return false;
          }
        }
      } catch (e) {
        console.error(`Failed to set Whisper config: ${e.message}`);
        Main.notify(
          "Speech2Text Error",
          `Failed to apply Whisper settings: ${e.message}`
        );
        return false;
      }

      const recordingId = await this.dbusManager.startRecording(
        recordingDuration,
        copyToClipboard,
        previewMode
      );

      this.currentRecordingId = recordingId;
      this.updateIcon(true);
      log.debug(`Recording started with ID: ${recordingId}`);
      return true;
    } catch (e) {
      console.error(`Error starting recording: ${e}`);
      this.updateIcon(false);
      return false;
    }
  }

  async stopRecording() {
    if (!this.currentRecordingId) {
      log.debug("No recording to stop");
      return false;
    }

    log.debug(`Stopping recording: ${this.currentRecordingId}`);
    try {
      await this.dbusManager.stopRecording(this.currentRecordingId);
      this.updateIcon(false);

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
    log.debug(`=== RECORDING COMPLETED ===`);
    log.debug(`Recording ID: ${recordingId}`);
    log.debug(`Current Recording ID: ${this.currentRecordingId}`);
    log.debug(`Dialog exists: ${!!this.recordingDialog}`);
    log.debug(`Is cancelled: ${this.isCancelled}`);

    // If the recording was cancelled, ignore the completion
    if (this.isCancelled) {
      log.debug("Recording was cancelled - ignoring completion");
      return false;
    }

    // If we don't have a dialog, the recording was already stopped manually
    if (!this.recordingDialog) {
      log.debug(
        `Recording ${recordingId} completed but dialog already closed (manual stop)`
      );
      return false;
    }

    // Don't close the dialog here - wait for transcription
    // The dialog will be closed in handleTranscriptionReady based on settings
    return true;
  }

  async cancelRecording() {
    if (!this.currentRecordingId) {
      return false;
    }

    log.debug(
      "Recording cancelled by user - discarding audio without processing"
    );
    this.isCancelled = true; // Set the cancellation flag

    // Use the D-Bus service CancelRecording method to properly clean up
    try {
      await this.dbusManager.cancelRecording(this.currentRecordingId);
      log.debug("D-Bus cancel recording completed successfully");
    } catch (error) {
      log.warn("Error calling D-Bus cancel recording:", error.message);
      // Continue with local cleanup even if D-Bus call fails
    }

    // Clean up our local state
    this.currentRecordingId = null;
    this.updateIcon(false);

    // Close dialog on cancel with error handling
    if (this.recordingDialog) {
      try {
        log.debug("Closing dialog after cancellation");
        this.recordingDialog.close();
      } catch (error) {
        log.warn("Error closing dialog after cancellation:", error.message);
      } finally {
        this.recordingDialog = null;
      }
    }

    return true;
  }

  setRecordingDialog(dialog) {
    log.debug(`=== SETTING RECORDING DIALOG ===`);
    log.debug(`Previous dialog: ${!!this.recordingDialog}`);
    log.debug(`New dialog: ${!!dialog}`);
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
    log.debug(`=== TRANSCRIPTION READY ===`);
    log.debug(`Recording ID: ${recordingId}`);
    log.debug(`Current Recording ID: ${this.currentRecordingId}`);
    log.debug(`Text: "${text}"`);
    log.debug(`Dialog exists: ${!!this.recordingDialog}`);
    log.debug(`Is cancelled: ${this.isCancelled}`);

    // If the recording was cancelled, ignore the transcription
    if (this.isCancelled) {
      log.debug("Recording was cancelled - ignoring transcription");
      return { action: "ignored", text: null };
    }

    // Non-blocking mode: NEVER auto-insert or show a modal preview.
    if (settings.get_boolean("non-blocking-transcription")) {
      log.debug("=== NON-BLOCKING MODE ===");
      // Ensure any existing dialog is closed/cleared (controller usually already did this).
      if (this.recordingDialog) {
        try {
          this.recordingDialog.close();
        } catch (e) {
          // Non-fatal.
        } finally {
          this.recordingDialog = null;
        }
      }

      this.currentRecordingId = null;
      this.updateIcon(false);
      return { action: "nonBlockingClipboard", text };
    }

    // Check if we should skip preview and auto-insert
    const skipPreviewX11 = settings.get_boolean("skip-preview-x11");
    const isWayland = Meta.is_wayland_compositor();

    log.debug(`=== SETTINGS CHECK ===`);
    log.debug(`skipPreviewX11 (auto-insert): ${skipPreviewX11}`);
    log.debug(`isWayland: ${isWayland}`);
    log.debug(`Should show preview: ${!(!isWayland && skipPreviewX11)}`);

    // Check if we should show preview or auto-insert
    const shouldShowPreview = !(!isWayland && skipPreviewX11);

    if (shouldShowPreview) {
      log.debug("=== PREVIEW MODE ===");
      if (
        this.recordingDialog &&
        typeof this.recordingDialog.showPreview === "function"
      ) {
        log.debug("Using existing dialog for preview");
        this.recordingDialog.showPreview(text);
        this.currentRecordingId = null;
        return { action: "preview", text };
      } else {
        log.debug("No dialog available, need to create preview dialog");
        this.currentRecordingId = null;
        this.updateIcon(false);
        return { action: "createPreview", text };
      }
    } else {
      log.debug("=== AUTO-INSERT MODE ===");
      log.debug("Auto-inserting text (skip preview enabled)");
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
    log.warn(`=== RECORDING ERROR ===`);
    log.debug(`Recording ID: ${recordingId}`);
    log.debug(`Current Recording ID: ${this.currentRecordingId}`);
    log.warn(`Error: ${errorMessage}`);
    log.debug(`Is cancelled: ${this.isCancelled}`);

    // If the recording was cancelled, ignore the error
    if (this.isCancelled) {
      log.debug("Recording was cancelled - ignoring error");
      return;
    }

    // Show error in dialog if available
    if (
      this.recordingDialog &&
      typeof this.recordingDialog.showError === "function"
    ) {
      this.recordingDialog.showError(errorMessage);
    } else {
      log.warn("No dialog available for error display");
    }

    // Clean up state
    this.currentRecordingId = null;
    this.updateIcon(false);
  }

  cleanup() {
    log.debug("Cleaning up recording state manager");

    // Reset all state
    this.currentRecordingId = null;
    this.isCancelled = false;

    // Clean up dialog with error handling
    if (this.recordingDialog) {
      try {
        log.debug("Closing recording dialog during cleanup");
        this.recordingDialog.close();
      } catch (error) {
        log.debug(
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
      log.warn("Error resetting icon during cleanup:", error.message);
    }
  }
}
