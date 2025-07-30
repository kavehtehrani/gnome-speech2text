import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { COLORS, STYLES } from "./constants.js";
import {
  createHoverButton,
  createVerticalBox,
  createHorizontalBox,
  createStyledLabel,
} from "./uiUtils.js";
import { createCenteredBox, createHeaderLayout } from "./buttonUtils.js";
import { cleanupModal } from "./resourceUtils.js";

export class ServiceSetupDialog {
  constructor(errorMessage, isFirstRun = false) {
    this.errorMessage = errorMessage;
    this.isFirstRun = isFirstRun;
    this.isManualRequest = errorMessage === "Manual setup guide requested";
    this.overlay = null;
    this._buildDialog();
  }

  _buildDialog() {
    // Create modal overlay
    this.overlay = new St.Widget({
      style: "background-color: rgba(0,0,0,0.8);",
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    // Main dialog container (matching settings dialog styling exactly)
    this.dialogContainer = new St.BoxLayout({
      style_class: "setup-dialog-window",
      vertical: true,
      style: `
        background-color: rgba(20, 20, 20, 0.95);
        border-radius: 12px;
        padding: 25px;
        min-width: 600px;
        max-width: 700px;
        border: ${STYLES.DIALOG_BORDER};
      `,
      x_align: Clutter.ActorAlign.CENTER,
      y_align: Clutter.ActorAlign.CENTER,
    });

    // Header with close button (matching settings dialog pattern)
    let titleContainer = createCenteredBox(false, "15px");
    titleContainer.set_x_align(Clutter.ActorAlign.START);
    titleContainer.set_x_expand(true);

    const headerIcon = createStyledLabel(
      this.isFirstRun ? "🎉" : this.isManualRequest ? "📚" : "⚠️",
      "icon",
      "font-size: 36px;"
    );
    const headerText = createStyledLabel(
      this.isFirstRun
        ? "Welcome to GNOME Speech2Text!"
        : this.isManualRequest
        ? "GNOME Speech2Text Setup Guide"
        : "Service Installation Required (Initial Setup)",
      "title",
      `color: ${
        this.isFirstRun
          ? COLORS.SUCCESS
          : this.isManualRequest
          ? COLORS.INFO
          : COLORS.PRIMARY
      };`
    );

    titleContainer.add_child(headerIcon);
    titleContainer.add_child(headerText);

    const headerBox = createHeaderLayout(titleContainer);

    // Status message
    const statusLabel = new St.Label({
      text: this.isFirstRun
        ? "Let's set up speech-to-text functionality for you!"
        : this.isManualRequest
        ? "Complete setup instructions and troubleshooting guide"
        : `Service Status: ${this.errorMessage}`,
      style: `
        font-size: 14px;
        color: ${
          this.isFirstRun
            ? COLORS.SUCCESS
            : this.isManualRequest
            ? COLORS.INFO
            : COLORS.DANGER
        };
        margin: 10px 0;
        padding: 10px;
        background-color: ${
          this.isFirstRun
            ? "rgba(40, 167, 69, 0.1)"
            : this.isManualRequest
            ? "rgba(23, 162, 184, 0.1)"
            : "rgba(255, 0, 0, 0.1)"
        };
        border-radius: 5px;
      `,
    });

    // Main explanation
    const explanationText = new St.Label({
      text: this.isFirstRun
        ? `To enable speech-to-text functionality, we need to install a background service.
This is a one-time setup that handles audio recording and speech processing.`
        : this.isManualRequest
        ? `Instructions for installing and troubleshooting the Speech2Text service.
Use this if you need to reinstall the service or help someone else set it up.`
        : `GNOME Speech2Text requires a background service for speech processing.
This service needs to be installed separately from the extension.`,
      style: `
        font-size: 16px;
        color: ${COLORS.WHITE};
        margin: 15px 0;
        line-height: 1.5;
      `,
    });

    // Automatic installation option
    const autoInstallTitle = new St.Label({
      text: "Automatic Installation (Recommended):",
      style: `
        font-size: 18px;
        font-weight: bold;
        color: ${COLORS.SUCCESS};
        margin: 20px 0 10px 0;
      `,
    });

    const autoInstallDescription = new St.Label({
      text: this.isFirstRun
        ? "The easiest way is to use automatic installation - just one click!"
        : this.isManualRequest
        ? "Even if the service is already installed, you can reinstall or help others:"
        : "Click the button below to automatically install the service in a terminal:",
      style: `font-size: 14px; color: ${COLORS.WHITE}; margin: 5px 0 15px 0;`,
    });

    const autoInstallButtonWidget = createHoverButton(
      this.isManualRequest
        ? "🔧 Reinstall Service"
        : "🚀 Automatic Installation",
      COLORS.SUCCESS,
      "#28a745"
    );

    autoInstallButtonWidget.connect("clicked", () => {
      this._runAutomaticInstall();
    });

    // Create container for auto install section
    let autoInstallSection;
    if (this.isFirstRun) {
      // For first-run, add extra encouragement
      const firstRunNote = new St.Label({
        text: "💡 Tip: The automatic installation is the easiest option for new users!",
        style: `
          font-size: 13px;
          color: ${COLORS.WARNING};
          margin: 5px 0;
          padding: 8px;
          background-color: rgba(255, 193, 7, 0.1);
          border-radius: 5px;
          border-left: 3px solid ${COLORS.WARNING};
        `,
      });

      autoInstallSection = createVerticalBox();
      autoInstallSection.add_child(autoInstallButtonWidget);
      autoInstallSection.add_child(firstRunNote);
    } else {
      autoInstallSection = autoInstallButtonWidget;
    }

    // Manual installation separator
    const separatorLine = new St.Label({
      text: "─".repeat(50),
      style: `
        color: ${COLORS.SECONDARY};
        font-size: 12px;
        margin: 20px 0;
        text-align: center;
      `,
    });

    const orLabel = new St.Label({
      text: "OR install manually:",
      style: `
        font-size: 16px;
        color: ${COLORS.SECONDARY};
        margin: 10px 0;
        text-align: center;
      `,
    });

    // Installation instructions
    const instructionsTitle = new St.Label({
      text: "Manual Installation Instructions:",
      style: `
        font-size: 18px;
        font-weight: bold;
        color: ${COLORS.PRIMARY};
        margin: 10px 0 10px 0;
      `,
    });

    const step1 = new St.Label({
      text: "1. Open a terminal",
      style: `font-size: 14px; color: ${COLORS.WHITE}; margin: 5px 0;`,
    });

    const step2 = new St.Label({
      text: "2. Install system dependencies:",
      style: `font-size: 14px; color: ${COLORS.WHITE}; margin: 5px 0;`,
    });

    const dependenciesBox = new St.Label({
      text: "sudo apt install python3 python3-pip python3-venv ffmpeg xdotool xclip",
      style: `
        background-color: ${COLORS.DARK_GRAY};
        border: 1px solid ${COLORS.SECONDARY};
        border-radius: 5px;
        color: ${COLORS.WHITE};
        font-family: monospace;
        font-size: 12px;
        padding: 10px;
        margin: 5px 0 10px 20px;
        width: 500px;
      `,
    });

    // Copy button for dependencies command
    const copyDepsInlineButton = new St.Button({
      label: "📋 Copy",
      style: `
        background-color: ${COLORS.INFO};
        border: 1px solid ${COLORS.INFO};
        border-radius: 5px;
        color: ${COLORS.WHITE};
        font-size: 11px;
        padding: 8px 12px;
        margin: 5px 0 10px 10px;
        min-width: 70px;
        transition-duration: 150ms;
      `,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    // Add hover effects with inline styles preserved
    copyDepsInlineButton.connect("enter-event", () => {
      copyDepsInlineButton.set_style(`
        background-color: #0077ee;
        border: 1px solid #0077ee;
        border-radius: 5px;
        color: ${COLORS.WHITE};
        font-size: 11px;
        padding: 8px 12px;
        margin: 5px 0 10px 10px;
        min-width: 70px;
        transition-duration: 150ms;
        transform: scale(1.05);
      `);
    });

    copyDepsInlineButton.connect("leave-event", () => {
      copyDepsInlineButton.set_style(`
        background-color: ${COLORS.INFO};
        border: 1px solid ${COLORS.INFO};
        border-radius: 5px;
        color: ${COLORS.WHITE};
        font-size: 11px;
        padding: 8px 12px;
        margin: 5px 0 10px 10px;
        min-width: 70px;
        transition-duration: 150ms;
      `);
    });

    copyDepsInlineButton.connect("clicked", () => {
      this._copyToClipboard(
        "sudo apt install python3 python3-pip python3-venv ffmpeg xdotool xclip"
      );
      Main.notify("Speech2Text", "Dependencies command copied to clipboard!");
    });

    // Container for dependencies command + copy button
    const dependenciesContainer = createHorizontalBox();
    dependenciesContainer.add_child(dependenciesBox);
    dependenciesContainer.add_child(copyDepsInlineButton);

    const step3 = new St.Label({
      text: "3. Download and install the service:",
      style: `font-size: 14px; color: ${COLORS.WHITE}; margin: 5px 0;`,
    });

    const installCommandBox = new St.Label({
      text: "wget -qO- https://raw.githubusercontent.com/kavehtehrani/gnome-speech2text/main/speech2text-service/install.sh | bash",
      style: `
        background-color: ${COLORS.DARK_GRAY};
        border: 1px solid ${COLORS.SECONDARY};
        border-radius: 5px;
        color: ${COLORS.WHITE};
        font-family: monospace;
        font-size: 12px;
        padding: 10px;
        margin: 5px 0 10px 20px;
        width: 500px;
      `,
    });

    // Copy button for install command
    const copyInstallInlineButton = new St.Button({
      label: "📋 Copy",
      style: `
        background-color: ${COLORS.SUCCESS};
        border: 1px solid ${COLORS.SUCCESS};
        border-radius: 5px;
        color: ${COLORS.WHITE};
        font-size: 11px;
        padding: 8px 12px;
        margin: 5px 0 10px 10px;
        min-width: 70px;
        transition-duration: 150ms;
      `,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    // Add hover effects with inline styles preserved
    copyInstallInlineButton.connect("enter-event", () => {
      copyInstallInlineButton.set_style(`
        background-color: #34ce57;
        border: 1px solid #34ce57;
        border-radius: 5px;
        color: ${COLORS.WHITE};
        font-size: 11px;
        padding: 8px 12px;
        margin: 5px 0 10px 10px;
        min-width: 70px;
        transition-duration: 150ms;
        transform: scale(1.05);
      `);
    });

    copyInstallInlineButton.connect("leave-event", () => {
      copyInstallInlineButton.set_style(`
        background-color: ${COLORS.SUCCESS};
        border: 1px solid ${COLORS.SUCCESS};
        border-radius: 5px;
        color: ${COLORS.WHITE};
        font-size: 11px;
        padding: 8px 12px;
        margin: 5px 0 10px 10px;
        min-width: 70px;
        transition-duration: 150ms;
      `);
    });

    copyInstallInlineButton.connect("clicked", () => {
      this._copyToClipboard(
        "wget -qO- https://raw.githubusercontent.com/kavehtehrani/gnome-speech2text/main/speech2text-service/install.sh | bash"
      );
      Main.notify("Speech2Text", "Install command copied to clipboard!");
    });

    // Container for install command + copy button
    const installContainer = createHorizontalBox();
    installContainer.add_child(installCommandBox);
    installContainer.add_child(copyInstallInlineButton);

    const step4 = new St.Label({
      text: "4. Restart GNOME Shell:\n   • X11: Press Alt+F2, type 'r', press Enter\n   • Wayland: Log out and log back in",
      style: `font-size: 14px; color: ${COLORS.WHITE}; margin: 5px 0;`,
    });

    // Alternative manual installation
    const manualTitle = new St.Label({
      text: "Manual Installation:",
      style: `
        font-size: 16px;
        font-weight: bold;
        color: ${COLORS.INFO};
        margin: 20px 0 10px 0;
      `,
    });

    const manualText = new St.Label({
      text: "For detailed instructions, visit the GitHub repository:",
      style: `font-size: 14px; color: ${COLORS.WHITE}; margin: 5px 0;`,
    });

    const repoLinkBox = new St.Button({
      label: "https://github.com/kavehtehrani/gnome-speech2text",
      style: `
        background-color: ${COLORS.DARK_GRAY};
        border: 1px solid ${COLORS.INFO};
        border-radius: 5px;
        color: ${COLORS.INFO};
        font-size: 12px;
        padding: 10px;
        margin: 5px 0 10px 20px;
        width: 400px;
        text-decoration: underline;
      `,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    repoLinkBox.connect("clicked", () => {
      this._openUrl("https://github.com/kavehtehrani/gnome-speech2text");
    });

    repoLinkBox.connect("enter-event", () => {
      repoLinkBox.set_style(`
        background-color: ${COLORS.INFO};
        border: 1px solid ${COLORS.INFO};
        border-radius: 5px;
        color: ${COLORS.WHITE};
        font-size: 12px;
        padding: 10px;
        margin: 5px 0 10px 20px;
        width: 400px;
        text-decoration: underline;
      `);
    });

    repoLinkBox.connect("leave-event", () => {
      repoLinkBox.set_style(`
        background-color: ${COLORS.DARK_GRAY};
        border: 1px solid ${COLORS.INFO};
        border-radius: 5px;
        color: ${COLORS.INFO};
        font-size: 12px;
        padding: 10px;
        margin: 5px 0 10px 20px;
        width: 400px;
        text-decoration: underline;
      `);
    });

    // Action buttons
    const buttonBox = createHorizontalBox();
    buttonBox.set_x_align(Clutter.ActorAlign.CENTER);

    // Assemble dialog
    this.dialogContainer.add_child(headerBox);
    this.dialogContainer.add_child(statusLabel);
    this.dialogContainer.add_child(explanationText);
    this.dialogContainer.add_child(autoInstallTitle);
    this.dialogContainer.add_child(autoInstallDescription);
    this.dialogContainer.add_child(autoInstallSection);
    this.dialogContainer.add_child(separatorLine);
    this.dialogContainer.add_child(orLabel);
    this.dialogContainer.add_child(instructionsTitle);
    this.dialogContainer.add_child(step1);
    this.dialogContainer.add_child(step2);
    this.dialogContainer.add_child(dependenciesContainer);
    this.dialogContainer.add_child(step3);
    this.dialogContainer.add_child(installContainer);
    this.dialogContainer.add_child(step4);
    this.dialogContainer.add_child(manualTitle);
    this.dialogContainer.add_child(manualText);
    this.dialogContainer.add_child(repoLinkBox);
    this.dialogContainer.add_child(buttonBox);

    this.overlay.add_child(this.dialogContainer);

    // Keyboard handling
    this.keyPressHandler = this.overlay.connect(
      "key-press-event",
      (actor, event) => {
        const keyval = event.get_key_symbol();
        if (keyval === Clutter.KEY_Escape) {
          this.close();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      }
    );

    // Click outside to close
    this.clickHandler = this.overlay.connect(
      "button-press-event",
      (actor, event) => {
        if (event.get_source() === this.overlay) {
          this.close();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      }
    );
  }

  _copyToClipboard(text) {
    try {
      const clipboard = St.Clipboard.get_default();
      clipboard.set_text(St.ClipboardType.CLIPBOARD, text);
      return true;
    } catch (e) {
      console.error(`Error copying to clipboard: ${e}`);
      return false;
    }
  }

  _openUrl(url) {
    try {
      GLib.spawn_command_line_async(`xdg-open ${url}`);
      Main.notify("Speech2Text", "Opening GitHub repository in browser...");
    } catch (e) {
      console.error(`Error opening URL: ${e}`);
      Main.notify(
        "Speech2Text Error",
        "Failed to open browser. URL copied to clipboard."
      );
      this._copyToClipboard(url);
    }
  }

  _runAutomaticInstall() {
    try {
      // Get the path to the install.sh script
      const extensionDir = `${GLib.get_home_dir()}/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page`;
      const installScriptPath = `${extensionDir}/speech2text-service/install.sh`;

      // Check if install.sh exists
      const installScript = Gio.File.new_for_path(installScriptPath);
      if (!installScript.query_exists(null)) {
        Main.notify(
          "Speech2Text Error",
          "Install script not found. Please ensure the extension is properly installed."
        );
        return;
      }

      // Try different terminal emulators to run the install.sh directly
      const terminalCommands = [
        `gnome-terminal --working-directory="${extensionDir}/speech2text-service" -- bash -c "./install.sh; echo; echo 'Press Enter to close...'; read"`,
        `xterm -e "cd '${extensionDir}/speech2text-service' && ./install.sh && echo && echo 'Press Enter to close...' && read"`,
        `konsole --workdir "${extensionDir}/speech2text-service" -e bash -c "./install.sh; echo; echo 'Press Enter to close...'; read"`,
        `terminator --working-directory="${extensionDir}/speech2text-service" -e "bash -c './install.sh; echo; echo Press Enter to close...; read'"`,
        `x-terminal-emulator -e bash -c "cd '${extensionDir}/speech2text-service' && ./install.sh && echo && echo 'Press Enter to close...' && read"`,
      ];

      let terminalOpened = false;
      for (const cmd of terminalCommands) {
        try {
          GLib.spawn_command_line_async(cmd);
          terminalOpened = true;
          break;
        } catch (e) {
          // Try next terminal emulator
          continue;
        }
      }

      if (terminalOpened) {
        Main.notify(
          "Speech2Text",
          this.isFirstRun
            ? "🚀 Setting up Speech2Text for you! Follow the terminal instructions."
            : this.isManualRequest
            ? "🔧 Opening service installation guide in terminal..."
            : "Opening service installation in terminal..."
        );
        this.close();
      } else {
        Main.notify(
          "Speech2Text Error",
          "Could not open terminal. Please use manual installation."
        );
      }
    } catch (e) {
      console.error(`Error running automatic install: ${e}`);
      Main.notify(
        "Speech2Text Error",
        "Automatic installation failed. Please use manual method."
      );
    }
  }

  show() {
    if (!this.overlay) return;

    Main.layoutManager.addTopChrome(this.overlay);

    const monitor = Main.layoutManager.primaryMonitor;
    this.overlay.set_position(monitor.x, monitor.y);
    this.overlay.set_size(monitor.width, monitor.height);

    // Center the dialog
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
      let [dialogWidth, dialogHeight] = this.dialogContainer.get_size();
      if (dialogWidth === 0) dialogWidth = 700;
      if (dialogHeight === 0) dialogHeight = 500;

      this.dialogContainer.set_position(
        (monitor.width - dialogWidth) / 2,
        (monitor.height - dialogHeight) / 2
      );
      return false;
    });

    this.overlay.grab_key_focus();
    this.overlay.set_reactive(true);
  }

  close() {
    if (this.overlay) {
      cleanupModal(this.overlay, {
        keyPressHandler: this.keyPressHandler,
        clickHandler: this.clickHandler,
      });
      this.overlay = null;
    }
  }
}
