import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import St from "gi://St";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

// Import modularized utilities (keeping some for UI)
import { COLORS, STYLES, createAccentDisplayStyle } from "./lib/constants.js";
import {
  createHoverButton,
  createTextButton,
  createStyledLabel,
  createVerticalBox,
  createHorizontalBox,
  createSeparator,
} from "./lib/uiUtils.js";
import {
  createCloseButton,
  createIncrementButton,
  createCenteredBox,
  createHeaderLayout,
} from "./lib/buttonUtils.js";
import { SettingsDialog } from "./lib/settingsDialog.js";
import { safeDisconnect, cleanupModal } from "./lib/resourceUtils.js";

let button;

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

// Enhanced recording dialog for D-Bus version (matches original design)
class DBusRecordingDialog {
  constructor(onCancel, onInsert, onStop, maxDuration = 60) {
    console.log("DBusRecordingDialog constructor called");

    this.onCancel = onCancel;
    this.onInsert = onInsert;
    this.onStop = onStop;
    this.maxDuration = maxDuration;
    this.startTime = null;
    this.elapsedTime = 0;
    this.timerInterval = null;
    this.isPreviewMode = false;
    this.transcribedText = "";

    this._buildDialog();
  }

  _buildDialog() {
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

    // Keyboard handling
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
          if (!this.isPreviewMode) {
            this.showProcessing();
            // Trigger the stop recording
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

    // Start interval timer to update every second
    this.timerInterval = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      if (this.startTime) {
        this.updateTimeDisplay();

        if (this.elapsedTime >= this.maxDuration) {
          // Timer reached maximum - will be handled by service
          return false;
        }
        return true; // Continue the timer
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

    // Update UI for preview mode - change icon and label
    if (this.recordingIcon) {
      this.recordingIcon.set_text("📝");
    }
    if (this.recordingLabel) {
      this.recordingLabel.set_text("Review & Insert");
    }

    // Update instructions
    if (this.instructionLabel) {
      this.instructionLabel.set_text("Review the transcribed text below.");
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
    const textEntry = new St.Entry({
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
    const clutterText = textEntry.get_clutter_text();
    clutterText.set_line_wrap(true);
    clutterText.set_line_wrap_mode(2); // PANGO_WRAP_WORD
    clutterText.set_single_line_mode(false);
    clutterText.set_activatable(false);

    this.container.add_child(textEntry);

    // Focus the text entry after a short delay and select all text
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      textEntry.grab_key_focus();
      clutterText.set_selection(0, text.length);
      return false;
    });

    // Create new button box for preview
    const buttonBox = createHorizontalBox();

    const insertButton = createHoverButton(
      "Insert Text",
      COLORS.SUCCESS,
      "#34ce57"
    );
    const copyButton = createHoverButton("Copy Only", COLORS.INFO, "#0077ee");
    const cancelButton = createHoverButton(
      "Cancel",
      COLORS.SECONDARY,
      COLORS.DARK_GRAY
    );

    insertButton.connect("clicked", () => {
      const finalText = textEntry.get_text();
      this.close();
      this.onInsert?.(finalText);
    });

    copyButton.connect("clicked", () => {
      // Copy to clipboard and close
      const finalText = textEntry.get_text();
      console.log(`Copying text to clipboard: "${finalText}"`);

      // Copy to clipboard using our own method
      this._copyToClipboard(finalText);

      this.close();
      this.onCancel?.();
    });

    cancelButton.connect("clicked", () => {
      this.close();
      this.onCancel?.();
    });

    buttonBox.add_child(insertButton);
    buttonBox.add_child(copyButton);
    buttonBox.add_child(cancelButton);

    this.container.add_child(buttonBox);

    // Add keyboard hint
    const keyboardHint = new St.Label({
      text: "Press Enter to insert • Escape to cancel",
      style: `font-size: 12px; color: ${COLORS.DARK_GRAY}; text-align: center; margin-top: 10px;`,
    });
    this.container.add_child(keyboardHint);

    // Update keyboard handling for preview mode
    this.modalBarrier.disconnect(this.keyboardHandlerId);
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
          const finalText = textEntry.get_text();
          this.close();
          this.onInsert?.(finalText);
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      }
    );
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

    // Focus solution similar to original
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      if (this.modalBarrier?.get_parent()) {
        this.modalBarrier.grab_key_focus();
        global.stage.set_key_focus(this.modalBarrier);
      }
      return false;
    });
  }

  close() {
    console.log("Closing DBus recording dialog");

    // Stop timer
    this.stopTimer();

    // Disconnect keyboard handler
    if (this.keyboardHandlerId && this.modalBarrier) {
      this.modalBarrier.disconnect(this.keyboardHandlerId);
      this.keyboardHandlerId = null;
    }

    // Clean up modal
    if (this.modalBarrier) {
      Main.layoutManager.removeChrome(this.modalBarrier);
      this.modalBarrier.destroy();
      this.modalBarrier = null;
    }
  }
}

export default class Speech2TextExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    this.recordingDialog = null;
    this.settings = null;
    this.settingsDialog = null;
    this.currentKeybinding = null;
    this.currentRecordingId = null;
    this.dbusProxy = null;
    this.signalConnections = [];
  }

  async _initDBusProxy() {
    try {
      const Speech2TextProxy =
        Gio.DBusProxy.makeProxyWrapper(Speech2TextInterface);

      this.dbusProxy = new Speech2TextProxy(
        Gio.DBus.session,
        "org.gnome.Speech2Text",
        "/org/gnome/Speech2Text"
      );

      // Connect to D-Bus signals
      this.signalConnections.push(
        this.dbusProxy.connectSignal(
          "RecordingStarted",
          (proxy, sender, [recordingId]) => {
            console.log(`Recording started: ${recordingId}`);
          }
        )
      );

      this.signalConnections.push(
        this.dbusProxy.connectSignal(
          "RecordingStopped",
          (proxy, sender, [recordingId, reason]) => {
            console.log(`Recording stopped: ${recordingId}, reason: ${reason}`);
          }
        )
      );

      this.signalConnections.push(
        this.dbusProxy.connectSignal(
          "TranscriptionReady",
          (proxy, sender, [recordingId, text]) => {
            console.log(`Transcription ready: ${recordingId}, text: ${text}`);
            this._handleTranscriptionReady(recordingId, text);
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
            this._handleRecordingError(recordingId, errorMessage);
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
          }
        )
      );

      return true;
    } catch (e) {
      console.error(`Failed to initialize D-Bus proxy: ${e}`);
      return false;
    }
  }

  async _checkServiceStatus() {
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

  _handleTranscriptionReady(recordingId, text) {
    if (recordingId !== this.currentRecordingId) {
      console.log(
        `Received transcription for different recording: ${recordingId}`
      );
      return;
    }

    // Check if we should skip preview and auto-insert
    const skipPreviewX11 = this.settings.get_boolean("skip-preview-x11");
    const isWayland = Meta.is_wayland_compositor();

    if (this.recordingDialog) {
      if (!isWayland && skipPreviewX11) {
        // Auto-insert mode: close dialog and insert text directly
        console.log("Auto-inserting text (skip preview enabled)");
        this.recordingDialog.close();
        this.recordingDialog = null;
        this.currentRecordingId = null;
        this.icon.set_style("");
        this._typeText(text);
      } else {
        // Normal mode: show preview dialog
        this.recordingDialog.showPreview(text);
      }
    } else {
      // No dialog, insert directly (fallback)
      this._typeText(text);
    }
  }

  _handleRecordingError(recordingId, errorMessage) {
    if (recordingId !== this.currentRecordingId) {
      console.log(`Received error for different recording: ${recordingId}`);
      return;
    }

    if (this.recordingDialog) {
      this.recordingDialog.showError(errorMessage);
    } else {
      Main.notify("Speech2Text Error", errorMessage);
    }
  }

  async enable() {
    console.log("Enabling Speech2Text extension (D-Bus version)");

    // Initialize D-Bus proxy
    const dbusInitialized = await this._initDBusProxy();
    if (!dbusInitialized) {
      Main.notify(
        "Speech2Text Error",
        "Failed to connect to speech-to-text service. Please ensure the service is running."
      );
      return;
    }

    // Check service status
    const serviceStatus = await this._checkServiceStatus();
    if (!serviceStatus.available) {
      Main.notify(
        "Speech2Text Error",
        `Service unavailable: ${serviceStatus.error}`
      );
      return;
    }

    this.settings = this.getSettings();

    // Create button with microphone icon
    button = new PanelMenu.Button(0.0, "Speech2Text");
    this.button = button;

    this.icon = new St.Icon({
      gicon: Gio.icon_new_for_string(
        `${this.path}/icons/microphone-symbolic.svg`
      ),
      style_class: "system-status-icon",
    });
    button.add_child(this.icon);

    // Create popup menu
    this.createPopupMenu();

    // Handle button clicks
    button.connect("button-press-event", (actor, event) => {
      const buttonPressed = event.get_button();

      if (buttonPressed === 1) {
        // Left click - toggle recording
        button.menu.close(true);
        this.toggleRecording();
        return Clutter.EVENT_STOP;
      } else if (buttonPressed === 3) {
        // Right click - show menu
        return Clutter.EVENT_PROPAGATE;
      }

      return Clutter.EVENT_STOP;
    });

    // Set up keyboard shortcut
    this.setupKeybinding();

    Main.panel.addToStatusArea("Speech2Text", button);
  }

  createPopupMenu() {
    // Settings menu item
    let settingsItem = new PopupMenu.PopupMenuItem("Settings");
    settingsItem.connect("activate", () => {
      this.showSettingsWindow();
    });
    this.button.menu.addMenuItem(settingsItem);

    // Separator
    this.button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // Current shortcut display
    this.shortcutLabel = new PopupMenu.PopupMenuItem("", { reactive: false });
    this.updateShortcutLabel();
    this.button.menu.addMenuItem(this.shortcutLabel);
  }

  updateShortcutLabel() {
    if (this.currentKeybinding) {
      this.shortcutLabel.label.set_text(`Shortcut: ${this.currentKeybinding}`);
    } else {
      this.shortcutLabel.label.set_text("No shortcut set");
    }
  }

  captureNewShortcut(callback) {
    // Create a modal dialog to capture new shortcut
    let captureWindow = new St.BoxLayout({
      style_class: "capture-shortcut-window",
      vertical: true,
      style: `
        background-color: rgba(20, 20, 20, 0.95);
        border-radius: 12px;
        padding: 30px;
        min-width: 400px;
        border: ${STYLES.DIALOG_BORDER};
      `,
    });

    let instructionLabel = createStyledLabel(
      "Press the key combination you want to use",
      "subtitle"
    );
    let hintLabel = createStyledLabel("Press Escape to cancel", "description");

    captureWindow.add_child(instructionLabel);
    captureWindow.add_child(hintLabel);

    // Create modal overlay
    let overlay = new St.Widget({
      style: `background-color: ${COLORS.TRANSPARENT_BLACK_70};`,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    overlay.add_child(captureWindow);

    let monitor = Main.layoutManager.primaryMonitor;
    overlay.set_size(monitor.width, monitor.height);
    overlay.set_position(monitor.x, monitor.y);

    // Center the capture window
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
      let [windowWidth, windowHeight] = captureWindow.get_size();
      if (windowWidth === 0) windowWidth = 400;
      if (windowHeight === 0) windowHeight = 200;

      captureWindow.set_position(
        (monitor.width - windowWidth) / 2,
        (monitor.height - windowHeight) / 2
      );
      return false;
    });

    Main.layoutManager.addTopChrome(overlay);

    // State tracking for modifier keys
    let modifierState = {
      control: false,
      shift: false,
      alt: false,
      super: false,
    };

    let statusLabel = createStyledLabel(
      "Waiting for key combination...",
      "normal",
      `color: ${COLORS.LIGHT_GRAY}; font-size: 14px; margin-top: 10px;`
    );
    captureWindow.add_child(statusLabel);

    // Function to update the display
    const updateDisplay = () => {
      let parts = [];
      if (modifierState.control) parts.push("Ctrl");
      if (modifierState.shift) parts.push("Shift");
      if (modifierState.alt) parts.push("Alt");
      if (modifierState.super) parts.push("Super");

      let display =
        parts.length > 0 ? parts.join(" + ") : "Waiting for key combination...";
      statusLabel.set_text(display);
    };

    // Capture keyboard input with better modifier handling
    let keyPressHandler = overlay.connect("key-press-event", (actor, event) => {
      const keyval = event.get_key_symbol();
      const state = event.get_state();
      const keyName = Clutter.keyval_name(keyval);

      if (keyval === Clutter.KEY_Escape) {
        // Cancel capture
        cleanupModal(overlay, { keyPressHandler, keyReleaseHandler });
        callback(null);
        return Clutter.EVENT_STOP;
      }

      // Update modifier state based on actual key presses
      if (keyName === "Control_L" || keyName === "Control_R") {
        modifierState.control = true;
        updateDisplay();
        return Clutter.EVENT_STOP;
      }
      if (keyName === "Shift_L" || keyName === "Shift_R") {
        modifierState.shift = true;
        updateDisplay();
        return Clutter.EVENT_STOP;
      }
      if (keyName === "Alt_L" || keyName === "Alt_R") {
        modifierState.alt = true;
        updateDisplay();
        return Clutter.EVENT_STOP;
      }
      if (keyName === "Super_L" || keyName === "Super_R") {
        modifierState.super = true;
        updateDisplay();
        return Clutter.EVENT_STOP;
      }

      // If it's a regular key (not just a modifier), complete the shortcut
      if (
        keyName &&
        !keyName.includes("_L") &&
        !keyName.includes("_R") &&
        !keyName.startsWith("Control") &&
        !keyName.startsWith("Shift") &&
        !keyName.startsWith("Alt") &&
        !keyName.startsWith("Super")
      ) {
        // Build final shortcut string
        let shortcut = "";
        if (modifierState.control) shortcut += "<Control>";
        if (modifierState.shift) shortcut += "<Shift>";
        if (modifierState.alt) shortcut += "<Alt>";
        if (modifierState.super) shortcut += "<Super>";
        shortcut += keyName.toLowerCase();

        // Clean up and return result
        cleanupModal(overlay, { keyPressHandler, keyReleaseHandler });
        callback(shortcut);
        return Clutter.EVENT_STOP;
      }

      return Clutter.EVENT_STOP;
    });

    // Also handle key release to reset modifier state if needed
    let keyReleaseHandler = overlay.connect(
      "key-release-event",
      (actor, event) => {
        const keyval = event.get_key_symbol();
        const keyName = Clutter.keyval_name(keyval);

        // Don't reset modifiers on release - let user build combination
        // This allows holding multiple modifiers before pressing the final key
        return Clutter.EVENT_STOP;
      }
    );

    overlay.grab_key_focus();
    overlay.set_reactive(true);
  }

  showSettingsWindow() {
    if (!this.settingsDialog) {
      this.settingsDialog = new SettingsDialog(this);
    }
    this.settingsDialog.show();
  }

  setupKeybinding() {
    // Remove existing keybinding
    try {
      Main.wm.removeKeybinding("toggle-recording");
    } catch (e) {
      // Ignore errors
    }

    // Get shortcut from settings
    let shortcuts = this.settings.get_strv("toggle-recording");
    if (shortcuts.length > 0) {
      this.currentKeybinding = shortcuts[0];
    } else {
      this.currentKeybinding = "<Control><Shift><Alt>c";
      this.settings.set_strv("toggle-recording", [this.currentKeybinding]);
    }

    // Register keybinding
    try {
      Main.wm.addKeybinding(
        "toggle-recording",
        this.settings,
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL,
        () => {
          console.log("Keyboard shortcut triggered");
          this.toggleRecording();
        }
      );
      console.log(`Keybinding registered: ${this.currentKeybinding}`);
    } catch (e) {
      console.error(`Error registering keybinding: ${e}`);
    }
  }

  async toggleRecording() {
    console.log("=== TOGGLE RECORDING (D-Bus) ===");

    if (this.currentRecordingId) {
      // Stop current recording
      console.log(`Stopping recording: ${this.currentRecordingId}`);
      try {
        await this.dbusProxy.StopRecordingAsync(this.currentRecordingId);
      } catch (e) {
        console.error(`Error stopping recording: ${e}`);
      }
      return;
    }

    // Start new recording
    try {
      const recordingDuration = this.settings.get_int("recording-duration");
      const copyToClipboard = this.settings.get_boolean("copy-to-clipboard");
      const skipPreviewX11 = this.settings.get_boolean("skip-preview-x11");

      // Always use preview mode for D-Bus service (it just controls service behavior)
      // We'll handle the skip-preview logic in the extension when we get the transcription
      const previewMode = true;

      console.log(
        `Starting recording: duration=${recordingDuration}, clipboard=${copyToClipboard}, skipPreview=${skipPreviewX11}`
      );

      const [recordingId] = await this.dbusProxy.StartRecordingAsync(
        recordingDuration,
        copyToClipboard,
        previewMode
      );

      this.currentRecordingId = recordingId;
      this.icon.set_style(`color: ${COLORS.PRIMARY};`);

      console.log(`Recording started with ID: ${recordingId}`);

      // Always show recording dialog during recording
      this.recordingDialog = new DBusRecordingDialog(
        () => {
          // Cancel callback
          console.log("Recording cancelled by user");
          if (this.currentRecordingId) {
            this.dbusProxy
              .StopRecordingAsync(this.currentRecordingId)
              .catch(console.error);
          }
          this.currentRecordingId = null;
          this.recordingDialog = null;
          this.icon.set_style("");
        },
        (text) => {
          // Insert callback
          console.log(`Inserting text: ${text}`);
          this._typeText(text);
          this.currentRecordingId = null;
          this.recordingDialog = null;
          this.icon.set_style("");
        },
        () => {
          // Stop callback
          console.log("Stop recording button clicked");
          if (this.currentRecordingId) {
            this.dbusProxy
              .StopRecordingAsync(this.currentRecordingId)
              .catch(console.error);
          }
        },
        recordingDuration
      );

      this.recordingDialog.open();
    } catch (e) {
      console.error(`Error starting recording: ${e}`);
      Main.notify(
        "Speech2Text Error",
        `Failed to start recording: ${e.message}`
      );
      this.icon.set_style("");
    }
  }

  async _typeText(text) {
    if (!text || !text.trim()) {
      console.log("No text to type");
      return;
    }

    try {
      const copyToClipboard = this.settings.get_boolean("copy-to-clipboard");
      console.log(`Typing text via D-Bus: "${text}"`);

      await this.dbusProxy.TypeTextAsync(text.trim(), copyToClipboard);
    } catch (e) {
      console.error(`Error typing text: ${e}`);
      Main.notify("Speech2Text Error", "Failed to insert text.");
    }
  }

  disable() {
    console.log("Disabling Speech2Text extension (D-Bus version)");

    // Stop any active recording
    if (this.currentRecordingId && this.dbusProxy) {
      this.dbusProxy
        .StopRecordingAsync(this.currentRecordingId)
        .catch(console.error);
      this.currentRecordingId = null;
    }

    // Close recording dialog
    if (this.recordingDialog) {
      this.recordingDialog.close();
      this.recordingDialog = null;
    }

    // Close settings dialog
    if (this.settingsDialog) {
      this.settingsDialog.close();
      this.settingsDialog = null;
    }

    // Disconnect D-Bus signals
    this.signalConnections.forEach((connection) => {
      if (this.dbusProxy) {
        this.dbusProxy.disconnectSignal(connection);
      }
    });
    this.signalConnections = [];

    // Remove keybinding
    try {
      Main.wm.removeKeybinding("toggle-recording");
    } catch (e) {
      console.error(`Error removing keybinding: ${e}`);
    }

    // Clean up button
    if (button) {
      button.destroy();
      button = null;
    }

    // Clear D-Bus proxy
    this.dbusProxy = null;
  }
}

function init(metadata) {
  return new Speech2TextExtension(metadata);
}
