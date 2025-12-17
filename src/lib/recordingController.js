import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { RecordingStateManager } from "./recordingStateManager.js";
import { RecordingDialog } from "./recordingDialog.js";
import { TranscriptionProgress } from "./transcriptionProgress.js";

export class RecordingController {
  constructor(uiManager, serviceManager) {
    this.uiManager = uiManager;
    this.serviceManager = serviceManager;
    this.recordingStateManager = null;
    this.transcriptionProgress = null;
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
        this.uiManager.showServiceSetupDialog(
          "Speech-to-text service is not available"
        );
        return;
      }

      const serviceStatus =
        await this.serviceManager.dbusManager.checkServiceStatus();
      if (!serviceStatus.available) {
        console.log("Service not available:", serviceStatus.error);
        this.uiManager.showServiceSetupDialog(serviceStatus.error);
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
          async () => {
            // Stop callback
            console.log("Stop recording button clicked");
            const stopped = await this.recordingStateManager.stopRecording();
            if (stopped) {
              this._beginTranscriptionUi();
            } else {
              this.uiManager.showErrorNotification(
                "Speech2Text Error",
                "Failed to stop recording."
              );
            }
          },
          settings.get_int("recording-duration")
        );

        this.recordingStateManager.setRecordingDialog(recordingDialog);
        console.log(
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
        } else {
          this.uiManager.showErrorNotification(
            "Speech2Text Error",
            "Failed to start recording. Please try again."
          );
        }
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
      console.log("Recording state manager not initialized");
      return;
    }

    this._endTranscriptionUi();

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
        this.uiManager.showErrorNotification(
          "Speech2Text Error",
          "Failed to handle transcription result."
        );
      }
      return;
    }

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

    this._endTranscriptionUi();

    if (
      this.uiManager.extensionCore.settings.get_boolean(
        "non-blocking-transcription"
      )
    ) {
      this.uiManager.showErrorNotification(
        "Speech2Text Error",
        `Transcription failed: ${errorMessage}`
      );
    }

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
      this.uiManager.showErrorNotification(
        "Speech2Text Error",
        "Failed to insert text."
      );
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

      if (this.transcriptionProgress) {
        this.transcriptionProgress.close();
        this.transcriptionProgress = null;
      }

      this.transcriptionProgress = new TranscriptionProgress(() => {
        // Cancel processing: discard audio and stop waiting.
        this.recordingStateManager.cancelRecording();
        this._endTranscriptionUi();
      });
      this.transcriptionProgress.open();
      return;
    }

    // Default behavior: use the existing modal dialog's processing UI.
    const dialog = this.recordingStateManager?.recordingDialog;
    if (dialog && typeof dialog.showProcessing === "function") {
      dialog.showProcessing();
    }
  }

  _endTranscriptionUi() {
    if (this.transcriptionProgress) {
      try {
        this.transcriptionProgress.close();
      } catch (e) {
        // Ignore cleanup errors.
      }
      this.transcriptionProgress = null;
    }
  }

  cleanup() {
    if (this.recordingStateManager) {
      console.log("Cleaning up recording state manager");
      this.recordingStateManager.cleanup();
      this.recordingStateManager = null;
    }

    this._endTranscriptionUi();
  }
}
