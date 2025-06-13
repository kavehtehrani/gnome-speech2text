import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { COLORS, STYLES } from "./constants.js";
import { createHoverButton } from "./uiUtils.js";

// Simple recording dialog using custom modal barrier
export class RecordingDialog {
  constructor(onStop, onCancel, maxDuration = 60) {
    log("🎯 RecordingDialog constructor called");

    this.onStop = onStop;
    this.onCancel = onCancel;
    this.maxDuration = maxDuration; // Maximum recording duration in seconds
    this.startTime = null; // Will be set when recording starts
    this.elapsedTime = 0; // Current elapsed time
    this.timerInterval = null; // Timer interval reference

    // Create modal barrier that covers the entire screen
    this.modalBarrier = new St.Widget({
      style: `
        background-color: ${COLORS.TRANSPARENT_BLACK_30};
      `,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    // Set up keyboard event handling for the modal barrier
    this.modalBarrier.connect("key-press-event", (actor, event) => {
      try {
        // Get the key symbol safely
        let keyval = event.get_key_symbol ? event.get_key_symbol() : null;

        if (!keyval) {
          log(`🎯 KEYBOARD EVENT: Could not get key symbol`);
          return Clutter.EVENT_PROPAGATE;
        }

        // Try to get key name safely
        let keyname = "unknown";
        try {
          if (Clutter.get_key_name) {
            keyname = Clutter.get_key_name(keyval) || `keycode-${keyval}`;
          }
        } catch (nameError) {
          keyname = `keycode-${keyval}`;
        }

        log(`🎯 KEYBOARD EVENT RECEIVED: ${keyname} (${keyval})`);

        if (keyval === Clutter.KEY_Escape) {
          // Escape = Cancel (no transcription)
          log(`🎯 Canceling recording via keyboard: ${keyname}`);
          this.close();
          this.onCancel?.();
          return Clutter.EVENT_STOP;
        } else if (
          keyval === Clutter.KEY_space ||
          keyval === Clutter.KEY_Return ||
          keyval === Clutter.KEY_KP_Enter
        ) {
          // Enter/Space = Stop and process (with transcription)
          log(`🎯 Stopping recording via keyboard: ${keyname}`);
          this.close();
          this.onStop?.();
          return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
      } catch (e) {
        log(`🎯 KEYBOARD EVENT ERROR: ${e}`);
        return Clutter.EVENT_STOP;
      }
    });

    this._buildDialog();

    log("🎯 RecordingDialog constructor completed successfully");
  }

  _buildDialog() {
    // Create main dialog container
    this.container = new St.Widget({
      style_class: "recording-dialog",
      style: `
        background-color: ${COLORS.TRANSPARENT_BLACK_85};
        border-radius: ${STYLES.DIALOG_BORDER_RADIUS};
        padding: ${STYLES.DIALOG_PADDING};
        border: ${STYLES.DIALOG_BORDER};
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
    const headerBox = new St.BoxLayout({
      vertical: false,
      style: "spacing: 15px;",
      x_align: Clutter.ActorAlign.CENTER,
      y_align: Clutter.ActorAlign.CENTER,
      x_expand: false,
    });

    this.recordingIcon = new St.Label({
      text: "🎤",
      style: "font-size: 48px; text-align: center;",
      y_align: Clutter.ActorAlign.CENTER,
    });

    const recordingLabel = new St.Label({
      text: "Recording...",
      style: `font-size: 20px; font-weight: bold; color: ${COLORS.WHITE};`,
      y_align: Clutter.ActorAlign.CENTER,
    });

    headerBox.add_child(this.recordingIcon);
    headerBox.add_child(recordingLabel);

    // Time progress display
    this.timeDisplay = new St.Label({
      text: this.formatTimeDisplay(0, this.maxDuration),
      style: `font-size: 18px; color: ${COLORS.PRIMARY}; text-align: center; font-weight: bold; margin: 10px 0;`,
    });

    // Progress bar container
    const progressContainer = new St.Widget({
      style: `
        background-color: rgba(255, 255, 255, 0.2);
        border-radius: 10px;
        height: 8px;
        min-width: 200px;
        margin: 5px 0;
      `,
      layout_manager: new Clutter.BinLayout(),
    });

    // Progress bar fill
    this.progressBar = new St.Widget({
      style: `
        background-color: ${COLORS.PRIMARY};
        border-radius: 10px;
        height: 8px;
        width: 0px;
      `,
    });

    progressContainer.add_child(this.progressBar);

    // Instructions
    const instructionLabel = new St.Label({
      text: "Speak now\nPress Enter to process, Escape to cancel.",
      style: `font-size: 16px; color: ${COLORS.LIGHT_GRAY}; text-align: center;`,
    });

    // Buttons
    this.stopButton = createHoverButton(
      "Stop Recording",
      COLORS.DANGER,
      "#ff6666"
    );

    this.cancelButton = createHoverButton(
      "Cancel",
      COLORS.SECONDARY,
      COLORS.DARK_GRAY
    );

    // Connect button events
    this.stopButton.connect("clicked", () => {
      log("🎯 Stop button clicked!");
      this.close();
      this.onStop?.();
    });

    this.cancelButton.connect("clicked", () => {
      log("🎯 Cancel button clicked!");
      this.close();
      this.onCancel?.();
    });

    // Add to content box with proper alignment
    this.container.add_child(headerBox);
    headerBox.set_x_align(Clutter.ActorAlign.CENTER);

    this.container.add_child(this.timeDisplay);
    this.container.add_child(progressContainer);
    this.container.add_child(instructionLabel);
    this.container.add_child(this.stopButton);
    this.container.add_child(this.cancelButton);

    // Add to modal barrier
    this.modalBarrier.add_child(this.container);
  }

  formatTimeDisplay(elapsed, maximum) {
    const formatTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const remaining = Math.max(0, maximum - elapsed);
    return `${formatTime(elapsed)} / ${formatTime(maximum)} (${formatTime(
      remaining
    )} left)`;
  }

  updateTimeDisplay() {
    if (!this.startTime) return;

    this.elapsedTime = Math.floor((Date.now() - this.startTime) / 1000);

    // Update time text
    this.timeDisplay.set_text(
      this.formatTimeDisplay(this.elapsedTime, this.maxDuration)
    );

    // Update progress bar
    const progress = Math.min(this.elapsedTime / this.maxDuration, 1.0);
    const progressWidth = Math.floor(200 * progress); // 200px is the container width
    this.progressBar.set_style(`
      background-color: ${COLORS.PRIMARY};
      border-radius: 10px;
      height: 8px;
      width: ${progressWidth}px;
    `);

    // Change color to warning when getting close to limit
    if (progress > 0.8) {
      const warningColor = progress > 0.95 ? COLORS.DANGER : COLORS.WARNING;
      this.timeDisplay.set_style(
        `font-size: 18px; color: ${warningColor}; text-align: center; font-weight: bold; margin: 10px 0;`
      );
      this.progressBar.set_style(`
        background-color: ${warningColor};
        border-radius: 10px;
        height: 8px;
        width: ${progressWidth}px;
      `);
    }
  }

  startTimer() {
    this.startTime = Date.now();
    this.elapsedTime = 0;

    // Update immediately
    this.updateTimeDisplay();

    // Start interval timer to update every second
    this.timerInterval = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      if (this.startTime) {
        this.updateTimeDisplay();
        return true; // Continue the timer
      }
      return false; // Stop the timer
    });
  }

  stopTimer() {
    if (this.timerInterval) {
      GLib.Source.remove(this.timerInterval);
      this.timerInterval = null;
    }
    this.startTime = null;
  }

  open() {
    log("🎯 Opening custom modal dialog");

    // Add to UI
    Main.layoutManager.addTopChrome(this.modalBarrier);

    // Set barrier to cover entire screen
    const monitor = Main.layoutManager.primaryMonitor;
    this.modalBarrier.set_position(monitor.x, monitor.y);
    this.modalBarrier.set_size(monitor.width, monitor.height);

    // Center the dialog container within the barrier
    this.container.set_position(
      (monitor.width - 300) / 2,
      (monitor.height - 200) / 2
    );

    this.modalBarrier.show();

    // Start the timer
    this.startTimer();

    // X11 focus solution: Use xdotool to focus GNOME Shell window
    log("🎯 Attempting X11 focus solution");

    // Store reference to modalBarrier for the timeout callback
    const modalBarrierRef = this.modalBarrier;

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      try {
        // Get GNOME Shell's window ID and focus it
        const [success, stdout] = GLib.spawn_command_line_sync(
          'xdotool search --onlyvisible --class "gnome-shell" | head -1'
        );

        if (success && stdout) {
          const windowId = new TextDecoder().decode(stdout).trim();
          log(`🎯 Found GNOME Shell window ID: ${windowId}`);

          if (windowId) {
            // Focus the GNOME Shell window
            GLib.spawn_command_line_sync(`xdotool windowfocus ${windowId}`);
            log(`🎯 Focused GNOME Shell window ${windowId}`);

            // Also try to activate it
            GLib.spawn_command_line_sync(`xdotool windowactivate ${windowId}`);
            log(`🎯 Activated GNOME Shell window ${windowId}`);
          }
        }

        // Now try to focus our modal barrier - but only if it still exists
        if (modalBarrierRef?.get_parent()) {
          modalBarrierRef.grab_key_focus();
          global.stage.set_key_focus(modalBarrierRef);

          // Debug: Check if it worked
          const currentFocus = global.stage.get_key_focus();
          log(
            `🎯 Final focus check: ${
              currentFocus ? currentFocus.toString() : "NULL"
            }`
          );
          log(
            `🎯 Is modal barrier focused? ${currentFocus === modalBarrierRef}`
          );
        } else {
          log(
            `🎯 Modal barrier no longer exists or has no parent - skipping focus`
          );
        }
      } catch (e) {
        log(`⚠️ X11 focus error: ${e}`);
      }

      return false;
    });
  }

  close() {
    log("🎯 Closing custom modal dialog");

    // Stop the timer
    this.stopTimer();

    if (this.modalBarrier && this.modalBarrier.get_parent()) {
      Main.layoutManager.removeChrome(this.modalBarrier);

      // Add a small delay before nulling the barrier to ensure X11 focus code has time to run
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
        this.modalBarrier = null;
        this.container = null;
        return false; // Don't repeat
      });
    } else {
      this.modalBarrier = null;
      this.container = null;
    }
  }

  // Pulse animation methods removed - no longer needed
}
