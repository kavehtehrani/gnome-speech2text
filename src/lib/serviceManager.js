import { DBusManager } from "./dbusManager.js";
import Gio from "gi://Gio";
import { log, getServiceDir } from "./resourceUtils.js";

export class ServiceManager {
  constructor() {
    this.dbusManager = null;
  }

  _hasInstallerMarker() {
    // Enforce: service must be installed via our installer, which writes install-state.conf.
    try {
      const path = `${getServiceDir()}/install-state.conf`;
      const file = Gio.File.new_for_path(path);
      return file.query_exists(null);
    } catch (_e) {
      return false;
    }
  }

  async initialize() {
    // Check if D-Bus manager exists and is initialized
    if (!this.dbusManager) {
      log.debug("D-Bus manager is null, creating new instance");
      this.dbusManager = new DBusManager();
    }

    // Double-check that dbusManager wasn't nullified during creation
    if (!this.dbusManager) {
      log.debug("D-Bus manager became null after creation attempt");
      return false;
    }

    if (!this.dbusManager.isInitialized) {
      log.debug("D-Bus manager not initialized, initializing...");
      const initialized = await this.dbusManager.initialize();
      if (!initialized) {
        log.warn("Failed to initialize D-Bus manager");
        return false;
      }
    }

    return true;
  }

  async ensureServiceAvailable() {
    // Ensure D-Bus manager is available and initialized
    const dbusReady = await this.initialize();
    if (!dbusReady || !this.dbusManager) {
      log.warn("D-Bus manager initialization failed or was nullified");
      return {
        available: false,
        error: "Failed to initialize Speech2Text service connection.",
      };
    }

    // Double-check that dbusManager is still valid (race condition protection)
    if (!this.dbusManager) {
      log.debug("D-Bus manager became null during initialization");
      return {
        available: false,
        error: "Speech2Text service connection became unavailable.",
      };
    }

    // Check service status
    const serviceStatus = await this.dbusManager.checkServiceStatus();
    if (!serviceStatus.available) {
      log.warn("Service not available:", serviceStatus.error);
      return { available: false, error: serviceStatus.error };
    }

    // Service is reachable, but we require installation via our installer.
    if (!this._hasInstallerMarker()) {
      return {
        available: false,
        error:
          "Speech2Text service installation is incomplete.\n" +
          `Please install (or reinstall) the service using the official installer so the marker file is created:\n  ${getServiceDir()}/install-state.conf`,
      };
    }

    return { available: true };
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
      log.debug("No text to type");
      return;
    }

    // Ensure D-Bus manager is available
    const dbusReady = await this.initialize();
    if (!dbusReady || !this.dbusManager) {
      console.error("Failed to ensure D-Bus manager is ready for text typing");
      throw new Error("Failed to connect to service.");
    }

    log.debug(`Typing text via D-Bus: "${text}"`);

    await this.dbusManager.typeText(text.trim(), copyToClipboard);
  }

  destroy() {
    if (this.dbusManager) {
      log.debug("Destroying D-Bus manager");
      try {
        this.dbusManager.destroy();
      } catch (error) {
        log.warn("Error destroying D-Bus manager:", error.message);
      } finally {
        this.dbusManager = null;
      }
    }
  }
}
