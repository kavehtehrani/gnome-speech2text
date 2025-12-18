import St from "gi://St";
import { RecordingStateManager } from "./recordingStateManager.js";
import { RecordingDialog } from "./recordingDialog.js";
import { log } from "./resourceUtils.js";

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
    // Service readiness is handled by the extension entrypoint (single source of truth).
    // Here we only ensure our local state manager exists.
    if (!this.recordingStateManager) this.initialize();

    // Now handle the actual recording toggle
    if (this.recordingStateManager.isRecording()) {
      log.debug("Stopping recording");
      const stopped = await this.recordingStateManager.stopRecording();
      if (stopped) {
        this._beginTranscriptionUi();
      }
    } else {
      log.debug("Starting recording");

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
            log.debug(`Inserting text: ${text}`);
            this._typeText(text);
            this.recordingStateManager.setRecordingDialog(null);
          },
          async () => {
            // Stop callback
            log.debug("Stop recording button clicked");
            const stopped = await this.recordingStateManager.stopRecording();
            if (stopped) {
              this._beginTranscriptionUi();
            }
          },
          settings.get_int("recording-duration")
        );

        this.recordingStateManager.setRecordingDialog(recordingDialog);
        log.debug(
          "RecordingController: Created and set recording dialog, opening now"
        );
        recordingDialog.open();
      } else {
        // If the user selected a non-default model/device, a common cause is an older
        // service version that doesn't support SetWhisperConfig yet.
        const selectedModel = settings.get_string("whisper-model") || "base";
        const selectedDevice = settings.get_string("whisper-device") || "cpu";
        if (selectedModel !== "base" || selectedDevice !== "cpu") {
          this.uiManager.showServiceSetupDialog(
            "Your installed Speech2Text service is outdated and doesn't support model/device selection yet. Reinstall/upgrade the service using the options below."
          );
        }
      }
    }
  }

  handleRecordingStopped(recordingId, reason) {
    if (!this.recordingStateManager) {
      log.debug("Recording state manager not initialized");
      return;
    }

    log.debug(
      `RecordingController: Recording stopped - ID: ${recordingId}, reason: ${reason}`
    );
    if (reason === "completed") {
      // Recording completed automatically - begin transcription UI.
      const shouldShowUi =
        this.recordingStateManager.handleRecordingCompleted(recordingId);
      if (shouldShowUi) {
        this._beginTranscriptionUi();
      }
    }
    // For manual stops (reason === "stopped"), the dialog is already closed
    // in the stopRecording method
  }

  handleTranscriptionReady(recordingId, text) {
    if (!this.recordingStateManager) {
      log.debug("Recording state manager not initialized");
      return;
    }

    this._endTranscriptionUi();

    log.debug(
      `RecordingController: Transcription ready - ID: ${recordingId}, text: "${text}"`
    );
    const result = this.recordingStateManager.handleTranscriptionReady(
      recordingId,
      text,
      this.uiManager.extensionCore.settings
    );

    log.debug(
      `RecordingController: Transcription result - action: ${result?.action}`
    );

    if (result && result.action === "nonBlockingClipboard") {
      // Non-blocking mode is clipboard-only: do NOT auto-insert or show a modal preview.
      try {
        const autoCopy =
          this.uiManager.extensionCore.settings.get_boolean(
            "copy-to-clipboard"
          );

        if (autoCopy) {
          const clipboard = St.Clipboard.get_default();
          clipboard.set_text(St.ClipboardType.CLIPBOARD, result.text);
          this.uiManager.showActionableNotification(
            "Speech2Text",
            "Transcription copied to clipboard. Click to review.",
            () => this._showCopyOnlyPreviewDialog(result.text)
          );
        } else {
          this.uiManager.showActionableNotification(
            "Speech2Text",
            "Transcription ready. Click to view and copy.",
            () => this._showCopyOnlyPreviewDialog(result.text)
          );
        }
      } catch (e) {
        console.error(`Error copying to clipboard: ${e}`);
      }
      return;
    }

    if (result && result.action === "insert") {
      this._typeText(result.text);
    } else if (result && result.action === "createPreview") {
      log.debug("Creating new preview dialog for transcribed text");
      this._showPreviewDialog(result.text);
    } else if (result && result.action === "ignored") {
      log.debug("Transcription ignored - recording was cancelled");
      // Nothing to do - recording was cancelled
    }
  }

  handleRecordingError(recordingId, errorMessage) {
    if (!this.recordingStateManager) {
      log.debug("Recording state manager not initialized");
      return;
    }

    this._endTranscriptionUi();

    if (
      this.uiManager.extensionCore.settings.get_boolean(
        "non-blocking-transcription"
      )
    ) {
      console.error(`Transcription failed: ${errorMessage}`);
    }

    this.recordingStateManager.handleRecordingError(recordingId, errorMessage);
  }

  _showPreviewDialog(text) {
    log.debug("Creating preview dialog for text:", text);

    // Create a new preview-only dialog
    const previewDialog = new RecordingDialog(
      () => {
        // Cancel callback - just close
        previewDialog.close();
      },
      (finalText) => {
        // Insert callback
        log.debug(`Inserting text from preview: ${finalText}`);
        this._typeText(finalText);
        previewDialog.close();
      },
      null, // No stop callback needed for preview-only
      0 // No duration for preview-only
    );

    // First open the dialog, then show preview
    log.debug("Opening preview dialog");
    previewDialog.open();
    log.debug("Showing preview in opened dialog");
    previewDialog.showPreview(text);
  }

  _showCopyOnlyPreviewDialog(text) {
    // Copy-only preview: disable insert even on X11 (predictable for non-blocking mode).
    const previewDialog = new RecordingDialog(
      () => {
        previewDialog.close();
      },
      null, // no insert callback
      null,
      0,
      { allowInsert: false }
    );
    previewDialog.open();
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
    }
  }

  _beginTranscriptionUi() {
    const settings = this.uiManager.extensionCore.settings;
    const nonBlocking = settings.get_boolean("non-blocking-transcription");

    if (nonBlocking) {
      // Close the blocking modal (if present) and replace with a small non-modal window.
      const dialog = this.recordingStateManager?.recordingDialog;
      if (dialog) {
        try {
          dialog.close();
        } catch (e) {
          // Non-fatal.
        } finally {
          this.recordingStateManager.setRecordingDialog(null);
        }
      }

      // Show processing state in tray icon (no notification - just visual indicator)
      this.uiManager.showProcessingState();
      return;
    }

    // Default behavior: use the existing modal dialog's processing UI.
    const dialog = this.recordingStateManager?.recordingDialog;
    if (dialog && typeof dialog.showProcessing === "function") {
      dialog.showProcessing();
    }
  }

  _endTranscriptionUi() {
    // Hide the processing state in tray icon
    this.uiManager.hideProcessingState();
  }

  cleanup() {
    if (this.recordingStateManager) {
      log.debug("Cleaning up recording state manager");
      this.recordingStateManager.cleanup();
      this.recordingStateManager = null;
    }

    this._endTranscriptionUi();
  }
}
