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

      this.isInitialized = true;
      console.log("D-Bus proxy initialized successfully");
      return true;
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
      if (this.dbusProxy) {
        this.dbusProxy.disconnectSignal(connection);
      }
    });
    this.signalConnections = [];
  }

  async checkServiceStatus() {
    if (!this.dbusProxy) {
      return { available: false, error: "D-Bus proxy not initialized" };
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
      return { available: false, error: `Service not available: ${e.message}` };
    }
  }

  async startRecording(duration, copyToClipboard, previewMode) {
    if (!this.dbusProxy) {
      throw new Error("D-Bus proxy not initialized");
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
    if (!this.dbusProxy) {
      throw new Error("D-Bus proxy not initialized");
    }

    try {
      const [success] = await this.dbusProxy.StopRecordingAsync(recordingId);
      return success;
    } catch (e) {
      throw new Error(`Failed to stop recording: ${e.message}`);
    }
  }

  async typeText(text, copyToClipboard) {
    if (!this.dbusProxy) {
      throw new Error("D-Bus proxy not initialized");
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

  destroy() {
    this.disconnectSignals();
    this.dbusProxy = null;
    this.isInitialized = false;
  }
}
