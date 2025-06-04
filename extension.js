import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import St from "gi://St";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

let button;

class RecordingDialog {
  constructor(onStop) {
    this.onStop = onStop;
    this.pulseAnimationId = null;
    this.pulseDirection = 1; // 1 for growing, -1 for shrinking
    this.pulseScale = 1.0;

    // Create modal barrier that covers the entire screen
    this.modalBarrier = new St.Widget({
      style: `
        background-color: rgba(0, 0, 0, 0.3);
      `,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    // Create main dialog container
    this.container = new St.Widget({
      style_class: "recording-dialog",
      style: `
        background-color: rgba(0, 0, 0, 0.85);
        border-radius: 12px;
        padding: 30px;
        border: 2px solid #ff8c00;
        min-width: 300px;
      `,
      layout_manager: new Clutter.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        spacing: 20,
      }),
      reactive: true,
      can_focus: true,
    });

    // Recording header
    let headerBox = new St.BoxLayout({
      vertical: false,
      style: "spacing: 15px;",
    });

    this.recordingIcon = new St.Icon({
      icon_name: "audio-input-microphone-symbolic",
      icon_size: 32,
      style: "color: #ff8c00;",
    });

    let recordingLabel = new St.Label({
      text: "🎤 Recording...",
      style: "font-size: 20px; font-weight: bold; color: white;",
    });

    headerBox.add_child(this.recordingIcon);
    headerBox.add_child(recordingLabel);

    // Instructions
    let instructionLabel = new St.Label({
      text: "Speak now\nClick 'Stop Recording' when done",
      style: "font-size: 16px; color: #ccc; text-align: center;",
    });

    // Stop button with proper styling and event handling
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
        min-width: 150px;
      `,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    // Make sure the button receives clicks
    this.stopButton.connect("clicked", () => {
      log("Stop button clicked!");
      this.close();
      if (this.onStop) {
        this.onStop();
      }
    });

    // Also handle button-press-event as backup
    this.stopButton.connect("button-press-event", () => {
      log("Stop button pressed!");
      this.close();
      if (this.onStop) {
        this.onStop();
      }
      return Clutter.EVENT_STOP; // Stop event propagation
    });

    // Add hover effects
    this.stopButton.connect("enter-event", () => {
      this.stopButton.set_style(`
        background-color: #ff6666 !important;
        color: white;
        border-radius: 8px;
        padding: 12px 24px;
        font-size: 14px;
        font-weight: bold;
        border: none;
        min-width: 150px;
      `);
    });

    this.stopButton.connect("leave-event", () => {
      this.stopButton.set_style(`
        background-color: #ff4444;
        color: white;
        border-radius: 8px;
        padding: 12px 24px;
        font-size: 14px;
        font-weight: bold;
        border: none;
        min-width: 150px;
      `);
    });

    this.container.add_child(headerBox);
    this.container.add_child(instructionLabel);
    this.container.add_child(this.stopButton);

    // Add the dialog to the modal barrier
    this.modalBarrier.add_child(this.container);

    // Prevent clicks from passing through the modal barrier
    this.modalBarrier.connect("button-press-event", (actor, event) => {
      // Only allow clicks on the dialog container and its children
      return Clutter.EVENT_STOP;
    });
  }

  open() {
    // Add to UI and make it cover the full screen
    Main.uiGroup.add_child(this.modalBarrier);

    // Set barrier to cover entire screen
    let monitor = Main.layoutManager.primaryMonitor;
    this.modalBarrier.set_position(monitor.x, monitor.y);
    this.modalBarrier.set_size(monitor.width, monitor.height);

    // Center the dialog container within the barrier
    this.container.set_position(
      (monitor.width - 300) / 2, // Approximate width
      (monitor.height - 200) / 2 // Approximate height
    );

    this.modalBarrier.show();

    // Give focus to the stop button
    this.stopButton.grab_key_focus();

    // Start the pulse animation
    this.startPulseAnimation();
  }

  close() {
    // Stop the pulse animation
    this.stopPulseAnimation();

    if (this.modalBarrier && this.modalBarrier.get_parent()) {
      Main.uiGroup.remove_child(this.modalBarrier);
    }
    this.modalBarrier = null;
    this.container = null;
  }

  startPulseAnimation() {
    // Stop any existing animation
    this.stopPulseAnimation();

    this.pulseAnimationId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
      // Pulse between 0.8 and 1.2 scale
      this.pulseScale += this.pulseDirection * 0.04;

      if (this.pulseScale >= 1.2) {
        this.pulseScale = 1.2;
        this.pulseDirection = -1;
      } else if (this.pulseScale <= 0.8) {
        this.pulseScale = 0.8;
        this.pulseDirection = 1;
      }

      // Apply the pulsing effect to the microphone icon
      this.recordingIcon.set_style(`
        color: #ff8c00;
        transform: scale(${this.pulseScale});
        transition: transform 0.1s ease-in-out;
      `);

      return true; // Continue animation
    });
  }

  stopPulseAnimation() {
    if (this.pulseAnimationId) {
      GLib.source_remove(this.pulseAnimationId);
      this.pulseAnimationId = null;
    }
    // Reset icon to normal state
    if (this.recordingIcon) {
      this.recordingIcon.set_style("color: #ff8c00;");
    }
    this.pulseScale = 1.0;
    this.pulseDirection = 1;
  }
}

export default class WhisperTypingExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    this.recordingDialog = null;
    this.recordingProcess = null;
    this.settings = null;
  }

  enable() {
    // Initialize settings
    this.settings = this.getSettings();

    // Create panel button
    button = new PanelMenu.Button(0.0, "WhisperTyping");
    this.icon = new St.Icon({
      gicon: Gio.icon_new_for_string(
        this.path + "/icons/microphone-symbolic.svg"
      ),
      style_class: "system-status-icon",
    });
    button.add_child(this.icon);

    // Function to handle recording toggle
    const toggleRecording = () => {
      if (this.recordingProcess) {
        // If recording, stop it
        if (this.recordingDialog) {
          this.recordingDialog.close();
          this.recordingDialog = null;
        }
        try {
          GLib.spawn_command_line_sync(`kill -USR1 ${this.recordingProcess}`);
        } catch (e) {
          log(`Error sending stop signal: ${e}`);
        }
        this.recordingProcess = null;
        this.icon.set_style("");
      } else {
        // If not recording, start it
        this.icon.set_style("color: #ff8c00;");
        this.startRecording();
      }
    };

    // Connect button click to toggle recording
    button.connect("button-press-event", () => toggleRecording());

    // Set up keyboard shortcut using Main.wm.addKeybinding
    Main.wm.addKeybinding(
      "toggle-recording",
      this.settings,
      Meta.KeyBindingFlags.NONE,
      Shell.ActionMode.NORMAL,
      () => toggleRecording()
    );

    Main.panel.addToStatusArea("WhisperTyping", button);
  }

  startRecording() {
    try {
      let [success, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
        null,
        [`${this.path}/venv/bin/python3`, `${this.path}/whisper_typing.py`],
        null,
        GLib.SpawnFlags.DO_NOT_REAP_CHILD,
        null
      );

      if (success) {
        this.recordingProcess = pid;

        // Show recording dialog immediately as fallback
        this.recordingDialog = new RecordingDialog(() => {
          // Stop callback - send gentle signal to stop recording but allow processing
          if (this.recordingProcess) {
            try {
              GLib.spawn_command_line_sync(
                `kill -USR1 ${this.recordingProcess}`
              );
            } catch (e) {
              log(`Error sending stop signal: ${e}`);
            }
          }
          this.recordingDialog = null;
          this.recordingProcess = null;
          this.icon.set_style("");
        });
        this.recordingDialog.open();

        // Set up stdout reading
        let stdoutStream = new Gio.DataInputStream({
          base_stream: new Gio.UnixInputStream({ fd: stdout }),
        });

        // Set up stderr reading
        let stderrStream = new Gio.DataInputStream({
          base_stream: new Gio.UnixInputStream({ fd: stderr }),
        });

        // Function to read lines from stdout
        const readOutput = () => {
          stdoutStream.read_line_async(
            GLib.PRIORITY_DEFAULT,
            null,
            (stream, result) => {
              try {
                let [line] = stream.read_line_finish(result);
                if (line) {
                  let lineStr = new TextDecoder().decode(line);
                  log(`Whisper stdout: ${lineStr}`);

                  // Continue reading
                  readOutput();
                }
              } catch (e) {
                log(`Error reading stdout: ${e}`);
              }
            }
          );
        };

        // Function to read lines from stderr
        const readErrors = () => {
          stderrStream.read_line_async(
            GLib.PRIORITY_DEFAULT,
            null,
            (stream, result) => {
              try {
                let [line] = stream.read_line_finish(result);
                if (line) {
                  let lineStr = new TextDecoder().decode(line);
                  log(`Whisper stderr: ${lineStr}`);

                  // Continue reading
                  readErrors();
                }
              } catch (e) {
                log(`Error reading stderr: ${e}`);
              }
            }
          );
        };

        // Start reading both streams
        readOutput();
        readErrors();

        // Watch for process completion
        GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, () => {
          // Process completed - reset panel icon
          this.recordingProcess = null;
          if (this.recordingDialog) {
            this.recordingDialog.close();
            this.recordingDialog = null;
          }
          // Reset panel icon color
          this.icon.set_style("");
          log("Whisper process completed");
        });
      }
    } catch (e) {
      log(`Error starting recording: ${e}`);
      if (this.recordingDialog) {
        this.recordingDialog.close();
        this.recordingDialog = null;
      }
      // Reset panel icon color
      this.icon.set_style("");
    }
  }

  disable() {
    if (this.recordingDialog) {
      this.recordingDialog.close();
      this.recordingDialog = null;
    }
    if (this.recordingProcess) {
      try {
        GLib.spawn_command_line_sync(`kill -USR1 ${this.recordingProcess}`);
      } catch (e) {
        log(`Error sending stop signal: ${e}`);
      }
      this.recordingProcess = null;
    }
    // Remove keyboard shortcut
    Main.wm.removeKeybinding("toggle-recording");

    if (button) {
      button.destroy();
      button = null;
    }
  }
}

function init(metadata) {
  return new WhisperTypingExtension(metadata);
}
