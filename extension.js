import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import St from "gi://St";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

let button;

class RecordingDialog {
  constructor() {
    // Create main container
    this.container = new St.Widget({
      style_class: "recording-dialog",
      style: `
        background-color: rgba(0, 0, 0, 0.8);
        border-radius: 15px;
        padding: 25px;
        border: 2px solid #ff8c00;
      `,
      layout_manager: new Clutter.BinLayout(),
      reactive: true,
    });

    // Create content box
    let contentBox = new St.BoxLayout({
      vertical: true,
      style: "spacing: 15px;",
    });

    // Recording icon and text
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
      style: "font-size: 18px; font-weight: bold; color: white;",
    });

    headerBox.add_child(recordingIcon);
    headerBox.add_child(recordingLabel);

    // Audio wave visualization area
    this.waveBox = new St.BoxLayout({
      vertical: false,
      style: "height: 60px; spacing: 2px; margin: 10px 0;",
    });

    // Create initial wave bars
    this.waveBars = [];
    for (let i = 0; i < 20; i++) {
      let bar = new St.Widget({
        style: `width: 8px; height: 10px; background-color: #ff8c00; margin: 0 1px; border-radius: 4px;`,
      });
      this.waveBox.add_child(bar);
      this.waveBars.push(bar);
    }

    let instructionLabel = new St.Label({
      text: "Speak now... Click to stop",
      style: "font-size: 14px; color: #ccc;",
    });

    contentBox.add_child(headerBox);
    contentBox.add_child(this.waveBox);
    contentBox.add_child(instructionLabel);

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

    // Start wave animation
    this.startWaveAnimation();

    // Close dialog when clicked
    this.container.connect("button-press-event", () => {
      this.close();
      return true;
    });
  }

  open() {
    Main.uiGroup.add_child(this.container);
    this.container.show();
  }

  startWaveAnimation() {
    this.animationId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      // Animate wave bars with random heights
      this.waveBars.forEach((bar, index) => {
        let height = Math.random() * 40 + 10; // Random height between 10-50px
        bar.set_style(
          `width: 8px; height: ${height}px; background-color: #ff8c00; margin: 0 1px; border-radius: 4px;`
        );
      });
      return true; // Continue animation
    });
  }

  close() {
    if (this.animationId) {
      GLib.source_remove(this.animationId);
      this.animationId = null;
    }
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
      this.recordingDialog = new RecordingDialog();
      this.recordingDialog.open();

      // Start the whisper script
      GLib.spawn_command_line_async(
        `${this.path}/venv/bin/python3 ${this.path}/whisper_typing.py`
      );

      // Auto-close dialog and reset color after 6 seconds
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 6000, () => {
        if (this.recordingDialog) {
          this.recordingDialog.close();
          this.recordingDialog = null;
        }
        this.icon.set_style("");
        return false; // Don't repeat the timeout
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
