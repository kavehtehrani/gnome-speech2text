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

let button;

// Helper function to create button styles
function createButtonStyle(baseColor, hoverColor) {
  return {
    normal: `
      background-color: ${baseColor};
      color: white;
      border-radius: 6px;
      padding: 12px 20px;
      font-size: 14px;
      border: none;
      transition: all 0.2s ease;
    `,
    hover: `
      background-color: ${hoverColor};
      color: white;
      border-radius: 6px;
      padding: 12px 20px;
      font-size: 14px;
      border: none;
      transition: all 0.2s ease;
      transform: scale(1.05);
    `,
  };
}

// Helper function to add hand cursor on button hover
function addHandCursorToButton(button) {
  button.connect("enter-event", () => {
    global.display.set_cursor(Meta.Cursor.POINTING_HAND);
  });

  button.connect("leave-event", () => {
    global.display.set_cursor(Meta.Cursor.DEFAULT);
  });
}

// Helper function to create a button with hover effects
function createHoverButton(label, baseColor, hoverColor) {
  let styles = createButtonStyle(baseColor, hoverColor);
  let button = new St.Button({
    label: label,
    style: styles.normal,
    reactive: true,
    can_focus: true,
    track_hover: true,
  });

  button.connect("enter-event", () => {
    button.set_style(styles.hover);
  });

  button.connect("leave-event", () => {
    button.set_style(styles.normal);
  });

  // Add hand cursor effect
  addHandCursorToButton(button);

  return button;
}

// Simple recording dialog using custom modal barrier
class RecordingDialog {
  constructor(onStop, onCancel) {
    log("🎯 RecordingDialog constructor called");

    this.onStop = onStop;
    this.onCancel = onCancel;
    // Pulse animation properties removed - no longer needed

    // Create modal barrier that covers the entire screen
    this.modalBarrier = new St.Widget({
      style: `
        background-color: rgba(0, 0, 0, 0.3);
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
          if (this.onCancel) {
            this.onCancel();
          }
          return Clutter.EVENT_STOP;
        } else if (
          keyval === Clutter.KEY_space ||
          keyval === Clutter.KEY_Return ||
          keyval === Clutter.KEY_KP_Enter
        ) {
          // Enter/Space = Stop and process (with transcription)
          log(`🎯 Stopping recording via keyboard: ${keyname}`);
          this.close();
          if (this.onStop) {
            this.onStop();
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

    this.recordingIcon = new St.Label({
      text: "🎤",
      style: "font-size: 48px; text-align: center;",
    });

    let recordingLabel = new St.Label({
      text: "Recording...",
      style: "font-size: 20px; font-weight: bold; color: white; ",
    });

    headerBox.add_child(this.recordingIcon);
    headerBox.add_child(recordingLabel);

    // Instructions
    let instructionLabel = new St.Label({
      text: "Speak now\nPress Enter to process, Escape to cancel.",
      style: "font-size: 16px; color: #ccc; text-align: center;",
    });

    // Buttons
    this.stopButton = createHoverButton("Stop Recording", "#ff4444", "#ff6666");

    this.cancelButton = createHoverButton("Cancel", "#666666", "#888888");

    // Connect button events
    this.stopButton.connect("clicked", () => {
      log("🎯 Stop button clicked!");
      this.close();
      if (this.onStop) {
        this.onStop();
      }
    });

    this.cancelButton.connect("clicked", () => {
      log("🎯 Cancel button clicked!");
      this.close();
      if (this.onCancel) {
        this.onCancel();
      }
    });

    // Add to content box
    this.container.add_child(headerBox);
    this.container.add_child(instructionLabel);
    this.container.add_child(this.stopButton);
    this.container.add_child(this.cancelButton);

    // Add to modal barrier
    this.modalBarrier.add_child(this.container);
  }

  open() {
    log("🎯 Opening custom modal dialog");

    // Add to UI
    Main.layoutManager.addTopChrome(this.modalBarrier);

    // Set barrier to cover entire screen
    let monitor = Main.layoutManager.primaryMonitor;
    this.modalBarrier.set_position(monitor.x, monitor.y);
    this.modalBarrier.set_size(monitor.width, monitor.height);

    // Center the dialog container within the barrier
    this.container.set_position(
      (monitor.width - 300) / 2,
      (monitor.height - 200) / 2
    );

    this.modalBarrier.show();

    // X11 focus solution: Use xdotool to focus GNOME Shell window
    log("🎯 Attempting X11 focus solution");

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      try {
        // Get GNOME Shell's window ID and focus it
        let [success, stdout] = GLib.spawn_command_line_sync(
          'xdotool search --onlyvisible --class "gnome-shell" | head -1'
        );

        if (success && stdout) {
          let windowId = new TextDecoder().decode(stdout).trim();
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

        // Now try to focus our modal barrier
        this.modalBarrier.grab_key_focus();
        global.stage.set_key_focus(this.modalBarrier);

        // Debug: Check if it worked
        let currentFocus = global.stage.get_key_focus();
        log(
          `🎯 Final focus check: ${
            currentFocus ? currentFocus.toString() : "NULL"
          }`
        );
        log(
          `🎯 Is modal barrier focused? ${currentFocus === this.modalBarrier}`
        );
      } catch (e) {
        log(`⚠️ X11 focus error: ${e}`);
      }

      return false;
    });

    // Animation removed - no more pulsating
  }

  close() {
    log("🎯 Closing custom modal dialog");
    // Animation removed - no more pulsating

    if (this.modalBarrier && this.modalBarrier.get_parent()) {
      Main.layoutManager.removeChrome(this.modalBarrier);
    }
    this.modalBarrier = null;
    this.container = null;
  }

  // Pulse animation methods removed - no longer needed
}

export default class WhisperTypingExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    this.recordingDialog = null;
    this.recordingProcess = null;
    this.settings = null;
    this.currentKeybinding = null;

    // Remove animation properties since we're not pulsating anymore
    this.recordingIcon = new St.Label({
      text: "🎤",
      style: "font-size: 48px; text-align: center;",
    });
  }

  enable() {
    this.settings = this.getSettings();
    this.recordingProcess = null;
    this.recordingDialog = null;

    // Create button with microphone icon
    let button = new PanelMenu.Button(0.0, "Whisper Typing");

    // Make button referenceable by this object
    this.button = button;

    this.icon = new St.Icon({
      gicon: Gio.icon_new_for_string(
        this.path + "/icons/microphone-symbolic.svg"
      ),
      style_class: "system-status-icon",
    });
    button.add_child(this.icon);

    // Create popup menu
    this.createPopupMenu();

    // Override the default menu behavior to prevent left-click menu interference
    // Store the original vfunc_event method
    let originalEvent = button.vfunc_event;

    // Override the event handler to prevent menu on left click
    button.vfunc_event = function (event) {
      if (
        event.type() === Clutter.EventType.BUTTON_PRESS &&
        event.get_button() === 1
      ) {
        // For left clicks, don't call the original handler which opens menu
        // Our custom button-press-event handler will handle it
        return Clutter.EVENT_STOP;
      }
      // For all other events (including right-click), use original behavior
      return originalEvent.call(this, event);
    };

    // Handle button clicks
    button.connect("button-press-event", (actor, event) => {
      let buttonPressed = event.get_button();
      log(`🖱️ BUTTON CLICK TRIGGERED`);

      if (buttonPressed === 1) {
        // Left click - start recording immediately AND prevent menu from opening
        log("🖱️ Left click detected - starting recording synchronously");

        // CRITICAL: Prevent the menu from opening on left click
        // This was causing the focus issues!
        button.menu.close(true); // Force close menu if it's trying to open

        // Debug: Show current focus state before starting recording
        try {
          let currentFocus = global.stage.get_key_focus();
          log(
            `🔍 FOCUS DEBUG - Current stage focus: ${
              currentFocus ? currentFocus.toString() : "NULL"
            }`
          );

          // Try to get active window info using xdotool (X11)
          let [success, stdout] = GLib.spawn_command_line_sync(
            "xdotool getactivewindow"
          );
          if (success && stdout) {
            let windowId = new TextDecoder().decode(stdout).trim();
            log(`🔍 FOCUS DEBUG - Active X11 window ID: ${windowId}`);

            // Get window name
            let [nameSuccess, nameStdout] = GLib.spawn_command_line_sync(
              `xdotool getwindowname ${windowId}`
            );
            if (nameSuccess && nameStdout) {
              let windowName = new TextDecoder().decode(nameStdout).trim();
              log(`🔍 FOCUS DEBUG - Active window name: ${windowName}`);
            }
          } else {
            // NO ACTIVE WINDOW - this is the problem!
            log(
              `🔍 FOCUS DEBUG - No active X11 window found - this will cause focus issues!`
            );

            // Try to find and focus any available window to establish X11 context
            let [findSuccess, findStdout] = GLib.spawn_command_line_sync(
              "xdotool search --onlyvisible '.*' | head -1"
            );
            if (findSuccess && findStdout) {
              let anyWindowId = new TextDecoder().decode(findStdout).trim();
              if (anyWindowId) {
                log(
                  `🔍 FOCUS DEBUG - Found window ${anyWindowId}, focusing it to establish X11 context`
                );
                GLib.spawn_command_line_sync(
                  `xdotool windowfocus ${anyWindowId}`
                );
                GLib.spawn_command_line_sync(
                  `xdotool windowactivate ${anyWindowId}`
                );

                // Wait a moment for focus to settle
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                  // Now start recording with proper X11 context
                  this.toggleRecording();
                  return false;
                });
                return Clutter.EVENT_STOP;
              }
            }
          }
        } catch (e) {
          log(`🔍 FOCUS DEBUG - Error getting focus info: ${e}`);
        }

        // Call toggleRecording immediately, synchronously with the user click
        this.toggleRecording();

        return Clutter.EVENT_STOP; // Prevent menu from opening
      } else if (buttonPressed === 3) {
        // Right click - show menu (let normal menu behavior happen)
        log("🖱️ Right click detected - allowing menu to open");
        return Clutter.EVENT_PROPAGATE; // Allow menu to open
      }

      return Clutter.EVENT_STOP;
    });

    // Disable the menu's default reactivity to clicks on the main button
    // This prevents the menu from opening on left clicks
    button.set_reactive(true);
    button.menu.actor.set_reactive(true);

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
    this.button.menu.addMenuItem(settingsItem);

    // Add separator
    this.button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // Add current shortcut display
    this.shortcutLabel = new PopupMenu.PopupMenuItem("", { reactive: false });
    this.updateShortcutLabel();
    this.button.menu.addMenuItem(this.shortcutLabel);
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

    // Header box for icon, title, and close button
    let headerBox = new St.BoxLayout({
      vertical: false,
      style: "spacing: 16px; margin-bottom: 18px; align-items: center;",
      x_align: Clutter.ActorAlign.FILL,
      y_align: Clutter.ActorAlign.CENTER,
    });

    // Icon
    let titleIcon = new St.Label({
      text: "🎤",
      style: "font-size: 28px; margin-right: 8px;",
      y_align: Clutter.ActorAlign.CENTER,
    });

    // Title label
    let titleLabel = new St.Label({
      text: "Gnome Speech2Text Settings",
      style: "font-size: 20px; font-weight: bold; color: white;",
      x_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
    });

    // Close button (X)
    let closeButton = new St.Button({
      label: "×",
      style: `
        color: #666;
        font-size: 24px;
        padding: 8px;
        border-radius: 4px;
        transition: all 0.2s ease;
      `,
      reactive: true,
      can_focus: true,
      track_hover: true,
      y_align: Clutter.ActorAlign.CENTER,
    });

    // Add hover effect to close button
    closeButton.connect("enter-event", () => {
      closeButton.set_style(`
        color: #ff4444;
        font-size: 24px;
        padding: 8px;
        border-radius: 4px;
        transition: all 0.2s ease;
      `);
    });

    closeButton.connect("leave-event", () => {
      closeButton.set_style(`
        color: #666;
        font-size: 24px;
        padding: 8px;
        border-radius: 4px;
        transition: all 0.2s ease;
      `);
    });

    // Add hand cursor effect to close button
    addHandCursorToButton(closeButton);

    closeButton.connect("clicked", () => {
      log("🎯 Close button clicked!");
      this.close();
    });

    headerBox.add_child(titleIcon);
    headerBox.add_child(titleLabel);
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
      text: (() => {
        let shortcuts = this.settings.get_strv("toggle-recording");
        if (shortcuts.length > 0) {
          return shortcuts[0];
        } else {
          return "No shortcut set";
        }
      })(),
      style: (() => {
        let shortcuts = this.settings.get_strv("toggle-recording");
        if (shortcuts.length > 0) {
          return `
            font-size: 14px; 
            color: #ff8c00; 
            background-color: rgba(255, 140, 0, 0.1);
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid #ff8c00;
            min-width: 200px;
          `;
        } else {
          return `
            font-size: 14px; 
            color: #dc3545; 
            background-color: rgba(220, 53, 69, 0.1);
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid #dc3545;
            min-width: 200px;
          `;
        }
      })(),
    });

    currentShortcutBox.add_child(currentShortcutLabel);
    currentShortcutBox.add_child(this.currentShortcutDisplay);

    // Button container for all shortcut-related buttons
    let shortcutButtonsBox = new St.BoxLayout({
      vertical: false,
      style: "spacing: 10px; margin-bottom: 15px;",
    });

    // Change shortcut button
    let changeShortcutButton = createHoverButton(
      "Change Shortcut",
      "#0066cc",
      "#0077ee"
    );

    // Reset to default button
    let resetToDefaultButton = createHoverButton(
      "Reset to Default",
      "#ff8c00",
      "#ff9d1a"
    );

    // Remove shortcut button
    let removeShortcutButton = createHoverButton(
      "Remove Shortcut",
      "#dc3545",
      "#e74c3c"
    );

    // Add buttons to the container
    shortcutButtonsBox.add_child(changeShortcutButton);
    shortcutButtonsBox.add_child(resetToDefaultButton);
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

    // GitHub link
    let githubLink = new St.Button({
      label: "GitHub Repository",
      style: `
        color: #0066cc;
        font-size: 14px;
        padding: 8px;
        border-radius: 4px;
        transition: all 0.2s ease;
      `,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    // Add hover effect to GitHub link
    githubLink.connect("enter-event", () => {
      githubLink.set_style(`
        color: #0077ee;
        font-size: 14px;
        padding: 8px;
        border-radius: 4px;
        transition: all 0.2s ease;
        text-decoration: underline;
      `);
    });

    githubLink.connect("leave-event", () => {
      githubLink.set_style(`
        color: #0066cc;
        font-size: 14px;
        padding: 8px;
        border-radius: 4px;
        transition: all 0.2s ease;
      `);
    });

    // Add hand cursor effect to GitHub link
    addHandCursorToButton(githubLink);

    // Open GitHub link when clicked
    githubLink.connect("clicked", () => {
      Gio.app_info_launch_default_for_uri(
        "https://github.com/kavehtehrani/gnome-speech2text/",
        global.create_app_launch_context(0, -1)
      );
    });

    aboutSection.add_child(aboutLabel);
    aboutSection.add_child(aboutText);
    aboutSection.add_child(githubLink);

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
    resetToDefaultButton.connect("clicked", () => {
      // Remove existing keybinding
      try {
        Main.wm.removeKeybinding("toggle-recording");
      } catch (e) {
        // Ignore errors
      }

      let defaultShortcut = "<Control><Shift><Alt>c";

      // Update settings
      this.settings.set_strv("toggle-recording", [defaultShortcut]);

      // Update current keybinding
      this.currentKeybinding = defaultShortcut;

      // Re-register keybinding using centralized method
      this.setupKeybinding();

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

    // Set up keyboard shortcut using Main.wm.addKeybinding
    try {
      Main.wm.addKeybinding(
        "toggle-recording",
        this.settings,
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL,
        () => {
          log(`🎹 KEYBOARD SHORTCUT TRIGGERED`);

          // Debug: Show focus state when keyboard shortcut is used
          try {
            let currentFocus = global.stage.get_key_focus();
            log(
              `🔍 SHORTCUT FOCUS DEBUG - Stage focus when shortcut triggered: ${
                currentFocus ? currentFocus.toString() : "NULL"
              }`
            );

            let [success, stdout] = GLib.spawn_command_line_sync(
              "xdotool getactivewindow"
            );
            if (success && stdout) {
              let windowId = new TextDecoder().decode(stdout).trim();
              log(`🔍 SHORTCUT FOCUS DEBUG - Active X11 window: ${windowId}`);
            }
          } catch (e) {
            log(`🔍 SHORTCUT FOCUS DEBUG - Error: ${e}`);
          }

          this.toggleRecording();
        }
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
      log("🎯 startRecording() called - creating recording dialog");

      let [success, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
        null,
        [`${this.path}/venv/bin/python3`, `${this.path}/whisper_typing.py`],
        null,
        GLib.SpawnFlags.DO_NOT_REAP_CHILD,
        null
      );

      if (success) {
        this.recordingProcess = pid;
        log(`🎯 Process started with PID: ${pid}`);

        // Show recording dialog immediately
        log("🎯 Creating RecordingDialog instance");
        this.recordingDialog = new RecordingDialog(
          () => {
            log("🎯 Stop callback triggered");
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
            log("🎯 Cancel callback triggered");
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

        log(
          `🎯 RecordingDialog created: ${
            this.recordingDialog ? "SUCCESS" : "FAILED"
          }`
        );

        if (this.recordingDialog) {
          log("🎯 Attempting to open RecordingDialog");
          this.recordingDialog.open();
          log("🎯 RecordingDialog.open() called");
        } else {
          log("⚠️ RecordingDialog is null - cannot open");
        }

        // Set up stdout reading to monitor process
        let stdoutStream = new Gio.DataInputStream({
          base_stream: new Gio.UnixInputStream({ fd: stdout }),
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
                  readOutput();
                }
              } catch (e) {
                log(`Error reading stdout: ${e}`);
              }
            }
          );
        };

        // Start monitoring output
        readOutput();

        // Watch for process completion
        GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, () => {
          this.recordingProcess = null;
          if (this.recordingDialog) {
            this.recordingDialog.close();
            this.recordingDialog = null;
          }
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
    Main.wm.removeKeybinding("toggle-recording");

    if (button) {
      button.destroy();
      button = null;
    }
  }

  // Consolidated toggle recording method
  toggleRecording() {
    log(`=== TOGGLE RECORDING DEBUG START ===`);
    log(`this.recordingProcess = ${this.recordingProcess}`);
    log(`this.recordingDialog = ${this.recordingDialog ? "EXISTS" : "NULL"}`);
    log(`Icon style = ${this.icon.get_style()}`);

    let condition1 = this.recordingProcess;
    let condition2 = this.recordingDialog;
    let overallCondition = condition1 || condition2;

    log(`Condition 1 (recordingProcess): ${condition1 ? "TRUE" : "FALSE"}`);
    log(`Condition 2 (recordingDialog): ${condition2 ? "TRUE" : "FALSE"}`);
    log(
      `Overall condition (process OR dialog): ${
        overallCondition ? "TRUE" : "FALSE"
      }`
    );

    if (this.recordingProcess || this.recordingDialog) {
      log(`>>> TAKING STOP PATH <<<`);
      // If recording or dialog is open, stop it (with transcription)
      if (this.recordingDialog) {
        log(`Closing recordingDialog`);
        this.recordingDialog.close();
        this.recordingDialog = null;
        log(`recordingDialog set to null`);
      } else {
        log(`No recordingDialog to close`);
      }

      if (this.recordingProcess) {
        log(`Killing recordingProcess: ${this.recordingProcess}`);
        try {
          // Use USR1 for gentle stop with transcription
          GLib.spawn_command_line_sync(`kill -USR1 ${this.recordingProcess}`);
          log(`Kill signal sent successfully`);
        } catch (e) {
          log(`Error sending stop signal: ${e}`);
        }
        this.recordingProcess = null;
        log(`recordingProcess set to null`);
      } else {
        log(`No recordingProcess to kill`);
      }

      this.icon.set_style("");
      log(`Icon style reset`);
    } else {
      log(`>>> TAKING START PATH <<<`);
      // If not recording, start it
      this.icon.set_style("color: #ff8c00;");
      log(`Icon style set to orange`);
      log(`About to call startRecording()`);
      this.startRecording();
      log(`startRecording() call completed`);
    }
    log(`=== TOGGLE RECORDING DEBUG END ===`);
  }
}

function init(metadata) {
  return new WhisperTypingExtension(metadata);
}
