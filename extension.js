import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
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
  constructor(onStop, onCancel) {
    this.onStop = onStop;
    this.onCancel = onCancel;
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

    // Cancel button
    this.cancelButton = new St.Button({
      label: "Cancel",
      style_class: "button",
      style: `
        background-color: #666666;
        color: white;
        border-radius: 8px;
        padding: 12px 24px;
        font-size: 14px;
        font-weight: bold;
        border: none;
        min-width: 150px;
        margin-top: 10px;
      `,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    // Make sure the buttons receive clicks
    this.stopButton.connect("clicked", () => {
      log("Stop button clicked!");
      this.close();
      if (this.onStop) {
        this.onStop();
      }
    });

    this.cancelButton.connect("clicked", () => {
      log("Cancel button clicked!");
      this.close();
      if (this.onCancel) {
        this.onCancel();
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

    this.cancelButton.connect("button-press-event", () => {
      log("Cancel button pressed!");
      this.close();
      if (this.onCancel) {
        this.onCancel();
      }
      return Clutter.EVENT_STOP; // Stop event propagation
    });

    // Add hover effects for stop button
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

    // Add hover effects for cancel button
    this.cancelButton.connect("enter-event", () => {
      this.cancelButton.set_style(`
        background-color: #888888 !important;
        color: white;
        border-radius: 8px;
        padding: 12px 24px;
        font-size: 14px;
        font-weight: bold;
        border: none;
        min-width: 150px;
        margin-top: 10px;
      `);
    });

    this.cancelButton.connect("leave-event", () => {
      this.cancelButton.set_style(`
        background-color: #666666;
        color: white;
        border-radius: 8px;
        padding: 12px 24px;
        font-size: 14px;
        font-weight: bold;
        border: none;
        min-width: 150px;
        margin-top: 10px;
      `);
    });

    this.container.add_child(headerBox);
    this.container.add_child(instructionLabel);
    this.container.add_child(this.stopButton);
    this.container.add_child(this.cancelButton);

    // Add the dialog to the modal barrier
    this.modalBarrier.add_child(this.container);

    // Prevent clicks from passing through the modal barrier, but allow clicks on the dialog
    this.modalBarrier.connect("button-press-event", (actor, event) => {
      let [x, y] = event.get_coords();
      let [containerX, containerY] = this.container.get_position();
      let [containerW, containerH] = this.container.get_size();

      // If click is within the dialog container, let it pass through
      if (
        x >= containerX &&
        x <= containerX + containerW &&
        y >= containerY &&
        y <= containerY + containerH
      ) {
        return Clutter.EVENT_PROPAGATE;
      }

      // If click is outside the dialog, stop the event (close dialog on outside click could be added here)
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
    this.currentKeybinding = null;
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

    // Create popup menu
    this.createPopupMenu();

    // Function to handle recording toggle
    const toggleRecording = () => {
      if (this.recordingProcess) {
        // If recording, stop it (with transcription) - same as stop button
        if (this.recordingDialog) {
          this.recordingDialog.close();
          this.recordingDialog = null;
        }
        try {
          // Use USR1 for gentle stop with transcription
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

    // Connect button click to toggle recording (left click)
    button.connect("button-press-event", (actor, event) => {
      if (event.get_button() === 1) {
        // Left click
        toggleRecording();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });

    // Set up keyboard shortcut
    this.setupKeybinding();

    Main.panel.addToStatusArea("WhisperTyping", button);
  }

  createPopupMenu() {
    // Add menu item for keyboard shortcut customization
    let shortcutItem = new PopupMenu.PopupMenuItem(
      "Customize Keyboard Shortcut"
    );
    shortcutItem.connect("activate", () => {
      this.showShortcutDialog();
    });
    button.menu.addMenuItem(shortcutItem);

    // Add separator
    button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // Add current shortcut display
    this.shortcutLabel = new PopupMenu.PopupMenuItem("", { reactive: false });
    this.updateShortcutLabel();
    button.menu.addMenuItem(this.shortcutLabel);
  }

  updateShortcutLabel() {
    let shortcuts = this.settings.get_strv("toggle-recording");
    let shortcut =
      shortcuts.length > 0 ? shortcuts[0] : "<Control><Shift><Alt>c";
    this.shortcutLabel.label.text = `Current: ${shortcut}`;
  }

  showShortcutDialog() {
    // Create a modal dialog for capturing keyboard shortcut
    let dialog = new St.BoxLayout({
      style_class: "modal-dialog",
      vertical: true,
      style: `
        background-color: rgba(0, 0, 0, 0.9);
        border-radius: 12px;
        padding: 24px;
        min-width: 350px;
        border: 2px solid #ff8c00;
      `,
    });

    // Header with close button
    let headerBox = new St.BoxLayout({
      vertical: false,
      style: "spacing: 10px; margin-bottom: 15px;",
    });

    let title = new St.Label({
      text: "Keyboard Shortcut",
      style: "font-size: 18px; font-weight: bold; color: white;",
    });

    let closeButton = new St.Button({
      label: "✕",
      style: `
        background-color: #ff4444;
        color: white;
        border-radius: 50%;
        padding: 8px 12px;
        font-size: 16px;
        font-weight: bold;
        border: none;
        min-width: 32px;
        min-height: 32px;
      `,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    headerBox.add_child(title);
    headerBox.add_child(new St.Widget({ x_expand: true })); // Spacer
    headerBox.add_child(closeButton);

    let instruction = new St.Label({
      text: "Press the key combination you want to use for recording",
      style: "font-size: 14px; color: #ccc; margin-bottom: 15px;",
    });

    let currentLabel = new St.Label({
      text: `Current: ${
        this.settings.get_strv("toggle-recording")[0] ||
        "<Control><Shift><Alt>c"
      }`,
      style: "font-size: 12px; color: #888; margin-bottom: 15px;",
    });

    let cancelButton = new St.Button({
      label: "Cancel",
      style: `
        background-color: #666;
        color: white;
        border-radius: 6px;
        padding: 10px 20px;
        font-size: 14px;
        border: none;
        min-width: 80px;
      `,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    dialog.add_child(headerBox);
    dialog.add_child(instruction);
    dialog.add_child(currentLabel);
    dialog.add_child(cancelButton);

    // Create modal overlay
    let overlay = new St.Widget({
      style: "background-color: rgba(0, 0, 0, 0.5);",
      reactive: true,
      can_focus: true,
    });

    overlay.add_child(dialog);

    // Get proper screen dimensions
    let monitor = Main.layoutManager.primaryMonitor;
    overlay.set_size(monitor.width, monitor.height);

    // Center the dialog
    dialog.set_position((monitor.width - 350) / 2, (monitor.height - 250) / 2);

    Main.layoutManager.addTopChrome(overlay);

    // Function to close dialog
    const closeDialog = () => {
      if (keyPressId) {
        overlay.disconnect(keyPressId);
        keyPressId = null;
      }
      Main.layoutManager.removeChrome(overlay);
    };

    // Close button handlers
    closeButton.connect("clicked", closeDialog);
    cancelButton.connect("clicked", closeDialog);

    // Click outside to close
    overlay.connect("button-press-event", (actor, event) => {
      let [x, y] = event.get_coords();
      let [dialogX, dialogY] = dialog.get_position();
      let [dialogW, dialogH] = dialog.get_size();

      // If click is outside dialog area, close it
      if (
        x < dialogX ||
        x > dialogX + dialogW ||
        y < dialogY ||
        y > dialogY + dialogH
      ) {
        closeDialog();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });

    overlay.grab_key_focus();

    // Handle key press
    let keyPressId = overlay.connect("key-press-event", (actor, event) => {
      let keycode = event.get_key_code();
      let keyval = event.get_key_symbol();
      let state = event.get_state();

      // Handle Escape to cancel
      if (keyval === Clutter.KEY_Escape) {
        closeDialog();
        return Clutter.EVENT_STOP;
      }

      // Ignore modifier-only presses
      if (keyval >= Clutter.KEY_Shift_L && keyval <= Clutter.KEY_Hyper_R) {
        return Clutter.EVENT_STOP;
      }

      // Build shortcut string
      let shortcut = "";
      if (state & Clutter.ModifierType.CONTROL_MASK) shortcut += "<Control>";
      if (state & Clutter.ModifierType.SHIFT_MASK) shortcut += "<Shift>";
      if (state & Clutter.ModifierType.MOD1_MASK) shortcut += "<Alt>";
      if (state & Clutter.ModifierType.SUPER_MASK) shortcut += "<Super>";

      let keyname = Clutter.keyval_name(keyval);
      if (keyname) {
        shortcut += keyname.toLowerCase();

        // Save the new shortcut
        this.updateKeybinding(shortcut);

        // Close dialog
        closeDialog();

        // Show confirmation
        Main.notify(
          "Whisper Typing",
          `Keyboard shortcut changed to: ${shortcut}`
        );
      }

      return Clutter.EVENT_STOP;
    });
  }

  setupKeybinding() {
    // Remove existing keybinding if any
    if (this.currentKeybinding) {
      Main.wm.removeKeybinding("toggle-recording");
    }

    // Get shortcut from settings
    let shortcuts = this.settings.get_strv("toggle-recording");
    if (shortcuts.length > 0) {
      this.currentKeybinding = shortcuts[0];
    } else {
      this.currentKeybinding = "<Control><Shift><Alt>c";
      this.settings.set_strv("toggle-recording", [this.currentKeybinding]);
    }

    // Function to handle recording toggle
    const toggleRecording = () => {
      if (this.recordingProcess) {
        // If recording, stop it (with transcription) - same as stop button
        if (this.recordingDialog) {
          this.recordingDialog.close();
          this.recordingDialog = null;
        }
        try {
          // Use USR1 for gentle stop with transcription
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

    // Set up keyboard shortcut using Main.wm.addKeybinding
    Main.wm.addKeybinding(
      "toggle-recording",
      this.settings,
      Meta.KeyBindingFlags.NONE,
      Shell.ActionMode.NORMAL,
      () => toggleRecording()
    );
  }

  updateKeybinding(newShortcut) {
    // Save to settings
    this.settings.set_strv("toggle-recording", [newShortcut]);

    // Update current keybinding
    this.currentKeybinding = newShortcut;

    // Reregister keybinding
    this.setupKeybinding();

    // Update menu label
    this.updateShortcutLabel();
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
        this.recordingDialog = new RecordingDialog(
          () => {
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
          },
          () => {
            // Cancel callback - forcibly terminate process without transcription
            if (this.recordingProcess) {
              try {
                // Use SIGTERM to immediately terminate the process without transcription
                GLib.spawn_command_line_sync(
                  `kill -TERM ${this.recordingProcess}`
                );
              } catch (e) {
                log(`Error sending terminate signal: ${e}`);
              }
            }
            this.recordingDialog = null;
            this.recordingProcess = null;
            this.icon.set_style("");
          }
        );
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
