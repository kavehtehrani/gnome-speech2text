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
      this.dbusManager = new DBusManager();
    }

    // Double-check that dbusManager wasn't nullified during creation
    if (!this.dbusManager) {
      console.log("D-Bus manager became null after creation attempt");
      return false;
    }

    if (!this.dbusManager.isInitialized) {
      console.log("D-Bus manager not initialized, initializing...");
      const initialized = await this.dbusManager.initialize();
      if (!initialized) {
        console.log("Failed to initialize D-Bus manager");
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

    // Ensure D-Bus manager is available
    const dbusReady = await this.initialize();
    if (!dbusReady || !this.dbusManager) {
      console.error("Failed to ensure D-Bus manager is ready for text typing");
      throw new Error("Failed to connect to service.");
    }

    console.log(`Typing text via D-Bus: "${text}"`);

    await this.dbusManager.typeText(text.trim(), copyToClipboard);
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
