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

// Import modularized utilities
import { COLORS, STYLES } from "./lib/constants.js";
import { debugFocusState, establishX11FocusContext } from "./lib/focusUtils.js";
import {
  createHoverButton,
  createTextButton,
  createStyledLabel,
  createVerticalBox,
  createHorizontalBox,
  createSeparator,
} from "./lib/uiUtils.js";
import {
  safeDisconnect,
  cleanupModal,
  cleanupProcess,
  cleanupRecordingState,
} from "./lib/resourceUtils.js";
import { RecordingDialog } from "./lib/recordingDialog.js";
import { runSetupScript, checkSetupStatus } from "./lib/setupUtils.js";

let button;

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

  _showSetupDialog(message) {
    // Use GNOME Shell's notification system instead of St.Modal
    Main.notify("Speech2Text Setup", message);
    log(`Speech2Text: ${message}`);
  }

  _runSetupInTerminal() {
    // Launch a terminal window to run the setup script so user can see progress
    const setupScript = `${this.path}/scripts/setup_env.sh`;

    // Try different terminal emulators in order of preference
    const terminals = [
      "gnome-terminal",
      "konsole",
      "xfce4-terminal",
      "mate-terminal",
      "xterm",
    ];

    let terminalCmd = null;

    // Find an available terminal
    for (let terminal of terminals) {
      try {
        let [success] = GLib.spawn_command_line_sync(`which ${terminal}`);
        if (success) {
          terminalCmd = terminal;
          break;
        }
      } catch (e) {
        // Continue to next terminal
      }
    }

    if (!terminalCmd) {
      Main.notify(
        "Speech2Text Error",
        "No terminal emulator found. Please install gnome-terminal or similar."
      );
      return false;
    }

    try {
      // Create a wrapper script that shows completion message
      const wrapperScript = `#!/bin/bash
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              GNOME Speech2Text Extension Setup            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "🎯 ATTENTION: This terminal opened because the Speech2Text extension"
echo "   needs to install its Python environment and dependencies."
echo ""
echo "📦 What will be installed:"
echo "   • Python virtual environment"
echo "   • OpenAI Whisper (speech recognition)"
echo "   • Required Python packages"
echo ""
echo "⏱️  This process will take 2-5 minutes depending on your internet speed."
echo "💾 Installation size: ~200-500MB"
echo ""
echo "Please read the prompts below and follow the instructions."
echo "════════════════════════════════════════════════════════════"
echo ""

cd "${this.path}"
bash "${setupScript}" --interactive
exit_code=$?

echo ""
echo "════════════════════════════════════════════════════════════"
if [ $exit_code -eq 0 ]; then
    echo "🎉 Setup completed successfully!"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Close this terminal"
    echo "   2. Reload GNOME Shell: Press Alt+F2, type 'r', press Enter"
    echo "   3. The Speech2Text extension will now be ready to use!"
    echo ""
    echo "🎤 Usage:"
    echo "   • Click the microphone icon in the top panel"
    echo "   • Or use the keyboard shortcut Ctrl+Shift+Alt+C"
else
    echo "❌ Setup failed with exit code $exit_code"
    echo ""
    echo "Please check the error messages above and try again."
    echo "If the problem persists, please report it on GitHub."
fi
echo ""
echo "Press Enter to close this terminal..."
read
`;

      // Write wrapper script to temp file
      const tempScript = `${GLib.get_tmp_dir()}/speech2text-setup.sh`;
      const file = Gio.File.new_for_path(tempScript);
      const outputStream = file.replace(
        null,
        false,
        Gio.FileCreateFlags.NONE,
        null
      );
      outputStream.write(wrapperScript, null);
      outputStream.close(null);

      // Make script executable
      GLib.spawn_command_line_sync(`chmod +x "${tempScript}"`);

      // Launch terminal with the wrapper script
      let terminalArgs;
      if (terminalCmd === "gnome-terminal") {
        terminalArgs = [
          terminalCmd,
          "--title=Speech2Text Setup",
          "--",
          "bash",
          tempScript,
        ];
      } else if (terminalCmd === "konsole") {
        terminalArgs = [
          terminalCmd,
          "--title",
          "Speech2Text Setup",
          "-e",
          "bash",
          tempScript,
        ];
      } else if (terminalCmd === "xfce4-terminal") {
        terminalArgs = [
          terminalCmd,
          "--title=Speech2Text Setup",
          "-e",
          `bash ${tempScript}`,
        ];
      } else if (terminalCmd === "mate-terminal") {
        terminalArgs = [
          terminalCmd,
          "--title=Speech2Text Setup",
          "-e",
          `bash ${tempScript}`,
        ];
      } else {
        // xterm or fallback
        terminalArgs = [
          terminalCmd,
          "-title",
          "Speech2Text Setup",
          "-e",
          "bash",
          tempScript,
        ];
      }

      let [success, pid] = GLib.spawn_async(
        null, // working directory
        terminalArgs,
        null, // envp
        GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
        null // child_setup
      );

      if (success) {
        Main.notify(
          "Speech2Text",
          "Setup is running in the terminal window. Please check the terminal for prompts."
        );

        // Try to focus the terminal window after a short delay
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
          try {
            // Find and focus the setup terminal window
            let [findSuccess, findStdout] = GLib.spawn_command_line_sync(
              'xdotool search --name "Speech2Text Setup" 2>/dev/null || true'
            );
            if (findSuccess && findStdout) {
              let windowId = new TextDecoder().decode(findStdout).trim();
              if (windowId) {
                GLib.spawn_command_line_sync(
                  `xdotool windowactivate ${windowId} 2>/dev/null || true`
                );
                GLib.spawn_command_line_sync(
                  `xdotool windowraise ${windowId} 2>/dev/null || true`
                );
                log(`Focused setup terminal window: ${windowId}`);
              }
            }
          } catch (e) {
            log(`Could not focus terminal window: ${e}`);
          }
          return false; // Don't repeat
        });

        // Clean up temp script when process completes
        GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, (pid, status) => {
          try {
            GLib.unlink(tempScript);
          } catch (e) {
            // Ignore cleanup errors
          }
          GLib.spawn_close_pid(pid);
        });

        return true;
      } else {
        throw new Error("Failed to launch terminal");
      }
    } catch (e) {
      log(`Error launching terminal setup: ${e}`);
      Main.notify(
        "Speech2Text Error",
        `Failed to launch terminal setup: ${e.message}`
      );
      return false;
    }
  }

  enable() {
    const setup = checkSetupStatus(this.path);
    if (setup.needsSetup) {
      this._showSetupDialog(setup.message);
      if (this._runSetupInTerminal()) {
        // Setup is running in terminal, extension will need to be reloaded after completion
        return;
      } else {
        this._showSetupDialog(
          "Failed to launch terminal setup. Please try reinstalling the extension."
        );
        return;
      }
    }

    this.settings = this.getSettings();
    this.recordingProcess = null;
    this.recordingDialog = null;

    // Create button with microphone icon
    const button = new PanelMenu.Button(0.0, "Speech2Text");

    // Make button referenceable by this object
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

    // Override the default menu behavior to prevent left-click menu interference
    // Store the original vfunc_event method
    const originalEvent = button.vfunc_event;

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
      const buttonPressed = event.get_button();
      log(`🖱️ BUTTON CLICK TRIGGERED`);

      if (buttonPressed === 1) {
        // Left click - start recording immediately AND prevent menu from opening
        log("🖱️ Left click detected - starting recording synchronously");

        // CRITICAL: Prevent the menu from opening on left click
        // This was causing the focus issues!
        button.menu.close(true); // Force close menu if it's trying to open

        // Debug: Show current focus state before starting recording
        const focusInfo = debugFocusState();

        if (!focusInfo.hasActiveWindow) {
          // Try to establish X11 context before proceeding
          if (establishX11FocusContext(() => this.toggleRecording())) {
            return Clutter.EVENT_STOP; // Callback will handle the recording
          }
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
    const shortcuts = this.settings.get_strv("toggle-recording");
    const shortcut = shortcuts.length > 0 ? shortcuts[0] : null;

    this.shortcutLabel.label.text = shortcut
      ? `Shortcut: ${shortcut}`
      : "Shortcut: None";
  }

  showSettingsWindow() {
    // Create settings window
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

    // Header box for icon, title, and close button
    let headerBox = new St.BoxLayout({
      vertical: false,
      style: "spacing: 16px; margin-bottom: 18px; align-items: center;",
      x_align: Clutter.ActorAlign.FILL,
      y_align: Clutter.ActorAlign.CENTER,
    });

    // Icon
    let titleIcon = createStyledLabel("🎤", "icon", "");
    titleIcon.set_y_align(Clutter.ActorAlign.CENTER);

    // Title label
    let titleLabel = createStyledLabel("Gnome Speech2Text Settings", "title");
    titleLabel.set_x_expand(true);
    titleLabel.set_y_align(Clutter.ActorAlign.CENTER);

    // Close button (X)
    let closeButton = createTextButton("×", COLORS.SECONDARY, COLORS.DANGER, {
      fontSize: "24px",
      buttonProps: { y_align: Clutter.ActorAlign.CENTER },
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

    // Current shortcut display and edit
    let currentShortcutBox = createHorizontalBox();

    let currentShortcutLabel = createStyledLabel(
      "Current:",
      "normal",
      "min-width: 80px;"
    );

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
            color: ${COLORS.PRIMARY}; 
            background-color: rgba(255, 140, 0, 0.1);
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid ${COLORS.PRIMARY};
            min-width: 200px;
          `;
        } else {
          return `
            font-size: 14px; 
            color: ${COLORS.WARNING}; 
            background-color: rgba(220, 53, 69, 0.1);
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid ${COLORS.WARNING};
            min-width: 200px;
          `;
        }
      })(),
    });

    currentShortcutBox.add_child(currentShortcutLabel);
    currentShortcutBox.add_child(this.currentShortcutDisplay);

    // Button container for all shortcut-related buttons
    let shortcutButtonsBox = createHorizontalBox("8px");

    // Change shortcut button
    let changeShortcutButton = createHoverButton(
      "Change Shortcut",
      COLORS.INFO,
      "#0077ee"
    );

    // Reset to default button
    let resetToDefaultButton = createHoverButton(
      "Reset to Default",
      COLORS.PRIMARY,
      "#ff9d1a"
    );

    // Remove shortcut button
    let removeShortcutButton = createHoverButton(
      "Remove Shortcut",
      COLORS.WARNING,
      "#e74c3c"
    );

    // Add buttons to the container
    shortcutButtonsBox.add_child(changeShortcutButton);
    shortcutButtonsBox.add_child(resetToDefaultButton);
    shortcutButtonsBox.add_child(removeShortcutButton);

    // Instructions
    let instructionsLabel = createStyledLabel(
      "Click 'Change Shortcut' and then press the key combination you want to use.\nPress Escape to cancel the change.",
      "small",
      "margin-bottom: 12px;"
    );

    shortcutSection.add_child(shortcutLabel);
    shortcutSection.add_child(shortcutDescription);
    shortcutSection.add_child(currentShortcutBox);
    shortcutSection.add_child(shortcutButtonsBox);
    shortcutSection.add_child(instructionsLabel);

    // Recording Duration section
    let durationSection = createVerticalBox();

    let durationLabel = createStyledLabel("Recording Duration", "subtitle");

    let durationDescription = createStyledLabel(
      "Maximum recording time before auto-stop (10 seconds to 5 minutes)",
      "description"
    );

    // Current duration display and controls
    let currentDurationBox = createHorizontalBox();

    let currentDurationLabel = createStyledLabel(
      "Current:",
      "normal",
      "min-width: 80px;"
    );

    // Get current duration from settings
    const currentDuration = this.settings.get_int("recording-duration");
    const formatDuration = (seconds) => {
      if (seconds >= 60) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        if (remainingSeconds === 0) {
          return `${minutes} minute${minutes > 1 ? "s" : ""}`;
        } else {
          return `${minutes}m ${remainingSeconds}s`;
        }
      } else {
        return `${seconds} second${seconds > 1 ? "s" : ""}`;
      }
    };

    this.currentDurationDisplay = createStyledLabel(
      formatDuration(currentDuration),
      "normal",
      `
        font-size: 14px; 
        color: #ff8c00; 
        background-color: rgba(255, 140, 0, 0.1);
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid #ff8c00;
        min-width: 120px;
        text-align: center;
      `
    );

    currentDurationBox.add_child(currentDurationLabel);
    currentDurationBox.add_child(this.currentDurationDisplay);

    // Duration control buttons
    let durationButtonsBox = createHorizontalBox("10px");

    // Decrease duration button
    let decreaseDurationButton = createTextButton(
      "-10s",
      COLORS.SECONDARY,
      COLORS.WARNING,
      { fontSize: "13px" }
    );

    // Increase duration button
    let increaseDurationButton = createTextButton(
      "+10s",
      COLORS.SECONDARY,
      COLORS.SUCCESS,
      { fontSize: "13px" }
    );

    // Reset to default button
    let resetDurationButton = createTextButton(
      "Reset (1 min)",
      COLORS.SECONDARY,
      COLORS.INFO,
      { fontSize: "13px" }
    );

    durationButtonsBox.add_child(decreaseDurationButton);
    durationButtonsBox.add_child(increaseDurationButton);
    durationButtonsBox.add_child(resetDurationButton);

    // Button handlers
    decreaseDurationButton.connect("clicked", () => {
      let currentDur = this.settings.get_int("recording-duration");
      let newDur = Math.max(10, currentDur - 10); // Minimum 10 seconds
      this.settings.set_int("recording-duration", newDur);
      this.currentDurationDisplay.set_text(formatDuration(newDur));
      Main.notify(
        "Speech2Text",
        `Recording duration set to ${formatDuration(newDur)}`
      );
    });

    increaseDurationButton.connect("clicked", () => {
      let currentDur = this.settings.get_int("recording-duration");
      let newDur = Math.min(300, currentDur + 10); // Maximum 5 minutes
      this.settings.set_int("recording-duration", newDur);
      this.currentDurationDisplay.set_text(formatDuration(newDur));
      Main.notify(
        "Speech2Text",
        `Recording duration set to ${formatDuration(newDur)}`
      );
    });

    resetDurationButton.connect("clicked", () => {
      this.settings.set_int("recording-duration", 60); // Reset to 1 minute
      this.currentDurationDisplay.set_text(formatDuration(60));
      Main.notify("Speech2Text", "Recording duration reset to 1 minute");
    });

    durationSection.add_child(durationLabel);
    durationSection.add_child(durationDescription);
    durationSection.add_child(currentDurationBox);
    durationSection.add_child(durationButtonsBox);

    // Separator line
    let separator = createSeparator();

    // Clipboard section
    let clipboardSection = createVerticalBox();

    let clipboardLabel = createStyledLabel("Clipboard Options", "subtitle");

    let clipboardDescription = createStyledLabel(
      "Configure whether transcribed text should be copied to clipboard",
      "description"
    );

    // Clipboard checkbox
    let clipboardCheckboxBox = createHorizontalBox();

    let clipboardCheckboxLabel = createStyledLabel(
      "Copy to clipboard:",
      "normal",
      "min-width: 130px;"
    );

    // Create checkbox using St.Button with custom styling
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

    // Add checkmark icon if enabled
    this.clipboardCheckboxIcon = new St.Label({
      text: isClipboardEnabled ? "✓" : "",
      style: `
        color: white;
        font-size: 14px;
        font-weight: bold;
        text-align: center;
      `,
    });

    this.clipboardCheckbox.add_child(this.clipboardCheckboxIcon);

    // Checkbox click handler
    this.clipboardCheckbox.connect("clicked", () => {
      let currentState = this.settings.get_boolean("copy-to-clipboard");
      let newState = !currentState;

      // Update settings
      this.settings.set_boolean("copy-to-clipboard", newState);

      // Update visual state
      this.clipboardCheckbox.set_style(`
        width: 20px;
        height: 20px;
        border-radius: 3px;
        border: 2px solid ${COLORS.SECONDARY};
        background-color: ${newState ? COLORS.PRIMARY : "transparent"};
        margin-right: 10px;
      `);

      this.clipboardCheckboxIcon.set_text(newState ? "✓" : "");

      // Show notification
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

    // Another separator line
    let clipboardSeparator = createSeparator();

    // Troubleshooting section
    let troubleshootingSection = createVerticalBox();

    let troubleshootingLabel = createStyledLabel("Troubleshooting", "subtitle");

    let troubleshootingDescription = createStyledLabel(
      "If the extension is not working properly, try reinstalling the Python environment:",
      "description"
    );

    // Install/Reinstall Python Environment button
    let installPythonButton = createHoverButton(
      "Install/Reinstall Python Environment",
      COLORS.SUCCESS,
      "#34ce57"
    );

    installPythonButton.connect("clicked", () => {
      // Close settings window first
      closeSettings();

      // Show notification
      Main.notify(
        "Speech2Text",
        "Opening terminal to install Python environment..."
      );

      // Run setup in terminal
      if (!this._runSetupInTerminal()) {
        Main.notify(
          "Speech2Text Error",
          "Failed to launch terminal setup. Please check the logs."
        );
      }
    });

    troubleshootingSection.add_child(troubleshootingLabel);
    troubleshootingSection.add_child(troubleshootingDescription);
    troubleshootingSection.add_child(installPythonButton);

    // Another separator line
    let troubleshootingSeparator = createSeparator();

    // Third separator line
    let aboutSeparator = createSeparator();

    // About section
    let aboutSection = createVerticalBox();

    let aboutLabel = createStyledLabel("About", "subtitle");

    let aboutText = createStyledLabel(
      "Speech2Text extension for GNOME Shell\nUses OpenAI Whisper for speech-to-text transcription",
      "description"
    );

    // GitHub link
    let githubLink = createTextButton(
      "GitHub Repository",
      COLORS.INFO,
      "#0077ee",
      {
        hoverExtraStyle: "text-decoration: underline;",
      }
    );

    // Open GitHub link when clicked
    githubLink.connect("clicked", () => {
      // Close the settings window first
      closeSettings();

      // Then open the GitHub link
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
    settingsWindow.add_child(durationSection);
    settingsWindow.add_child(clipboardSeparator);
    settingsWindow.add_child(clipboardSection);
    settingsWindow.add_child(troubleshootingSeparator);
    settingsWindow.add_child(troubleshootingSection);
    settingsWindow.add_child(aboutSeparator);
    settingsWindow.add_child(aboutSection);

    // Create modal overlay
    let overlay = new St.Widget({
      style: `background-color: ${COLORS.TRANSPARENT_BLACK_70};`,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    overlay.add_child(settingsWindow);

    // Get proper screen dimensions
    let monitor = Main.layoutManager.primaryMonitor;
    overlay.set_size(monitor.width, monitor.height);
    overlay.set_position(monitor.x, monitor.y);

    // Center the settings window dynamically
    // Use a small delay to ensure the window has been sized properly
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
      let [windowWidth, windowHeight] = settingsWindow.get_size();

      // Fallback to estimated size if get_size() returns 0
      if (windowWidth === 0) windowWidth = 450;
      if (windowHeight === 0)
        windowHeight = Math.min(monitor.height * 0.8, 600);

      settingsWindow.set_position(
        (monitor.width - windowWidth) / 2,
        (monitor.height - windowHeight) / 2
      );

      return false; // Don't repeat
    });

    Main.layoutManager.addTopChrome(overlay);

    // Store handler IDs so we can disconnect them during shortcut capture
    let clickHandlerId = null;
    let keyPressHandlerId = null;

    // Function to close settings window
    const closeSettings = () => {
      cleanupModal(overlay, { clickHandlerId, keyPressHandlerId });
      // Reset handler IDs
      clickHandlerId = null;
      keyPressHandlerId = null;
    };

    // Close button handler
    closeButton.connect("clicked", closeSettings);

    // Click outside to close - but make sure to block all background clicks
    clickHandlerId = overlay.connect("button-press-event", (actor, event) => {
      // Block all background clicks but don't close the window
      return Clutter.EVENT_STOP;
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
      Main.notify("Speech2Text", "Shortcut reset to default: Ctrl+Shift+Alt+C");
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
        Main.notify("Speech2Text", "Keyboard shortcut removed");
      } catch (e) {
        log(`Error removing keybinding: ${e}`);
        Main.notify("Speech2Text", "Error removing keyboard shortcut");
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
    safeDisconnect(overlay, clickHandlerId, "settings click handler");
    safeDisconnect(overlay, keyPressHandlerId, "settings key handler");

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
      let settingsWindowRef = overlay.get_first_child();

      // Reconnect original click handler
      clickHandlerId = overlay.connect("button-press-event", (actor, event) => {
        let [x, y] = event.get_coords();
        let [windowX, windowY] = settingsWindowRef.get_position();
        let [windowW, windowH] = settingsWindowRef.get_size();

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
      if (safeDisconnect(button, saveButtonClickId, "save button handler")) {
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
      if (safeDisconnect(button, saveButtonClickId, "save button handler")) {
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
        safeDisconnect(overlay, captureId, "keyboard capture handler");
        restoreHandlers();

        // Show confirmation notification
        Main.notify("Speech2Text", `Shortcut changed to: ${lastKeyCombo}`);
      } else {
        // No valid shortcut was captured
        Main.notify(
          "Speech2Text",
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
        safeDisconnect(overlay, captureId, "keyboard capture handler");
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
          debugFocusState("SHORTCUT");

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

      // Get recording duration from settings
      const recordingDuration = this.settings.get_int("recording-duration");

      // Get clipboard setting
      const copyToClipboard = this.settings.get_boolean("copy-to-clipboard");

      // Build command arguments
      let args = [
        `${this.path}/venv/bin/python3`,
        `${this.path}/whisper_typing.py`,
        `--duration`,
        `${recordingDuration}`,
      ];

      // Add clipboard flag if enabled
      if (copyToClipboard) {
        args.push("--copy-to-clipboard");
      }

      const [success, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
        null,
        args,
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
            cleanupRecordingState(this);
          },
          () => {
            log("🎯 Cancel callback triggered");
            // Cancel callback - forcibly terminate process without transcription
            if (this.recordingProcess) {
              cleanupProcess(
                this.recordingProcess,
                "TERM",
                "recording process (cancelled)"
              );
              this.recordingProcess = null;
            }
            this.recordingDialog = null;
            this.icon?.set_style("");
          },
          recordingDuration // Pass the maximum duration to the dialog
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
        const stdoutStream = new Gio.DataInputStream({
          base_stream: new Gio.UnixInputStream({ fd: stdout }),
        });

        // Function to read lines from stdout
        const readOutput = () => {
          stdoutStream.read_line_async(
            GLib.PRIORITY_DEFAULT,
            null,
            (stream, result) => {
              try {
                const [line] = stream.read_line_finish(result);
                if (line) {
                  const lineStr = new TextDecoder().decode(line);
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
          cleanupRecordingState(this);
          log("Whisper process completed");
        });
      }
    } catch (e) {
      log(`Error starting recording: ${e}`);
      cleanupRecordingState(this);
    }
  }

  disable() {
    // Clean up recording state
    cleanupRecordingState(this);

    // Remove keybinding
    try {
      Main.wm.removeKeybinding("toggle-recording");
      log("Keybinding removed");
    } catch (e) {
      log(`Error removing keybinding: ${e}`);
    }

    // Clean up button
    if (button) {
      button.destroy();
      button = null;
      log("Extension button destroyed");
    }
  }

  // Consolidated toggle recording method
  toggleRecording() {
    log(`=== TOGGLE RECORDING DEBUG START ===`);

    // Check if Python environment is set up before proceeding
    const setup = checkSetupStatus(this.path);
    if (setup.needsSetup) {
      log(`Python environment not found - launching setup`);
      Main.notify("Speech2Text", "Python environment missing. Setting up...");

      if (this._runSetupInTerminal()) {
        Main.notify(
          "Speech2Text",
          "Please complete the setup in the terminal, then try again."
        );
      } else {
        Main.notify("Speech2Text Error", "Failed to launch setup terminal.");
      }
      return;
    }

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
      let cleanup = cleanupRecordingState(this);
      log(
        `Cleanup results: dialog=${cleanup.cleanedDialog}, process=${cleanup.cleanedProcess}`
      );
    } else {
      log(`>>> TAKING START PATH <<<`);
      // If not recording, start it
      this.icon.set_style(`color: ${COLORS.PRIMARY};`);
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
