import Gio from "gi://Gio";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { log } from "./resourceUtils.js";

// D-Bus interface XML for the speech2text service
const Speech2TextInterface = `
<node>
  <interface name="org.gnome.Shell.Extensions.Speech2Text">
    <method name="SetWhisperConfig">
      <arg direction="in" type="s" name="model" />
      <arg direction="in" type="s" name="device" />
      <arg direction="out" type="b" name="success" />
    </method>
    <method name="StartRecording">
      <arg direction="in" type="i" name="duration" />
      <arg direction="in" type="b" name="copy_to_clipboard" />
      <arg direction="in" type="b" name="preview_mode" />
      <arg direction="out" type="s" name="recording_id" />
    </method>
    <method name="StopRecording">
      <arg direction="in" type="s" name="recording_id" />
      <arg direction="out" type="b" name="success" />
    </method>
    <method name="CancelRecording">
      <arg direction="in" type="s" name="recording_id" />
      <arg direction="out" type="b" name="success" />
    </method>
    <method name="TypeText">
      <arg direction="in" type="s" name="text" />
      <arg direction="in" type="b" name="copy_to_clipboard" />
      <arg direction="out" type="b" name="success" />
    </method>
    <method name="GetServiceStatus">
      <arg direction="out" type="s" name="status" />
    </method>
    <method name="CheckDependencies">
      <arg direction="out" type="b" name="all_available" />
      <arg direction="out" type="as" name="missing_dependencies" />
    </method>
    <signal name="RecordingStarted">
      <arg type="s" name="recording_id" />
    </signal>
    <signal name="RecordingStopped">
      <arg type="s" name="recording_id" />
      <arg type="s" name="reason" />
    </signal>
    <signal name="TranscriptionReady">
      <arg type="s" name="recording_id" />
      <arg type="s" name="text" />
    </signal>
    <signal name="RecordingError">
      <arg type="s" name="recording_id" />
      <arg type="s" name="error_message" />
    </signal>
    <signal name="TextTyped">
      <arg type="s" name="text" />
      <arg type="b" name="success" />
    </signal>
  </interface>
</node>`;

export class DBusManager {
  constructor() {
    this.dbusProxy = null;
    this.signalConnections = [];
    this._signalHandlers = null;
    this.isInitialized = false;
    this.lastConnectionCheck = 0;
    this.connectionCheckInterval = 10000; // Check every 10 seconds
    this.serviceStartTimeoutId = null;
  }

  async initialize() {
    try {
      const Speech2TextProxy =
        Gio.DBusProxy.makeProxyWrapper(Speech2TextInterface);

      this.dbusProxy = new Speech2TextProxy(
        Gio.DBus.session,
        "org.gnome.Shell.Extensions.Speech2Text",
        "/org/gnome/Shell/Extensions/Speech2Text"
      );

      // Test if the service is actually reachable
      try {
        await this.dbusProxy.GetServiceStatusAsync();
        this.isInitialized = true;
        log.debug("D-Bus proxy initialized and service is reachable");

        // If we previously registered signal handlers, re-connect them whenever
        // we recreate the proxy (e.g. after service restart or reconnect).
        if (this._signalHandlers) {
          this.connectSignals(this._signalHandlers);
        }
        return true;
      } catch (serviceError) {
        log.debug(
          "D-Bus proxy created but service is not reachable:",
          serviceError.message
        );
        // Don't set isInitialized = true if service isn't reachable
        return false;
      }
    } catch (e) {
      console.error(`Failed to initialize D-Bus proxy: ${e}`);
      return false;
    }
  }

  connectSignals(handlers) {
    if (!this.dbusProxy) {
      console.error("Cannot connect signals: D-Bus proxy not initialized");
      return false;
    }

    // Remember handlers so we can reconnect after proxy reinitialization.
    this._signalHandlers = handlers;

    // Clear existing connections
    this.disconnectSignals();

    // Connect to D-Bus signals
    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "RecordingStarted",
        (proxy, sender, [recordingId]) => {
          log.debug(`Recording started: ${recordingId}`);
          handlers.onRecordingStarted?.(recordingId);
        }
      )
    );

    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "RecordingStopped",
        (proxy, sender, [recordingId, reason]) => {
          log.debug(`Recording stopped: ${recordingId}, reason: ${reason}`);
          handlers.onRecordingStopped?.(recordingId, reason);
        }
      )
    );

    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "TranscriptionReady",
        (proxy, sender, [recordingId, text]) => {
          log.debug(`Transcription ready: ${recordingId}, text: ${text}`);
          handlers.onTranscriptionReady?.(recordingId, text);
        }
      )
    );

    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "RecordingError",
        (proxy, sender, [recordingId, errorMessage]) => {
          log.warn(`Recording error: ${recordingId}, error: ${errorMessage}`);
          handlers.onRecordingError?.(recordingId, errorMessage);
        }
      )
    );

    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "TextTyped",
        (proxy, sender, [text, success]) => {
          if (success) {
            Main.notify("Speech2Text", "Text inserted successfully!");
          } else {
            Main.notify("Speech2Text Error", "Failed to insert text.");
          }
          handlers.onTextTyped?.(text, success);
        }
      )
    );

    log.debug("D-Bus signals connected successfully");
    return true;
  }

  disconnectSignals() {
    this.signalConnections.forEach((connection) => {
      if (this.dbusProxy && connection) {
        try {
          this.dbusProxy.disconnectSignal(connection);
        } catch (error) {
          log.debug(
            `Signal connection ${connection} was already disconnected or invalid`
          );
        }
      }
    });
    this.signalConnections = [];
  }

  async checkServiceStatus() {
    if (!this.dbusProxy) {
      return {
        available: false,
        error: "Service not installed. Please run the installation first.",
      };
    }

    try {
      const [status] = await this.dbusProxy.GetServiceStatusAsync();

      if (status.startsWith("dependencies_missing:")) {
        const missing = status
          .substring("dependencies_missing:".length)
          .split(",");
        return {
          available: false,
          error: `Missing dependencies: ${missing.join(", ")}`,
        };
      }

      if (status.startsWith("ready:")) {
        return { available: true };
      }

      if (status.startsWith("error:")) {
        const error = status.substring("error:".length);
        return { available: false, error };
      }

      return { available: false, error: "Unknown service status" };
    } catch (e) {
      console.error(`Error checking service status: ${e}`);

      // Provide more helpful error messages
      if (
        e.message &&
        e.message.includes("org.freedesktop.DBus.Error.ServiceUnknown")
      ) {
        if (e.message.includes("not activatable")) {
          return {
            available: false,
            error:
              "Service is not activatable. The D-Bus activation file may be missing or invalid.\nReinstall the service, then restart GNOME Shell:\n• X11: Alt+F2, type 'r', press Enter\n• Wayland: Log out and log back in",
          };
        }
        return {
          available: false,
          error:
            "Service installed but not running. Please restart GNOME Shell:\n• X11: Alt+F2, type 'r', press Enter\n• Wayland: Log out and log back in",
        };
      } else if (
        e.message &&
        e.message.includes("org.freedesktop.DBus.Error.NoReply")
      ) {
        return {
          available: false,
          error:
            "Service not responding. Please restart GNOME Shell or check if dependencies are installed.",
        };
      } else {
        return {
          available: false,
          error: `Service error: ${
            e.message || "Unknown error"
          }. Try restarting GNOME Shell.`,
        };
      }
    }
  }

  async setWhisperConfig(model, device) {
    const connectionReady = await this.ensureConnection();
    if (!connectionReady || !this.dbusProxy) {
      throw new Error("D-Bus connection not available");
    }

    try {
      const [success] = await this.dbusProxy.SetWhisperConfigAsync(
        String(model || "base"),
        String(device || "cpu")
      );
      if (!success) {
        throw new Error(
          "Service rejected Whisper settings. Check model/device values and reinstall service if needed."
        );
      }
      return success;
    } catch (e) {
      // Backwards compatibility: older service versions don't implement SetWhisperConfig yet.
      const msg = String(e?.message || e);
      if (msg.includes("UnknownMethod") || msg.includes("could not be found")) {
        return false;
      }
      throw new Error(`Failed to set Whisper config: ${msg}`);
    }
  }

  async startRecording(duration, copyToClipboard, previewMode) {
    const connectionReady = await this.ensureConnection();
    if (!connectionReady || !this.dbusProxy) {
      throw new Error("D-Bus connection not available");
    }

    try {
      const [recordingId] = await this.dbusProxy.StartRecordingAsync(
        duration,
        copyToClipboard,
        previewMode
      );
      return recordingId;
    } catch (e) {
      throw new Error(`Failed to start recording: ${e.message}`);
    }
  }

  async stopRecording(recordingId) {
    const connectionReady = await this.ensureConnection();
    if (!connectionReady || !this.dbusProxy) {
      throw new Error("D-Bus connection not available");
    }

    try {
      const [success] = await this.dbusProxy.StopRecordingAsync(recordingId);
      return success;
    } catch (e) {
      throw new Error(`Failed to stop recording: ${e.message}`);
    }
  }

  async cancelRecording(recordingId) {
    const connectionReady = await this.ensureConnection();
    if (!connectionReady || !this.dbusProxy) {
      throw new Error("D-Bus connection not available");
    }

    try {
      const [success] = await this.dbusProxy.CancelRecordingAsync(recordingId);
      return success;
    } catch (e) {
      throw new Error(`Failed to cancel recording: ${e.message}`);
    }
  }

  async typeText(text, copyToClipboard) {
    const connectionReady = await this.ensureConnection();
    if (!connectionReady || !this.dbusProxy) {
      throw new Error("D-Bus connection not available");
    }

    try {
      const [success] = await this.dbusProxy.TypeTextAsync(
        text,
        copyToClipboard
      );
      return success;
    } catch (e) {
      throw new Error(`Failed to type text: ${e.message}`);
    }
  }

  async validateConnection() {
    // Check if we should validate the connection
    const now = Date.now();
    if (now - this.lastConnectionCheck < this.connectionCheckInterval) {
      return this.isInitialized && this.dbusProxy !== null;
    }

    this.lastConnectionCheck = now;

    if (!this.dbusProxy || !this.isInitialized) {
      log.warn("D-Bus connection invalid, need to reinitialize");
      return false;
    }

    try {
      // Quick test to see if the connection is still valid
      await this.dbusProxy.GetServiceStatusAsync();
      return true;
    } catch (e) {
      log.warn("D-Bus connection validation failed:", e.message);
      // Connection is stale, need to reinitialize
      this.isInitialized = false;
      this.dbusProxy = null;
      return false;
    }
  }

  async ensureConnection() {
    const isValid = await this.validateConnection();
    if (!isValid) {
      log.debug("Reinitializing D-Bus connection...");
      const initialized = await this.initialize();

      // If initialization failed, try to start the service
      if (!initialized) {
        log.debug("Service not available, attempting to start...");
        const serviceStarted = await this._startService();
        if (serviceStarted) {
          return await this.initialize();
        }
      }

      return initialized;
    }
    return true;
  }

  async _startService() {
    try {
      log.debug("Starting Speech2Text service...");

      // Get the user's home directory
      const homeDir = GLib.get_home_dir();
      const servicePath = `${homeDir}/.local/share/gnome-speech2text-service/gnome-speech2text-service`;

      // Check if the service file exists
      const serviceFile = Gio.File.new_for_path(servicePath);
      if (!serviceFile.query_exists(null)) {
        console.error(`Service file not found: ${servicePath}`);
        return false;
      }

      // Start the service
      const subprocess = Gio.Subprocess.new(
        [servicePath],
        Gio.SubprocessFlags.NONE
      );

      // Wait for service to start and register with D-Bus
      await new Promise((resolve) => {
        this.serviceStartTimeoutId = GLib.timeout_add(
          GLib.PRIORITY_DEFAULT,
          3000,
          () => {
            this.serviceStartTimeoutId = null;
            resolve();
            return false;
          }
        );
      });

      // Verify service is available
      try {
        const testProxy = Gio.DBusProxy.new_sync(
          Gio.DBus.session,
          Gio.DBusProxyFlags.NONE,
          null,
          "org.gnome.Shell.Extensions.Speech2Text",
          "/org/gnome/Shell/Extensions/Speech2Text",
          "org.gnome.Shell.Extensions.Speech2Text",
          null
        );

        const [status] = testProxy.GetServiceStatusSync();
        if (status.startsWith("ready:")) {
          log.debug("Service started successfully");
          return true;
        } else {
          log.debug(`Service started but not ready: ${status}`);
          return false;
        }
      } catch (testError) {
        log.debug("Service not available after start attempt");
        return false;
      }
    } catch (e) {
      console.error(`Failed to start service: ${e}`);
      return false;
    }
  }

  destroy() {
    this.disconnectSignals();

    // Clean up any pending timeout
    if (this.serviceStartTimeoutId) {
      GLib.Source.remove(this.serviceStartTimeoutId);
      this.serviceStartTimeoutId = null;
    }

    this.dbusProxy = null;
    this.isInitialized = false;
    this.lastConnectionCheck = 0;
  }
}
