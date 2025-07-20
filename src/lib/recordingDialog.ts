import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import St from "gi://St";
import Meta from "gi://Meta";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { COLORS, STYLES } from "./constants.js";
import { createHoverButton } from "./uiUtils.js";

// Check Wayland status once at load
const IS_WAYLAND = Meta.is_wayland_compositor();

export interface RecordingDialogCallbacks {
  onStop: () => void;
  onCancel: () => void;
  onInsert: (text: string) => void;
}

// Simple recording dialog using custom modal barrier
export class RecordingDialog {
  public modalBarrier: St.Widget;
  public dialogBox: St.BoxLayout;
  public statusLabel: St.Label;
  public timerLabel: St.Label;
  public isPreviewMode: boolean;
  public transcribedText: string;
  
  private onStop: () => void;
  private onCancel: () => void;
  private onInsert: (text: string) => void;
  private maxDuration: number;
  private startTime: number | null;
  private elapsedTime: number;
  private timerInterval: number | null;
  
  constructor(onStop: () => void, onCancel: () => void, onInsert: (text: string) => void, maxDuration = 60) {
    log("🎯 RecordingDialog constructor called");

    this.onStop = onStop;
    this.onCancel = onCancel;
    this.onInsert = onInsert; // New callback for inserting text
    this.maxDuration = maxDuration; // Maximum recording duration in seconds
    this.startTime = null; // Will be set when recording starts
    this.elapsedTime = 0; // Current elapsed time
    this.timerInterval = null; // Timer interval reference
    this.isPreviewMode = false; // Track whether we're in preview mode
    this.transcribedText = ""; // Store the transcribed text

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
        const keyval = event.get_key_symbol ? event.get_key_symbol() : null;

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
        } catch {
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
          !this.isPreviewMode &&
          (keyval === Clutter.KEY_space ||
            keyval === Clutter.KEY_Return ||
            keyval === Clutter.KEY_KP_Enter)
        ) {
          // Enter/Space = Stop and process (with transcription) - only in recording mode
          log(`🎯 Stopping recording via keyboard: ${keyname}`);
          // Don't close the dialog here - let the onStop callback handle the workflow
          this.onStop?.();
          return Clutter.EVENT_STOP;
        } else if (
          this.isPreviewMode &&
          (keyval === Clutter.KEY_Return || keyval === Clutter.KEY_KP_Enter)
        ) {
          // In preview mode, Enter behavior depends on display server
          if (IS_WAYLAND) {
            // On Wayland, Enter = Copy to clipboard and close
            log(
              `🎯 Copying text to clipboard via keyboard (Wayland): ${keyname}`
            );
            this._handleCopy();
            this.close();
            this.onCancel?.(); // Close without inserting
          } else {
            // On X11, Enter = Insert text
            log(`🎯 Inserting text via keyboard (X11): ${keyname}`);
            this._handleInsert();
          }
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
        min-width: 450px;
        max-width: 600px;
      `,
      layout_manager: new Clutter.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        spacing: 20,
      }),
      reactive: true,
      can_focus: true,
    });

    this._buildRecordingUI();
  }

  _buildRecordingUI() {
    // Clear existing content
    this.container.remove_all_children();

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

    this.recordingLabel = new St.Label({
      text: "Recording...",
      style: `font-size: 20px; font-weight: bold; color: ${COLORS.WHITE};`,
      y_align: Clutter.ActorAlign.CENTER,
    });

    headerBox.add_child(this.recordingIcon);
    headerBox.add_child(this.recordingLabel);

    // Progress bar container (larger and more prominent)
    this.progressContainer = new St.Widget({
      style: `
        background-color: rgba(255, 255, 255, 0.2);
        border-radius: 15px;
        height: 30px;
        width: 280px;
        margin: 15px 0;
      `,
    });

    // Progress bar fill (explicitly positioned to start from left)
    this.progressBar = new St.Widget({
      style: `
        background-color: ${COLORS.PRIMARY};
        border-radius: 15px 0px 0px 15px;
        height: 30px;
        width: 0px;
      `,
    });

    // Position the progress bar at the left edge
    this.progressBar.set_position(0, 0);

    // Time display overlaid on the progress bar (right side)
    this.timeDisplay = new St.Label({
      text: this.formatTimeDisplay(0, this.maxDuration),
      style: `
        font-size: 14px; 
        color: white; 
        font-weight: bold;
        text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
        padding: 0 12px;
      `,
    });

    // Position the time display on the right side
    this.timeDisplay.set_position(280 - 160, 8); // Adjust position for right alignment

    this.progressContainer.add_child(this.progressBar);
    this.progressContainer.add_child(this.timeDisplay);

    // Instructions
    this.instructionLabel = new St.Label({
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
      // Don't close the dialog here - let the onStop callback handle the workflow
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

    this.container.add_child(this.progressContainer);
    this.container.add_child(this.instructionLabel);
    this.container.add_child(this.stopButton);
    this.container.add_child(this.cancelButton);

    // Add to modal barrier
    this.modalBarrier.add_child(this.container);
  }

  _buildPreviewUI() {
    // Clear existing content
    this.container.remove_all_children();

    // Preview header with copy button
    const headerBox = new St.BoxLayout({
      vertical: false,
      style: "spacing: 15px;",
      x_align: Clutter.ActorAlign.FILL,
      y_align: Clutter.ActorAlign.CENTER,
      x_expand: true,
    });

    // Left side - icon and title
    const titleBox = new St.BoxLayout({
      vertical: false,
      style: "spacing: 15px;",
      x_align: Clutter.ActorAlign.START,
      y_align: Clutter.ActorAlign.CENTER,
      x_expand: true,
    });

    const previewIcon = new St.Label({
      text: "📝",
      style: "font-size: 48px; text-align: center;",
      y_align: Clutter.ActorAlign.CENTER,
    });

    const previewLabel = new St.Label({
      text: "Review & Insert",
      style: `font-size: 20px; font-weight: bold; color: ${COLORS.WHITE};`,
      y_align: Clutter.ActorAlign.CENTER,
    });

    titleBox.add_child(previewIcon);
    titleBox.add_child(previewLabel);

    headerBox.add_child(titleBox);

    // Instruction label
    const instructionLabel = new St.Label({
      text: "Review the transcribed text below.",
      style: `font-size: 14px; color: ${COLORS.LIGHT_GRAY}; text-align: center; margin-bottom: 10px;`,
    });

    // Use St.Entry (designed for input) and hack it to be multiline
    this.textEntry = new St.Entry({
      text: this.transcribedText,
      style: `
        background-color: rgba(255, 255, 255, 0.1);
        border: 2px solid ${COLORS.SECONDARY};
        border-radius: 8px;
        color: ${COLORS.WHITE};
        font-size: 16px;
        padding: 15px;
        margin: 10px 0;
        width: 400px;
        caret-color: ${COLORS.PRIMARY};
      `,
      can_focus: true,
      reactive: true,
    });

    // Make the St.Entry behave like a multiline text area
    const clutterText = this.textEntry.get_clutter_text();
    clutterText.set_line_wrap(true);
    clutterText.set_line_wrap_mode(2); // WORD_CHAR wrapping
    clutterText.set_single_line_mode(false);
    clutterText.set_activatable(false); // Prevent Enter from triggering activation

    // Intercept Enter key: Enter = insert, Shift+Enter = newline
    clutterText.connect("key-press-event", (actor, event) => {
      const keyval = event.get_key_symbol();
      const state = event.get_state();
      if (keyval === Clutter.KEY_Return || keyval === Clutter.KEY_KP_Enter) {
        // If Shift is held, allow newline
        if (state & Clutter.ModifierType.SHIFT_MASK) {
          return Clutter.EVENT_PROPAGATE;
        }
        // Otherwise, trigger insert
        this._handleInsert();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });

    // Debug: Log the text that should be shown
    log(`🎯 Setting text entry text to: "${this.transcribedText}"`);

    // Action buttons
    const buttonBox = new St.BoxLayout({
      vertical: false,
      style: "spacing: 10px;",
      x_align: Clutter.ActorAlign.CENTER,
    });

    // Copy button
    const copyButton = createHoverButton("📋 Copy", COLORS.INFO, "#42a5f5");

    // Only show Insert button on X11, not on Wayland (since insertion doesn't work on Wayland)
    let insertButton = null;
    if (!IS_WAYLAND) {
      insertButton = createHoverButton("Insert", COLORS.SUCCESS, "#66bb6a");
    }

    this.previewCancelButton = createHoverButton(
      "Cancel",
      COLORS.SECONDARY,
      COLORS.DARK_GRAY
    );

    // Button event handlers
    copyButton.connect("clicked", () => {
      log("🎯 Copy button clicked!");
      this._handleCopy();
    });

    if (insertButton) {
      insertButton.connect("clicked", () => {
        log("🎯 Insert button clicked!");
        this._handleInsert();
      });
    }

    this.previewCancelButton.connect("clicked", () => {
      log("🎯 Preview Cancel button clicked!");
      this.close();
      this.onCancel?.();
    });

    // Add buttons to the box
    buttonBox.add_child(copyButton);
    if (insertButton) {
      buttonBox.add_child(insertButton);
    }
    buttonBox.add_child(this.previewCancelButton);

    // Instructions for keyboard shortcuts
    const keyboardHint = new St.Label({
      text: IS_WAYLAND
        ? "Press Enter to copy to clipboard • Escape to cancel"
        : "Press Enter to insert • Escape to cancel",
      style: `font-size: 12px; color: ${COLORS.DARK_GRAY}; text-align: center; margin-top: 10px;`,
    });

    // Add all elements to container
    this.container.add_child(headerBox);
    headerBox.set_x_align(Clutter.ActorAlign.CENTER);
    this.container.add_child(instructionLabel);
    this.container.add_child(this.textEntry);
    this.container.add_child(buttonBox);
    this.container.add_child(keyboardHint);
  }

  _handleInsert() {
    // Get the current text from the St.Entry
    const textToInsert = this.textEntry
      ? this.textEntry.get_text()
      : this.transcribedText;

    log(`🎯 Inserting text: "${textToInsert}"`);

    this.close();

    // Call the insert callback with the text
    if (this.onInsert && textToInsert.trim()) {
      this.onInsert(textToInsert.trim());
    } else {
      log("🎯 No text to insert or no callback provided");
      this.onCancel?.();
    }
  }

  _handleCopy() {
    // Get the current text from the St.Entry
    const textToCopy = this.textEntry
      ? this.textEntry.get_text()
      : this.transcribedText;

    log(`🎯 Copying text to clipboard: "${textToCopy}"`);

    if (!textToCopy.trim()) {
      log("⚠️ No text to copy");
      Main.notify("Speech2Text", "No text to copy");
      return;
    }

    try {
      // Use St.Clipboard to copy text
      const clipboard = St.Clipboard.get_default();
      clipboard.set_text(St.ClipboardType.CLIPBOARD, textToCopy.trim());

      log("✅ Text copied to clipboard successfully");
      Main.notify("Speech2Text", "Text copied to clipboard!");
    } catch (e) {
      log(`❌ Error copying to clipboard: ${e}`);
      Main.notify("Speech2Text", "Failed to copy to clipboard");
    }
  }

  showPreview(transcribedText) {
    log(`🎯 Showing preview with text: "${transcribedText}"`);

    // Check if dialog is still valid
    if (!this.container || !this.container.get_parent()) {
      log("⚠️ Dialog already disposed, cannot show preview");
      return;
    }

    this.isPreviewMode = true;
    this.transcribedText = transcribedText;

    // Stop the timer if it's running
    this.stopTimer();

    // Clear the processing timeout
    this.clearProcessingTimeout();

    // Rebuild the UI for preview mode
    this._buildPreviewUI();

    // Focus the text entry so user can edit immediately if needed
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      if (this.textEntry) {
        this.textEntry.grab_key_focus();
        // Position cursor at the end of the text
        const clutterText = this.textEntry.get_clutter_text();
        const textLength = this.transcribedText.length;
        clutterText.set_cursor_position(textLength);
      }
      return false;
    });
  }

  showProcessing() {
    log("🎯 Showing processing state");

    // Update the recording label to show processing
    if (this.recordingLabel) {
      this.recordingLabel.set_text("Processing...");
    }

    // Update the icon to show processing
    if (this.recordingIcon) {
      this.recordingIcon.set_text("🧠");
    }

    // Update instructions
    if (this.instructionLabel) {
      this.instructionLabel.set_text(
        "Transcribing your speech...\nPress Escape to cancel."
      );
    }

    // Hide the stop button but keep cancel button visible
    if (this.stopButton) {
      this.stopButton.hide();
    }
    if (this.cancelButton) {
      this.cancelButton.show();
      this.cancelButton.set_label("Cancel Processing");
    }

    // Stop the timer
    this.stopTimer();

    // Hide progress bar during processing
    if (this.progressContainer) {
      this.progressContainer.hide();
    }

    // Add a timeout to prevent getting stuck in processing forever
    this.processingTimeout = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      30000,
      () => {
        log("⚠️ Processing timeout reached (30 seconds)");
        this.showProcessingError("Transcription timed out. Please try again.");
        return false; // Don't repeat
      }
    );
  }

  showProcessingError(message) {
    log(`🎯 Showing processing error: ${message}`);

    // Check if dialog is still valid before accessing UI elements
    if (!this.container || !this.container.get_parent()) {
      log("⚠️ Dialog already disposed, cannot show processing error");
      return;
    }

    // Update the label to show error
    if (this.recordingLabel) {
      try {
        this.recordingLabel.set_text("Error");
      } catch (e) {
        log(`⚠️ Error updating recording label: ${e}`);
      }
    }

    // Update the icon to show error
    if (this.recordingIcon) {
      try {
        this.recordingIcon.set_text("❌");
      } catch (e) {
        log(`⚠️ Error updating recording icon: ${e}`);
      }
    }

    // Update instructions
    if (this.instructionLabel) {
      try {
        this.instructionLabel.set_text(`${message}\nPress Escape to close.`);
      } catch (e) {
        log(`⚠️ Error updating instruction label: ${e}`);
      }
    }

    // Show only cancel button
    if (this.stopButton) {
      try {
        this.stopButton.hide();
      } catch (e) {
        log(`⚠️ Error hiding stop button: ${e}`);
      }
    }
    if (this.cancelButton) {
      try {
        this.cancelButton.show();
        this.cancelButton.set_label("Close");
      } catch (e) {
        log(`⚠️ Error updating cancel button: ${e}`);
      }
    }

    // Clear the processing timeout
    this.clearProcessingTimeout();
  }

  clearProcessingTimeout() {
    if (this.processingTimeout) {
      GLib.Source.remove(this.processingTimeout);
      this.processingTimeout = null;
    }
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

    // Update progress bar (280px is the container width)
    const progress = Math.min(this.elapsedTime / this.maxDuration, 1.0);
    const progressWidth = Math.floor(280 * progress);

    // Determine color based on progress
    let barColor = COLORS.PRIMARY;
    const textColor = "white";

    if (progress > 0.8) {
      barColor = progress > 0.95 ? COLORS.DANGER : COLORS.WARNING;
    }

    // Update progress bar fill
    // Simple border radius: left side rounded, right side rounded only when complete
    const borderRadius = progress >= 1.0 ? "15px" : "15px 0px 0px 15px";

    this.progressBar.set_style(`
      background-color: ${barColor};
      border-radius: ${borderRadius};
      height: 30px;
      width: ${progressWidth}px;
    `);

    // Update text style to match the progress bar
    this.timeDisplay.set_style(`
      font-size: 14px; 
      color: ${textColor}; 
      font-weight: bold;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
      padding: 0 12px;
    `);
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
      (monitor.width - 350) / 2,
      (monitor.height - 240) / 2
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

    // Clear the processing timeout
    this.clearProcessingTimeout();

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
