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

    // Add the dialog to the modal barrierOkay, let's try this.
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
    // Add to UI using the same method as settings window
    Main.layoutManager.addTopChrome(this.modalBarrier);

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
      Main.layoutManager.removeChrome(this.modalBarrier);
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
    // Add menu item for settings
    let settingsItem = new PopupMenu.PopupMenuItem("Settings");
    settingsItem.connect("activate", () => {
      this.showSettingsWindow();
    });
    button.menu.addMenuItem(settingsItem);

    // Add separator
    button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // Add current shortcut display
    this.shortcutLabel = new PopupMenu.PopupMenuItem("", { reactive: false });
    this.updateShortcutLabel();
    button.menu.addMenuItem(this.shortcutLabel);
  }

  updateShortcutLabel() {
    let shortcuts = this.settings.get_strv("toggle-recording");
    let shortcut = shortcuts.length > 0 ? shortcuts[0] : null;

    if (shortcut) {
      this.shortcutLabel.label.text = `Shortcut: ${shortcut}`;
    } else {
      this.shortcutLabel.label.text = "Shortcut: None";
    }
  }

  showSettingsWindow() {
    // Create settings window
    let settingsWindow = new St.BoxLayout({
      style_class: "settings-window",
      vertical: true,
      style: `
        background-color: rgba(20, 20, 20, 0.95);
        border-radius: 12px;
        padding: 30px;
        min-width: 450px;
        min-height: 300px;
        border: 2px solid #ff8c00;
      `,
    });

    // Header
    let headerBox = new St.BoxLayout({
      vertical: false,
      style: "spacing: 15px; margin-bottom: 30px;",
    });

    let titleIcon = new St.Icon({
      icon_name: "audio-input-microphone-symbolic",
      icon_size: 32,
      style: "color: #ff8c00;",
    });

    let title = new St.Label({
      text: "Whisper Typing Settings",
      style: "font-size: 22px; font-weight: bold; color: white;",
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

    headerBox.add_child(titleIcon);
    headerBox.add_child(title);
    headerBox.add_child(new St.Widget({ x_expand: true })); // Spacer
    headerBox.add_child(closeButton);

    // Keyboard shortcut section
    let shortcutSection = new St.BoxLayout({
      vertical: true,
      style: "spacing: 15px; margin-bottom: 20px;",
    });

    let shortcutLabel = new St.Label({
      text: "Keyboard Shortcut",
      style:
        "font-size: 18px; font-weight: bold; color: white; margin-bottom: 10px;",
    });

    let shortcutDescription = new St.Label({
      text: "Set the keyboard combination to toggle recording on/off",
      style: "font-size: 14px; color: #ccc; margin-bottom: 15px;",
    });

    // Current shortcut display and edit
    let currentShortcutBox = new St.BoxLayout({
      vertical: false,
      style: "spacing: 15px; margin-bottom: 15px;",
    });

    let currentShortcutLabel = new St.Label({
      text: "Current:",
      style: "font-size: 14px; color: white; min-width: 80px;",
    });

    this.currentShortcutDisplay = new St.Label({
      text:
        this.settings.get_strv("toggle-recording")[0] ||
        "<Control><Shift><Alt>c",
      style: `
        font-size: 14px; 
        color: #ff8c00; 
        background-color: rgba(255, 140, 0, 0.1);
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid #ff8c00;
        min-width: 200px;
      `,
    });

    currentShortcutBox.add_child(currentShortcutLabel);
    currentShortcutBox.add_child(this.currentShortcutDisplay);

    // Button container for all shortcut-related buttons
    let shortcutButtonsBox = new St.BoxLayout({
      vertical: false,
      style: "spacing: 10px; margin-bottom: 15px;",
    });

    // Change shortcut button
    let changeShortcutButton = new St.Button({
      label: "Change Shortcut",
      style: `
        background-color: #0066cc;
        color: white;
        border-radius: 6px;
        padding: 12px 20px;
        font-size: 14px;
        border: none;
      `,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    // Reset to default button
    let resetShortcutButton = new St.Button({
      label: "Reset to Default",
      style: `
        background-color: #ff8c00;
        color: white;
        border-radius: 6px;
        padding: 12px 20px;
        font-size: 14px;
        border: none;
      `,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    // Remove shortcut button
    let removeShortcutButton = new St.Button({
      label: "Remove Shortcut",
      style: `
        background-color: #dc3545;
        color: white;
        border-radius: 6px;
        padding: 12px 20px;
        font-size: 14px;
        border: none;
      `,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    // Add buttons to the container
    shortcutButtonsBox.add_child(changeShortcutButton);
    shortcutButtonsBox.add_child(resetShortcutButton);
    shortcutButtonsBox.add_child(removeShortcutButton);

    // Instructions
    let instructionsLabel = new St.Label({
      text: "Click 'Change Shortcut' and then press the key combination you want to use.\nPress Escape to cancel the change.",
      style: "font-size: 12px; color: #888; margin-bottom: 20px;",
    });

    shortcutSection.add_child(shortcutLabel);
    shortcutSection.add_child(shortcutDescription);
    shortcutSection.add_child(currentShortcutBox);
    shortcutSection.add_child(shortcutButtonsBox);
    shortcutSection.add_child(instructionsLabel);

    // Separator line
    let separator = new St.Widget({
      style: "background-color: #444; height: 1px; margin: 20px 0;",
    });

    // About section
    let aboutSection = new St.BoxLayout({
      vertical: true,
      style: "spacing: 10px;",
    });

    let aboutLabel = new St.Label({
      text: "About",
      style:
        "font-size: 18px; font-weight: bold; color: white; margin-bottom: 10px;",
    });

    let aboutText = new St.Label({
      text: "Whisper Typing extension for GNOME Shell\nUses OpenAI Whisper for speech-to-text transcription",
      style: "font-size: 14px; color: #ccc;",
    });

    aboutSection.add_child(aboutLabel);
    aboutSection.add_child(aboutText);

    settingsWindow.add_child(headerBox);
    settingsWindow.add_child(shortcutSection);
    settingsWindow.add_child(separator);
    settingsWindow.add_child(aboutSection);

    // Create modal overlay
    let overlay = new St.Widget({
      style: "background-color: rgba(0, 0, 0, 0.7);",
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    overlay.add_child(settingsWindow);

    // Get proper screen dimensions
    let monitor = Main.layoutManager.primaryMonitor;
    overlay.set_size(monitor.width, monitor.height);
    overlay.set_position(monitor.x, monitor.y);

    // Center the settings window
    settingsWindow.set_position(
      (monitor.width - 450) / 2,
      (monitor.height - 300) / 2
    );

    Main.layoutManager.addTopChrome(overlay);

    // Store handler IDs so we can disconnect them during shortcut capture
    let clickHandlerId = null;
    let keyPressHandlerId = null;

    // Function to close settings window
    const closeSettings = () => {
      if (keyPressHandlerId) {
        overlay.disconnect(keyPressHandlerId);
        keyPressHandlerId = null;
      }
      if (clickHandlerId) {
        overlay.disconnect(clickHandlerId);
        clickHandlerId = null;
      }
      Main.layoutManager.removeChrome(overlay);
    };

    // Close button handler
    closeButton.connect("clicked", closeSettings);

    // Click outside to close - but make sure to block all background clicks
    clickHandlerId = overlay.connect("button-press-event", (actor, event) => {
      let [x, y] = event.get_coords();
      let [windowX, windowY] = settingsWindow.get_position();
      let [windowW, windowH] = settingsWindow.get_size();

      // If click is outside settings window area, close it
      if (
        x < windowX ||
        x > windowX + windowW ||
        y < windowY ||
        y > windowY + windowH
      ) {
        closeSettings();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });

    // Escape key to close and block all other keyboard events from going to background
    keyPressHandlerId = overlay.connect("key-press-event", (actor, event) => {
      if (event.get_key_symbol() === Clutter.KEY_Escape) {
        closeSettings();
        return Clutter.EVENT_STOP;
      }
      // Block other keys from reaching background applications
      return Clutter.EVENT_STOP;
    });

    // Change shortcut button handler
    changeShortcutButton.connect("clicked", () => {
      this.startShortcutCapture(
        changeShortcutButton,
        overlay,
        clickHandlerId,
        keyPressHandlerId,
        closeSettings
      );
    });

    // Reset to default button handler
    resetShortcutButton.connect("clicked", () => {
      const defaultShortcut = "<Control><Shift><Alt>c";

      // Remove existing keybinding first
      try {
        Main.wm.removeKeybinding("toggle-recording");
      } catch (e) {
        // Ignore errors if keybinding doesn't exist
      }

      // Update settings
      this.settings.set_strv("toggle-recording", [defaultShortcut]);

      // Update current keybinding
      this.currentKeybinding = defaultShortcut;

      // Re-register keybinding
      try {
        Main.wm.addKeybinding(
          "toggle-recording",
          this.settings,
          Meta.KeyBindingFlags.NONE,
          Shell.ActionMode.NORMAL,
          () => {
            if (this.recordingProcess) {
              // If recording, stop it (with transcription)
              if (this.recordingDialog) {
                this.recordingDialog.close();
                this.recordingDialog = null;
              }
              try {
                GLib.spawn_command_line_sync(
                  `kill -USR1 ${this.recordingProcess}`
                );
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
          }
        );
      } catch (e) {
        log(`Error registering keybinding: ${e}`);
      }

      // Update display
      this.currentShortcutDisplay.set_text(defaultShortcut);
      this.currentShortcutDisplay.set_style(`
        font-size: 14px; 
        color: #ff8c00; 
        background-color: rgba(255, 140, 0, 0.1);
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid #ff8c00;
        min-width: 200px;
      `);

      // Update menu label
      this.updateShortcutLabel();

      // Show confirmation
      Main.notify(
        "Whisper Typing",
        "Shortcut reset to default: Ctrl+Shift+Alt+C"
      );
    });

    // Remove shortcut button handler
    removeShortcutButton.connect("clicked", () => {
      // Remove the keybinding
      try {
        Main.wm.removeKeybinding("toggle-recording");
        this.currentKeybinding = null;

        // Clear the settings
        this.settings.set_strv("toggle-recording", []);

        // Update display
        this.currentShortcutDisplay.set_text("No shortcut set");
        this.currentShortcutDisplay.set_style(`
          font-size: 14px; 
          color: #dc3545; 
          background-color: rgba(220, 53, 69, 0.1);
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid #dc3545;
          min-width: 200px;
        `);

        // Update menu label
        this.updateShortcutLabel();

        // Show confirmation
        Main.notify("Whisper Typing", "Keyboard shortcut removed");
      } catch (e) {
        log(`Error removing keybinding: ${e}`);
        Main.notify("Whisper Typing", "Error removing keyboard shortcut");
      }
    });

    // Ensure the overlay grabs focus and blocks input to background
    overlay.grab_key_focus();
    overlay.set_reactive(true);
  }

  startShortcutCapture(
    button,
    overlay,
    clickHandlerId,
    keyPressHandlerId,
    closeSettings
  ) {
    // Store original shortcut for potential restoration
    let originalShortcut = this.currentShortcutDisplay.get_text();
    let lastKeyCombo = null;
    let lastShortcut = null;
    let saveButtonClickId = null;

    // Temporarily disconnect the overlay's normal event handlers
    if (clickHandlerId) {
      overlay.disconnect(clickHandlerId);
    }
    if (keyPressHandlerId) {
      overlay.disconnect(keyPressHandlerId);
    }

    // Change button appearance to indicate capture mode
    button.set_label("Save Shortcut");
    button.set_style(`
      background-color: #ff8c00;
      color: white;
      border-radius: 6px;
      padding: 12px 20px;
      font-size: 14px;
      border: none;
    `);

    // Update the display to show capture mode
    this.currentShortcutDisplay.set_text("Press a key combination...");
    this.currentShortcutDisplay.set_style(`
      font-size: 14px; 
      color: #ff8c00; 
      background-color: rgba(255, 140, 0, 0.2);
      padding: 8px 12px;
      border-radius: 6px;
      border: 2px solid #ff8c00;
      min-width: 200px;
    `);

    // Ensure the overlay has focus and can capture keyboard events
    overlay.grab_key_focus();

    // Function to restore original handlers
    const restoreHandlers = () => {
      // Get reference to settingsWindow from the overlay's children
      let settingsWindow = overlay.get_first_child();

      // Reconnect original click handler
      clickHandlerId = overlay.connect("button-press-event", (actor, event) => {
        let [x, y] = event.get_coords();
        let [windowX, windowY] = settingsWindow.get_position();
        let [windowW, windowH] = settingsWindow.get_size();

        // If click is outside settings window area, close it
        if (
          x < windowX ||
          x > windowX + windowW ||
          y < windowY ||
          y > windowY + windowH
        ) {
          closeSettings();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      // Reconnect original key handler
      keyPressHandlerId = overlay.connect("key-press-event", (actor, event) => {
        if (event.get_key_symbol() === Clutter.KEY_Escape) {
          closeSettings();
          return Clutter.EVENT_STOP;
        }
        // Block other keys from reaching background applications
        return Clutter.EVENT_STOP;
      });
    };

    // Function to reset button and display on cancel
    const resetOnCancel = () => {
      // Disconnect save button handler if it exists
      if (saveButtonClickId) {
        button.disconnect(saveButtonClickId);
        saveButtonClickId = null;
      }

      button.set_label("Change Shortcut");
      button.set_style(`
        background-color: #0066cc;
        color: white;
        border-radius: 6px;
        padding: 12px 20px;
        font-size: 14px;
        border: none;
      `);

      // Restore original shortcut display
      this.currentShortcutDisplay.set_text(originalShortcut);
      this.currentShortcutDisplay.set_style(`
        font-size: 14px; 
        color: #ff8c00; 
        background-color: rgba(255, 140, 0, 0.1);
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid #ff8c00;
        min-width: 200px;
      `);
    };

    // Function to show success state
    const showSuccess = (shortcut, displayText) => {
      // Disconnect save button handler if it exists
      if (saveButtonClickId) {
        button.disconnect(saveButtonClickId);
        saveButtonClickId = null;
      }

      button.set_label("Shortcut Changed!");
      button.set_style(`
        background-color: #28a745;
        color: white;
        border-radius: 6px;
        padding: 12px 20px;
        font-size: 14px;
        border: none;
      `);

      // Update display with new shortcut
      this.currentShortcutDisplay.set_text(displayText);
      this.currentShortcutDisplay.set_style(`
        font-size: 14px; 
        color: #28a745; 
        background-color: rgba(40, 167, 69, 0.1);
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid #28a745;
        min-width: 200px;
      `);

      // Reset button after 2 seconds
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
        button.set_label("Change Shortcut");
        button.set_style(`
          background-color: #0066cc;
          color: white;
          border-radius: 6px;
          padding: 12px 20px;
          font-size: 14px;
          border: none;
        `);

        // Reset display to normal style but keep new shortcut
        this.currentShortcutDisplay.set_style(`
          font-size: 14px; 
          color: #ff8c00; 
          background-color: rgba(255, 140, 0, 0.1);
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid #ff8c00;
          min-width: 200px;
        `);

        return false; // Don't repeat
      });
    };

    // Connect the Save Shortcut button handler
    saveButtonClickId = button.connect("clicked", () => {
      log(
        `Save shortcut clicked! lastShortcut: ${lastShortcut}, lastKeyCombo: ${lastKeyCombo}`
      );

      if (lastShortcut) {
        // Save the new shortcut
        this.updateKeybinding(lastShortcut);

        // Show success state
        showSuccess(lastShortcut, lastKeyCombo);

        // Reset everything
        overlay.disconnect(captureId);
        restoreHandlers();

        // Show confirmation notification
        Main.notify("Whisper Typing", `Shortcut changed to: ${lastKeyCombo}`);
      } else {
        // No valid shortcut was captured
        Main.notify(
          "Whisper Typing",
          "Please press a valid key combination first"
        );
      }
    });

    // Capture key combinations on the overlay
    let captureId = overlay.connect("key-press-event", (actor, event) => {
      let keyval = event.get_key_symbol();
      let state = event.get_state();

      // Handle Escape to cancel
      if (keyval === Clutter.KEY_Escape) {
        overlay.disconnect(captureId);
        restoreHandlers();
        resetOnCancel();
        return Clutter.EVENT_STOP;
      }

      // Show current key combination being pressed (real-time feedback)
      let currentCombo = "";
      if (state & Clutter.ModifierType.CONTROL_MASK) currentCombo += "Ctrl+";
      if (state & Clutter.ModifierType.SHIFT_MASK) currentCombo += "Shift+";
      if (state & Clutter.ModifierType.MOD1_MASK) currentCombo += "Alt+";
      if (state & Clutter.ModifierType.SUPER_MASK) currentCombo += "Super+";

      let keyname = Clutter.keyval_name(keyval);
      if (
        keyname &&
        keyname !== "Control_L" &&
        keyname !== "Control_R" &&
        keyname !== "Shift_L" &&
        keyname !== "Shift_R" &&
        keyname !== "Alt_L" &&
        keyname !== "Alt_R" &&
        keyname !== "Super_L" &&
        keyname !== "Super_R"
      ) {
        currentCombo += keyname;

        // Show the current combination in the display
        this.currentShortcutDisplay.set_text(`${currentCombo}`);

        // Store the last valid key combination
        lastKeyCombo = currentCombo;

        // Build shortcut string for saving
        let shortcut = "";
        if (state & Clutter.ModifierType.CONTROL_MASK) shortcut += "<Control>";
        if (state & Clutter.ModifierType.SHIFT_MASK) shortcut += "<Shift>";
        if (state & Clutter.ModifierType.MOD1_MASK) shortcut += "<Alt>";
        if (state & Clutter.ModifierType.SUPER_MASK) shortcut += "<Super>";

        // Always add the key name (even if no modifiers)
        shortcut += keyname.toLowerCase();
        lastShortcut = shortcut;

        log(
          `Key pressed: ${keyname}, shortcut: ${shortcut}, combo: ${currentCombo}`
        );
      }

      return Clutter.EVENT_STOP;
    });
  }

  setupKeybinding() {
    // Always remove existing keybinding first
    try {
      Main.wm.removeKeybinding("toggle-recording");
    } catch (e) {
      // Ignore errors if keybinding doesn't exist
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
    try {
      Main.wm.addKeybinding(
        "toggle-recording",
        this.settings,
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL,
        () => toggleRecording()
      );
      log(`Keybinding registered: ${this.currentKeybinding}`);
    } catch (e) {
      log(`Error registering keybinding: ${e}`);
    }
  }

  updateKeybinding(newShortcut) {
    log(`Updating keybinding from ${this.currentKeybinding} to ${newShortcut}`);

    // Save to settings
    this.settings.set_strv("toggle-recording", [newShortcut]);

    // Update current keybinding
    this.currentKeybinding = newShortcut;

    // Reregister keybinding
    this.setupKeybinding();

    // Update menu label
    this.updateShortcutLabel();

    log(`Keybinding updated to: ${newShortcut}`);
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
