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
import { COLORS, STYLES } from "./lib/constants.js";
import {
  createHoverButton,
  createTextButton,
  createStyledLabel,
  createVerticalBox,
  createHorizontalBox,
  createSeparator,
} from "./lib/uiUtils.js";
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
    this.timerInterval = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      this.updateTimeDisplay();

      if (this.elapsedTime >= this.maxDuration) {
        // Timer reached maximum - will be handled by service
        return false;
      }
      return true;
    });
  }

  stopTimer() {
    if (this.timerInterval) {
      GLib.source_remove(this.timerInterval);
      this.timerInterval = null;
    }
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

  startTimer() {
    this.startTime = Date.now();
    this.timerInterval = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      this.elapsedTime = Math.floor((Date.now() - this.startTime) / 1000);
      const minutes = Math.floor(this.elapsedTime / 60);
      const seconds = this.elapsedTime % 60;
      this.timeDisplay.set_text(
        `${minutes.toString().padStart(2, "0")}:${seconds
          .toString()
          .padStart(2, "0")}`
      );

      if (this.elapsedTime >= this.maxDuration) {
        // Timer reached maximum - will be handled by service
        return false;
      }
      return true;
    });
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

    if (this.recordingDialog) {
      this.recordingDialog.showPreview(text);
    } else {
      // No dialog, insert directly
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

  showSettingsWindow() {
    // Create simplified settings window for D-Bus version
    let settingsWindow = new St.BoxLayout({
      style_class: "settings-window",
      vertical: true,
      style: `
        background-color: rgba(20, 20, 20, 0.95);
        border-radius: 12px;
        padding: 25px;
        min-width: 550px;
        max-width: 600px;
        border: ${STYLES.DIALOG_BORDER};
      `,
    });

    // Header
    let headerBox = createHorizontalBox();
    let titleIcon = createStyledLabel("🎤", "icon", "");
    let titleLabel = createStyledLabel("Speech2Text Settings", "title");
    let closeButton = createTextButton("×", COLORS.SECONDARY, COLORS.DANGER, {
      fontSize: "24px",
    });

    headerBox.add_child(titleIcon);
    headerBox.add_child(titleLabel);
    headerBox.add_child(closeButton);

    // Keyboard shortcut section
    let shortcutSection = createVerticalBox();
    let shortcutLabel = createStyledLabel("Keyboard Shortcut", "subtitle");
    let shortcutDescription = createStyledLabel(
      "Set the keyboard combination to toggle recording on/off",
      "description"
    );

    // Current shortcut display
    let currentShortcutBox = createHorizontalBox();
    let currentShortcutLabel = createStyledLabel(
      "Current:",
      "normal",
      "min-width: 80px;"
    );

    this.currentShortcutDisplay = createStyledLabel(
      this.currentKeybinding || "No shortcut set",
      "normal",
      `
        font-size: 14px;
        color: #ff8c00;
        background-color: rgba(255, 140, 0, 0.1);
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid #ff8c00;
        min-width: 200px;
      `
    );

    currentShortcutBox.add_child(currentShortcutLabel);
    currentShortcutBox.add_child(this.currentShortcutDisplay);

    // Shortcut buttons
    let shortcutButtonBox = createHorizontalBox();
    let changeShortcutButton = createHoverButton(
      "Change Shortcut",
      COLORS.INFO,
      "#0077ee"
    );
    let resetToDefaultButton = createHoverButton(
      "Reset to Default",
      COLORS.WARNING,
      "#ff8c00"
    );
    let removeShortcutButton = createHoverButton(
      "Remove Shortcut",
      COLORS.DANGER,
      "#dc3545"
    );

    shortcutButtonBox.add_child(changeShortcutButton);
    shortcutButtonBox.add_child(resetToDefaultButton);
    shortcutButtonBox.add_child(removeShortcutButton);

    shortcutSection.add_child(shortcutLabel);
    shortcutSection.add_child(shortcutDescription);
    shortcutSection.add_child(currentShortcutBox);
    shortcutSection.add_child(shortcutButtonBox);

    // Recording duration section
    let durationSection = createVerticalBox();
    let durationLabel = createStyledLabel("Recording Duration", "subtitle");
    let durationDescription = createStyledLabel(
      "Maximum recording time (10 seconds to 5 minutes)",
      "description"
    );

    let durationSliderBox = createHorizontalBox();
    let durationSliderLabel = createStyledLabel(
      "Duration:",
      "normal",
      "min-width: 80px;"
    );

    let currentDuration = this.settings.get_int("recording-duration");
    let durationValueLabel = createStyledLabel(
      `${currentDuration}s`,
      "normal",
      "min-width: 50px;"
    );

    durationSliderBox.add_child(durationSliderLabel);
    durationSliderBox.add_child(durationValueLabel);

    durationSection.add_child(durationLabel);
    durationSection.add_child(durationDescription);
    durationSection.add_child(durationSliderBox);

    // Clipboard section
    let clipboardSection = createVerticalBox();
    let clipboardLabel = createStyledLabel("Clipboard Options", "subtitle");
    let clipboardDescription = createStyledLabel(
      "Configure whether transcribed text should be copied to clipboard",
      "description"
    );

    let clipboardCheckboxBox = createHorizontalBox();
    let clipboardCheckboxLabel = createStyledLabel(
      "Copy to clipboard:",
      "normal",
      "min-width: 130px;"
    );

    let isClipboardEnabled = this.settings.get_boolean("copy-to-clipboard");
    this.clipboardCheckbox = new St.Button({
      style: `
        width: 20px;
        height: 20px;
        border-radius: 3px;
        border: 2px solid ${COLORS.SECONDARY};
        background-color: ${
          isClipboardEnabled ? COLORS.PRIMARY : "transparent"
        };
        margin-right: 10px;
      `,
      reactive: true,
      can_focus: true,
    });

    this.clipboardCheckboxIcon = new St.Label({
      text: isClipboardEnabled ? "✓" : "",
      style: `color: white; font-size: 14px; font-weight: bold; text-align: center;`,
    });
    this.clipboardCheckbox.add_child(this.clipboardCheckboxIcon);

    this.clipboardCheckbox.connect("clicked", () => {
      let currentState = this.settings.get_boolean("copy-to-clipboard");
      let newState = !currentState;

      this.settings.set_boolean("copy-to-clipboard", newState);

      this.clipboardCheckbox.set_style(`
        width: 20px;
        height: 20px;
        border-radius: 3px;
        border: 2px solid ${COLORS.SECONDARY};
        background-color: ${newState ? COLORS.PRIMARY : "transparent"};
        margin-right: 10px;
      `);

      this.clipboardCheckboxIcon.set_text(newState ? "✓" : "");
      Main.notify(
        "Speech2Text",
        `Clipboard copying ${newState ? "enabled" : "disabled"}`
      );
    });

    clipboardCheckboxBox.add_child(clipboardCheckboxLabel);
    clipboardCheckboxBox.add_child(this.clipboardCheckbox);

    clipboardSection.add_child(clipboardLabel);
    clipboardSection.add_child(clipboardDescription);
    clipboardSection.add_child(clipboardCheckboxBox);

    // Assemble window
    settingsWindow.add_child(headerBox);
    settingsWindow.add_child(shortcutSection);
    settingsWindow.add_child(createSeparator());
    settingsWindow.add_child(durationSection);
    settingsWindow.add_child(createSeparator());
    settingsWindow.add_child(clipboardSection);

    // Create modal overlay
    let overlay = new St.Widget({
      style: `background-color: ${COLORS.TRANSPARENT_BLACK_70};`,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    overlay.add_child(settingsWindow);

    let monitor = Main.layoutManager.primaryMonitor;
    overlay.set_size(monitor.width, monitor.height);
    overlay.set_position(monitor.x, monitor.y);

    // Center the settings window
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
      let [windowWidth, windowHeight] = settingsWindow.get_size();
      if (windowWidth === 0) windowWidth = 450;
      if (windowHeight === 0)
        windowHeight = Math.min(monitor.height * 0.8, 600);

      settingsWindow.set_position(
        (monitor.width - windowWidth) / 2,
        (monitor.height - windowHeight) / 2
      );
      return false;
    });

    Main.layoutManager.addTopChrome(overlay);

    // Close handlers
    const closeSettings = () => {
      cleanupModal(overlay, {});
    };

    closeButton.connect("clicked", closeSettings);

    overlay.connect("button-press-event", () => Clutter.EVENT_STOP);
    overlay.connect("key-press-event", (actor, event) => {
      if (event.get_key_symbol() === Clutter.KEY_Escape) {
        closeSettings();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_STOP;
    });

    overlay.grab_key_focus();
    overlay.set_reactive(true);
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
      const previewMode = true; // Always use preview mode

      console.log(
        `Starting recording: duration=${recordingDuration}, clipboard=${copyToClipboard}, preview=${previewMode}`
      );

      const [recordingId] = await this.dbusProxy.StartRecordingAsync(
        recordingDuration,
        copyToClipboard,
        previewMode
      );

      this.currentRecordingId = recordingId;
      this.icon.set_style(`color: ${COLORS.PRIMARY};`);

      console.log(`Recording started with ID: ${recordingId}`);

      // Show recording dialog
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
