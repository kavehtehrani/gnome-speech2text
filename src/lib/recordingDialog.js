import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import Meta from "gi://Meta";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as Config from "resource:///org/gnome/shell/misc/config.js";

import { COLORS, STYLES } from "./constants.js";
import { createHoverButton, createHorizontalBox } from "./uiUtils.js";

// Enhanced recording dialog for D-Bus version (matches original design)
export class RecordingDialog {
  constructor(onCancel, onInsert, onStop, maxDuration = 60) {
    console.log("DBusRecordingDialog constructor called");

    this.onCancel = onCancel;
    this.onInsert = onInsert;
    this.onStop = onStop;
    this.maxDuration = maxDuration;
    this.startTime = null;
    this.elapsedTime = 0;
    this.timerInterval = null;
    this.focusTimeoutId = null;
    this.buttonFocusTimeoutId = null;
    this.openFocusTimeoutId = null;
    this.cleanupTimeoutId = null;
    this.delayedCleanupTimeoutId = null;
    this.isPreviewMode = false;
    this.transcribedText = "";
    this.textEntry = null;

    this._buildDialog();
  }

  _buildDialog() {
    try {
      // Create modal barrier
      this.modalBarrier = new St.Widget({
        style: `background-color: ${COLORS.TRANSPARENT_BLACK_30};`,
        reactive: true,
        can_focus: true,
        track_hover: true,
      });

      // Main dialog container (matches original design)
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
    } catch (error) {
      console.error("Error building dialog:", error);
      throw error;
    }
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
      console.log("Stop button clicked!");
      this.showProcessing();
      // Trigger the stop recording via the parent extension
      if (this.onStop) {
        this.onStop();
      }
    });

    this.cancelButton.connect("clicked", () => {
      console.log("Cancel button clicked!");
      this.close();
      this.onCancel?.();
    });

    // Keyboard handling - single handler for both recording and preview modes
    this.keyboardHandlerId = this.modalBarrier.connect(
      "key-press-event",
      (actor, event) => {
        const keyval = event.get_key_symbol();
        if (keyval === Clutter.KEY_Escape) {
          this.close();
          this.onCancel?.();
          return Clutter.EVENT_STOP;
        } else if (
          keyval === Clutter.KEY_Return ||
          keyval === Clutter.KEY_KP_Enter
        ) {
          if (this.isPreviewMode) {
            // Preview mode: Copy to clipboard and close
            if (this.textEntry) {
              const finalText = this.textEntry.get_text();
              console.log(`Copying text to clipboard (Enter key): "${finalText}"`);
              this._copyToClipboard(finalText);
            }
            this.close();
            this.onCancel?.();
          } else {
            // Recording mode: Stop recording and show processing
            this.showProcessing();
            if (this.onStop) {
              this.onStop();
            }
          }
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      }
    );

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
    let textColor = "white";

    if (progress > 0.8) {
      barColor = progress > 0.95 ? COLORS.DANGER : COLORS.WARNING;
    }

    // Update progress bar fill
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

  showProcessing() {
    console.log("Showing processing state");

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
  }

  startTimer() {
    this.startTime = Date.now();
    this.elapsedTime = 0;

    // Update immediately
    this.updateTimeDisplay();

    // Clean up existing timer before creating new one
    if (this.timerInterval) {
      GLib.Source.remove(this.timerInterval);
      this.timerInterval = null;
    }

    // Start interval timer to update every second
    this.timerInterval = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      if (this.startTime) {
        this.updateTimeDisplay();

        // Continue the timer
        return this.elapsedTime < this.maxDuration;
      }
      return false; // Stop the timer
    });
  }

  stopTimer() {
    if (this.timerInterval) {
      GLib.source_remove(this.timerInterval);
      this.timerInterval = null;
    }
    this.startTime = null;
  }

  _copyToClipboard(text) {
    try {
      // Use St.Clipboard for proper GNOME Shell clipboard integration
      const clipboard = St.Clipboard.get_default();
      clipboard.set_text(St.ClipboardType.CLIPBOARD, text);
      console.log("✅ Text copied to clipboard successfully");

      // Show a brief notification
      Main.notify("Speech2Text", "Text copied to clipboard!");
      return true;
    } catch (e) {
      console.error(`❌ Error copying to clipboard: ${e}`);
      Main.notify("Speech2Text Error", "Failed to copy to clipboard");
      return false;
    }
  }

  showPreview(text) {
    this.isPreviewMode = true;
    this.transcribedText = text;

    console.log(`Showing preview with text: "${text}"`);

    // Check if we're on Wayland
    const isWayland = Meta.is_wayland_compositor();

    // Update UI for preview mode - change icon and label
    if (this.recordingIcon) {
      this.recordingIcon.set_text("📝");
    }
    if (this.recordingLabel) {
      this.recordingLabel.set_text(
        isWayland ? "Review & Copy" : "Review & Insert"
      );
    }

    // Update instructions
    if (this.instructionLabel) {
      this.instructionLabel.set_text(
        isWayland
          ? "Review the transcribed text below. Text insertion is not available on Wayland."
          : "Review the transcribed text below."
      );
    }

    // Hide progress container
    if (this.progressContainer) {
      this.progressContainer.hide();
    }

    // Hide processing buttons
    if (this.stopButton) {
      this.stopButton.hide();
    }
    if (this.cancelButton) {
      this.cancelButton.hide();
    }

    // Add text display for editing
    this.textEntry = new St.Entry({
      text: text,
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

    // Make it behave like multiline
    const clutterText = this.textEntry.get_clutter_text();
    clutterText.set_line_wrap(true);
    clutterText.set_line_wrap_mode(2); // PANGO_WRAP_WORD
    clutterText.set_single_line_mode(false);
    clutterText.set_activatable(false);

    this.container.add_child(this.textEntry);

    // Focus the text entry after a short delay and select all text
    if (this.focusTimeoutId) {
      GLib.Source.remove(this.focusTimeoutId);
    }
    this.focusTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      clutterText.set_selection(0, text.length);
      this.focusTimeoutId = null;
      return false;
    });

    // Create new button box for preview
    const buttonBox = createHorizontalBox();

    // Only show insert button on X11
    let insertButton = null;
    if (!isWayland) {
      insertButton = createHoverButton(
        "Insert Text",
        COLORS.SUCCESS,
        "#34ce57"
      );

      insertButton.connect("clicked", () => {
        const finalText = this.textEntry.get_text();
        this.close();
        this.onInsert?.(finalText);
      });
    }

    const copyButton = createHoverButton(
      isWayland ? "Copy" : "Copy Only",
      COLORS.INFO,
      "#0077ee"
    );
    const cancelButton = createHoverButton(
      "Cancel",
      COLORS.SECONDARY,
      COLORS.DARK_GRAY
    );

    copyButton.connect("clicked", () => {
      // Copy to clipboard and close
      const finalText = this.textEntry.get_text();
      console.log(`Copying text to clipboard: "${finalText}"`);

      // Copy to clipboard using our own method
      this._copyToClipboard(finalText);

      this.close();
      this.onCancel?.();
    });

    // Set focus on copy button so Enter key works
    if (this.buttonFocusTimeoutId) {
      GLib.Source.remove(this.buttonFocusTimeoutId);
    }
    this.buttonFocusTimeoutId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      150,
      () => {
        copyButton.grab_key_focus();
        this.buttonFocusTimeoutId = null;
        return false;
      }
    );

    cancelButton.connect("clicked", () => {
      this.close();
      this.onCancel?.();
    });

    // Add buttons based on platform
    if (insertButton) {
      buttonBox.add_child(insertButton);
    }
    buttonBox.add_child(copyButton);
    buttonBox.add_child(cancelButton);

    this.container.add_child(buttonBox);

    // Add keyboard hint
    const keyboardHint = new St.Label({
      text: "Press Enter to copy • Escape to cancel",
      style: `font-size: 12px; color: ${COLORS.DARK_GRAY}; text-align: center; margin-top: 10px;`,
    });
    this.container.add_child(keyboardHint);

    // Keyboard handling is managed by the single handler in _buildRecordingUI()
    // No need to disconnect/reconnect - it checks this.isPreviewMode
  }

  showError(message) {
    console.log(`Showing error: ${message}`);

    // Update the recording label to show error
    if (this.recordingLabel) {
      this.recordingLabel.set_text("Error");
      this.recordingLabel.set_style(
        `font-size: 20px; font-weight: bold; color: ${COLORS.DANGER};`
      );
    }

    // Update the icon to show error
    if (this.recordingIcon) {
      this.recordingIcon.set_text("❌");
    }

    // Update instructions to show error message
    if (this.instructionLabel) {
      this.instructionLabel.set_text(`${message}\nPress Escape to close.`);
      this.instructionLabel.set_style(
        `font-size: 16px; color: ${COLORS.DANGER}; text-align: center;`
      );
    }

    // Hide the stop button and progress bar
    if (this.stopButton) {
      this.stopButton.hide();
    }
    if (this.progressContainer) {
      this.progressContainer.hide();
    }

    // Show only cancel button
    if (this.cancelButton) {
      this.cancelButton.show();
      this.cancelButton.set_label("Close");
    }

    // Stop the timer
    this.stopTimer();
  }

  open() {
    console.log("Opening DBus recording dialog");

    try {
      // Add to UI
      Main.layoutManager.addTopChrome(this.modalBarrier);

      // Set barrier to cover entire screen
      const monitor = Main.layoutManager.primaryMonitor;
      this.modalBarrier.set_position(monitor.x, monitor.y);
      this.modalBarrier.set_size(monitor.width, monitor.height);

      // Center the dialog container within the barrier (matches original)
      this.container.set_position(
        (monitor.width - 450) / 2,
        (monitor.height - 300) / 2
      );

      this.modalBarrier.show();

      // Start the timer
      this.startTimer();

      // Focus solution with improved Wayland compatibility
      // Clean up existing focus timeout before creating new one
      if (this.openFocusTimeoutId) {
        GLib.Source.remove(this.openFocusTimeoutId);
        this.openFocusTimeoutId = null;
      }

      this.openFocusTimeoutId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        100,
        () => {
          try {
            // Only attempt focus grab if the modal is still valid and has a parent
            if (
              this.modalBarrier?.get_parent &&
              this.modalBarrier.get_parent()
            ) {
              // On Wayland, focus management is more restricted
              // Try the safer approach first
              if (this.modalBarrier.grab_key_focus) {
                this.modalBarrier.grab_key_focus();
                console.log("Focus grabbed using grab_key_focus");
              }

              // Only try global.stage.set_key_focus on X11 or as fallback
              const isWayland = Meta.is_wayland_compositor();
              if (!isWayland && global.stage?.set_key_focus) {
                global.stage.set_key_focus(this.modalBarrier);
                console.log("Focus set using global.stage.set_key_focus");
              }
            }
          } catch (error) {
            console.log(
              "Failed to set focus (this is non-critical):",
              error.message
            );
            // Continue without focus if it fails - this is not critical for functionality
          }
          this.openFocusTimeoutId = null;
          return false;
        }
      );
    } catch (error) {
      console.error("Error opening recording dialog:", error);
      if (this.modalBarrier) {
        Main.layoutManager.removeChrome(this.modalBarrier);
      }
      throw error;
    }
  }

  close() {
    console.log("Closing DBus recording dialog");

    // Prevent multiple cleanup attempts
    if (!this.modalBarrier) {
      console.log("Modal already cleaned up");
      return;
    }

    try {
      // Stop timer first
      this.stopTimer();

      // Clean up timeout sources
      if (this.focusTimeoutId) {
        GLib.Source.remove(this.focusTimeoutId);
        this.focusTimeoutId = null;
      }
      if (this.buttonFocusTimeoutId) {
        GLib.Source.remove(this.buttonFocusTimeoutId);
        this.buttonFocusTimeoutId = null;
      }
      if (this.openFocusTimeoutId) {
        GLib.Source.remove(this.openFocusTimeoutId);
        this.openFocusTimeoutId = null;
      }
      if (this.cleanupTimeoutId) {
        GLib.Source.remove(this.cleanupTimeoutId);
        this.cleanupTimeoutId = null;
      }
      if (this.delayedCleanupTimeoutId) {
        GLib.Source.remove(this.delayedCleanupTimeoutId);
        this.delayedCleanupTimeoutId = null;
      }

      // Safely disconnect signal handlers using a more defensive approach
      if (this.keyboardHandlerId) {
        try {
          // Check if the connection is still valid before disconnecting
          if (this.modalBarrier && this.modalBarrier.disconnect) {
            this.modalBarrier.disconnect(this.keyboardHandlerId);
            console.log("Keyboard handler disconnected successfully");
          }
        } catch (error) {
          console.log(
            "Signal handler already disconnected or invalid:",
            error.message
          );
        } finally {
          this.keyboardHandlerId = null;
        }
      }

      // Clean up modal with improved Wayland compatibility
      if (this.modalBarrier) {
        // First, hide the modal to prevent any visual glitches
        try {
          this.modalBarrier.hide();
        } catch (hideError) {
          console.log("Could not hide modal:", hideError.message);
        }

        // Use timeout to ensure the hide operation completes before destruction
        // This is especially important on Wayland where operations might be asynchronous
        const modal = this.modalBarrier;
        this.modalBarrier = null; // Clear reference immediately to prevent re-entry

        // Detect GNOME version for compatibility adjustments
        const isGNOME48Plus = (() => {
          try {
            const version = Config.PACKAGE_VERSION;
            const major = parseInt(version.split(".")[0], 10);
            return major >= 48;
          } catch {
            return true; // Assume newer version if detection fails
          }
        })();

        // Cleanup will be done immediately to avoid timeout issues

        // Do immediate cleanup instead of delayed to avoid timeout issues on disable
        if (this.cleanupTimeoutId) {
          GLib.Source.remove(this.cleanupTimeoutId);
        }
        // Execute cleanup immediately instead of creating a timeout
        try {
          // Remove from chrome if it has a parent
          if (modal.get_parent) {
            const parent = modal.get_parent();
            if (parent) {
              // Try the official method first
              try {
                Main.layoutManager.removeChrome(modal);
                console.log("Modal removed from chrome successfully");
              } catch (chromeError) {
                console.log(
                  "Chrome removal failed, trying direct parent removal:",
                  chromeError.message
                );
                // For GNOME 48+, try a gentler approach first
                if (isGNOME48Plus) {
                  try {
                    // Try to hide first, then remove with delay
                    if (modal.hide) modal.hide();
                    // Do immediate removal instead of delayed
                    try {
                      parent.remove_child(modal);
                      console.log(
                        "Modal removed from parent immediately (GNOME 48+)"
                      );
                    } catch (delayedError) {
                      console.log(
                        "Immediate parent removal failed:",
                        delayedError.message
                      );
                    }
                  } catch (gnome48Error) {
                    console.log(
                      "GNOME 48+ specific removal failed:",
                      gnome48Error.message
                    );
                    // Fallback to direct removal
                    try {
                      parent.remove_child(modal);
                      console.log(
                        "Modal removed from parent directly (fallback)"
                      );
                    } catch (parentError) {
                      console.log(
                        "Direct parent removal also failed:",
                        parentError.message
                      );
                    }
                  }
                } else {
                  // Standard fallback for older GNOME versions
                  try {
                    parent.remove_child(modal);
                    console.log("Modal removed from parent directly");
                  } catch (parentError) {
                    console.log(
                      "Direct parent removal also failed:",
                      parentError.message
                    );
                  }
                }
              }
            }
          }

          // Finally, destroy the modal
          if (modal.destroy) {
            try {
              modal.destroy();
              console.log("Modal destroyed successfully");
            } catch (destroyError) {
              console.log(
                "Modal destruction failed:",
                destroyError.message
              );
            }
          }
        } catch (cleanupError) {
          console.log("Cleanup failed:", cleanupError.message);
        }
      }
    } catch (error) {
      console.error("Error closing recording dialog:", error.message);
      // Always clear the modal reference even if cleanup fails
      this.modalBarrier = null;
    }
  }
}
