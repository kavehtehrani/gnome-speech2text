import Gio from "gi://Gio";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

// D-Bus interface XML for the speech2text service
const Speech2TextInterface = `
<node>
  <interface name="org.gnome.Speech2Text">
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
    this.isInitialized = false;
    this.lastConnectionCheck = 0;
    this.connectionCheckInterval = 10000; // Check every 10 seconds
  }

  async initialize() {
    try {
      const Speech2TextProxy =
        Gio.DBusProxy.makeProxyWrapper(Speech2TextInterface);

      this.dbusProxy = new Speech2TextProxy(
        Gio.DBus.session,
        "org.gnome.Speech2Text",
        "/org/gnome/Speech2Text"
      );

      // Test if the service is actually reachable
      try {
        await this.dbusProxy.GetServiceStatusAsync();
        this.isInitialized = true;
        console.log("D-Bus proxy initialized and service is reachable");
        return true;
      } catch (serviceError) {
        console.log(
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

    // Clear existing connections
    this.disconnectSignals();

    // Connect to D-Bus signals
    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "RecordingStarted",
        (proxy, sender, [recordingId]) => {
          console.log(`Recording started: ${recordingId}`);
          handlers.onRecordingStarted?.(recordingId);
        }
      )
    );

    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "RecordingStopped",
        (proxy, sender, [recordingId, reason]) => {
          console.log(`Recording stopped: ${recordingId}, reason: ${reason}`);
          handlers.onRecordingStopped?.(recordingId, reason);
        }
      )
    );

    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "TranscriptionReady",
        (proxy, sender, [recordingId, text]) => {
          console.log(`Transcription ready: ${recordingId}, text: ${text}`);
          handlers.onTranscriptionReady?.(recordingId, text);
        }
      )
    );

    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "RecordingError",
        (proxy, sender, [recordingId, errorMessage]) => {
          console.log(
            `Recording error: ${recordingId}, error: ${errorMessage}`
          );
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

    console.log("D-Bus signals connected successfully");
    return true;
  }

  disconnectSignals() {
    this.signalConnections.forEach((connection) => {
      if (this.dbusProxy && connection) {
        try {
          this.dbusProxy.disconnectSignal(connection);
        } catch (error) {
          console.log(
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
      console.log("D-Bus connection invalid, need to reinitialize");
      return false;
    }

    try {
      // Quick test to see if the connection is still valid
      await this.dbusProxy.GetServiceStatusAsync();
      return true;
    } catch (e) {
      console.log("D-Bus connection validation failed:", e.message);
      // Connection is stale, need to reinitialize
      this.isInitialized = false;
      this.dbusProxy = null;
      return false;
    }
  }

  async ensureConnection() {
    const isValid = await this.validateConnection();
    if (!isValid) {
      console.log("Reinitializing D-Bus connection after validation failure");
      return await this.initialize();
    }
    return true;
  }

  destroy() {
    this.disconnectSignals();
    this.dbusProxy = null;
    this.isInitialized = false;
    this.lastConnectionCheck = 0;
  }
}
