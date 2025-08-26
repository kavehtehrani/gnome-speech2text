import { DBusManager } from "./dbusManager.js";

export class ServiceManager {
  constructor() {
    this.dbusManager = null;
    this.isInitialized = false;
  }

  async initialize() {
    // Check if D-Bus manager exists and is initialized
    if (!this.dbusManager) {
      console.log("D-Bus manager is null, creating new instance");
      try {
        this.dbusManager = new DBusManager();
      } catch (error) {
        console.error("Failed to create D-Bus manager:", error);
        return false;
      }
    }

    // Double-check that dbusManager wasn't nullified during creation
    if (!this.dbusManager) {
      console.log("D-Bus manager became null after creation attempt");
      return false;
    }

    if (!this.dbusManager.isInitialized) {
      console.log("D-Bus manager not initialized, initializing...");
      try {
        const initialized = await this.dbusManager.initialize();
        if (!initialized) {
          console.log("Failed to initialize D-Bus manager");
          return false;
        }
      } catch (error) {
        console.error("Error during D-Bus manager initialization:", error);
        return false;
      }
    }

    this.isInitialized = true;
    return true;
  }

  async ensureServiceAvailable() {
    // Ensure D-Bus manager is available and initialized
    const dbusReady = await this.initialize();
    if (!dbusReady || !this.dbusManager) {
      console.log("D-Bus manager initialization failed or was nullified");
      return false;
    }

    // Double-check that dbusManager is still valid (race condition protection)
    if (!this.dbusManager) {
      console.log("D-Bus manager became null during initialization");
      return false;
    }

    try {
      // Connect signals with handlers
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

      // Check service status
      const serviceStatus = await this.dbusManager.checkServiceStatus();
      if (!serviceStatus.available) {
        console.log("Service not available:", serviceStatus.error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error ensuring service availability:", error);
      return false;
    }
  }

  async validateAndReinitializeConnection() {
    // Validate and potentially reinitialize D-Bus connection after session changes
    if (this.dbusManager && !(await this.dbusManager.ensureConnection())) {
      console.log("D-Bus connection lost, attempting to reinitialize");
      // Try to completely reinitialize the D-Bus connection
      this.dbusManager.destroy();
      this.dbusManager = new DBusManager();
      const dbusInitialized = await this.initialize();
      if (!dbusInitialized) {
        console.error(
          "Failed to reinitialize D-Bus connection after session change"
        );
        return false;
      }
      return true;
    }
    return true;
  }

  connectSignals(handlers) {
    if (!this.dbusManager) {
      console.error("D-Bus manager not available for signal connection");
      return;
    }

    this.dbusManager.connectSignals(handlers);
  }

  async typeText(text, copyToClipboard) {
    if (!text || !text.trim()) {
      console.log("No text to type");
      return;
    }

    try {
      // Ensure D-Bus manager is available
      const dbusReady = await this.initialize();
      if (!dbusReady || !this.dbusManager) {
        console.error(
          "Failed to ensure D-Bus manager is ready for text typing"
        );
        throw new Error("Failed to connect to service.");
      }

      console.log(`Typing text via D-Bus: "${text}"`);

      await this.dbusManager.typeText(text.trim(), copyToClipboard);
    } catch (e) {
      console.error(`Error typing text: ${e}`);
      throw e;
    }
  }

  async startRecording(settings) {
    if (!this.dbusManager) {
      console.error("D-Bus manager not available for recording");
      return false;
    }

    return await this.dbusManager.startRecording(settings);
  }

  async stopRecording() {
    if (!this.dbusManager) {
      console.error("D-Bus manager not available for stopping recording");
      return false;
    }

    return await this.dbusManager.stopRecording();
  }

  async cancelRecording() {
    if (!this.dbusManager) {
      console.error("D-Bus manager not available for cancelling recording");
      return false;
    }

    return await this.dbusManager.cancelRecording();
  }

  isRecording() {
    if (!this.dbusManager) {
      return false;
    }

    return this.dbusManager.isRecording();
  }

  // Signal handlers - these will be overridden by the extension core
  _handleRecordingStopped(recordingId, reason) {
    console.log(
      `ServiceManager: Recording stopped - ID: ${recordingId}, reason: ${reason}`
    );
    // This will be handled by the recording controller
  }

  _handleTranscriptionReady(recordingId, text) {
    console.log(
      `ServiceManager: Transcription ready - ID: ${recordingId}, text: "${text}"`
    );
    // This will be handled by the recording controller
  }

  _handleRecordingError(recordingId, errorMessage) {
    console.log(
      `ServiceManager: Recording error - ID: ${recordingId}, error: ${errorMessage}`
    );
    // This will be handled by the recording controller
  }

  getDBusManager() {
    return this.dbusManager;
  }

  destroy() {
    if (this.dbusManager) {
      console.log("Destroying D-Bus manager");
      try {
        this.dbusManager.destroy();
      } catch (error) {
        console.log("Error destroying D-Bus manager:", error.message);
      } finally {
        this.dbusManager = null;
        this.isInitialized = false;
      }
    }
  }
}
