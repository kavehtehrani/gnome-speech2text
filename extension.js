import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import St from "gi://St";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

let button;

class RecordingDialog {
  constructor(onStop) {
    this.onStop = onStop;

    // Create main container
    this.container = new St.Widget({
      style_class: "recording-dialog",
      style: `
        background-color: rgba(0, 0, 0, 0.85);
        border-radius: 12px;
        padding: 30px;
        border: 2px solid #ff8c00;
        min-width: 300px;
      `,
      layout_manager: new Clutter.BinLayout(),
      reactive: true,
    });

    // Create content box
    let contentBox = new St.BoxLayout({
      vertical: true,
      style: "spacing: 20px;",
    });

    // Recording header
    let headerBox = new St.BoxLayout({
      vertical: false,
      style: "spacing: 15px;",
    });

    let recordingIcon = new St.Icon({
      icon_name: "audio-input-microphone-symbolic",
      icon_size: 32,
      style: "color: #ff8c00;",
    });

    let recordingLabel = new St.Label({
      text: "🎤 Recording...",
      style: "font-size: 20px; font-weight: bold; color: white;",
    });

    headerBox.add_child(recordingIcon);
    headerBox.add_child(recordingLabel);

    // Instructions
    let instructionLabel = new St.Label({
      text: "Speak now",
      style: "font-size: 16px; color: #ccc; text-align: center;",
    });

    // Stop button
    this.stopButton = new St.Button({
      label: "Stop Recording",
      style_class: "button",
      style: `
        background-color: #ff4444;
        color: white;
        border-radius: 8px;
        padding: 12px 24px;
        font-size: 14px;
        font-weight: bold;
        border: none;
      `,
      reactive: true,
    });

    this.stopButton.connect("clicked", () => {
      this.close();
      if (this.onStop) {
        this.onStop();
      }
    });

    contentBox.add_child(headerBox);
    contentBox.add_child(instructionLabel);
    contentBox.add_child(this.stopButton);

    this.container.add_child(contentBox);

    // Position the dialog in the center of the screen
    this.container.connect("notify::mapped", () => {
      if (this.container.mapped) {
        let monitor = Main.layoutManager.primaryMonitor;
        this.container.set_position(
          monitor.x + (monitor.width - this.container.width) / 2,
          monitor.y + (monitor.height - this.container.height) / 2
        );
      }
    });
  }

  open() {
    Main.uiGroup.add_child(this.container);
    this.container.show();
  }

  close() {
    if (this.container && this.container.get_parent()) {
      Main.uiGroup.remove_child(this.container);
    }
    this.container = null;
  }
}

export default class WhisperTypingExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    this.recordingDialog = null;
    this.recordingProcess = null;
  }

  enable() {
    button = new PanelMenu.Button(0.0, "WhisperTyping");
    this.icon = new St.Icon({
      gicon: Gio.icon_new_for_string(
        this.path + "/icons/microphone-symbolic.svg"
      ),
      style_class: "system-status-icon",
    });
    button.add_child(this.icon);
    button.connect("button-press-event", () => {
      // Change color to orange
      this.icon.set_style("color: #ff8c00;");

      // Show recording dialog
      this.recordingDialog = new RecordingDialog(() => {
        // Stop callback - terminate the python process if running
        if (this.recordingProcess) {
          try {
            GLib.spawn_close_pid(this.recordingProcess);
          } catch (e) {
            log(`Error stopping recording process: ${e}`);
          }
          this.recordingProcess = null;
        }
        this.recordingDialog = null;
        this.icon.set_style("");
      });
      this.recordingDialog.open();

      // Start the whisper script
      try {
        let [success, pid] = GLib.spawn_async(
          null, // working directory
          [`${this.path}/venv/bin/python3`, `${this.path}/whisper_typing.py`],
          null, // environment
          GLib.SpawnFlags.DO_NOT_REAP_CHILD,
          null // child setup
        );

        if (success) {
          this.recordingProcess = pid;

          // Watch for process completion
          GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, () => {
            // Process completed
            this.recordingProcess = null;
            if (this.recordingDialog) {
              this.recordingDialog.close();
              this.recordingDialog = null;
            }
            this.icon.set_style("");
          });
        }
      } catch (e) {
        log(`Error starting recording: ${e}`);
        if (this.recordingDialog) {
          this.recordingDialog.close();
          this.recordingDialog = null;
        }
        this.icon.set_style("");
      }

      // Fallback auto-close after 8 seconds
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 8000, () => {
        if (this.recordingDialog) {
          this.recordingDialog.close();
          this.recordingDialog = null;
        }
        this.icon.set_style("");
        return false;
      });
    });
    Main.panel.addToStatusArea("WhisperTyping", button);
  }

  disable() {
    if (this.recordingDialog) {
      this.recordingDialog.close();
      this.recordingDialog = null;
    }
    if (button) {
      button.destroy();
      button = null;
    }
  }
}

function init(metadata) {
  return new WhisperTypingExtension(metadata);
}
