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
import {
  createCenteredBox,
  createHeaderLayout,
  createCloseButton,
} from "./buttonUtils.js";
import { cleanupModal } from "./resourceUtils.js";

export class ServiceSetupDialog {
  constructor(extension, errorMessage) {
    this.extension = extension;
    this.errorMessage = errorMessage;
    this.isManualRequest = errorMessage === "Manual setup guide requested";
    this.overlay = null;
    this.centerTimeoutId = null;
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
        padding: 24px;
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
      this.isManualRequest ? "📚" : "⚠️",
      "icon",
      "font-size: 36px;"
    );
    const headerText = createStyledLabel(
      this.isManualRequest
        ? "GNOME Speech2Text Setup Guide"
        : "Service Installation Required",
      "title",
      `color: ${this.isManualRequest ? COLORS.INFO : COLORS.PRIMARY};`
    );

    titleContainer.add_child(headerIcon);
    titleContainer.add_child(headerText);

    // Create top-right close button
    this.closeButton = createCloseButton(32);
    const headerBox = createHeaderLayout(titleContainer, this.closeButton);

    // Status message
    const statusLabel = new St.Label({
      text: this.isManualRequest
        ? "Complete setup instructions and troubleshooting guide"
        : `Service Status: ${this.errorMessage}`,
      style: `
        font-size: 14px;
        color: ${this.isManualRequest ? COLORS.INFO : COLORS.DANGER};
        margin: 10px 0;
        padding: 10px;
        background-color: ${
          this.isManualRequest
            ? "rgba(23, 162, 184, 0.1)"
            : "rgba(255, 0, 0, 0.1)"
        };
        border-radius: 5px;
      `,
    });

    // Main explanation
    const explanationText = new St.Label({
      text: this.isManualRequest
        ? `Instructions for installing and troubleshooting the Speech2Text service.
Use this if you need to reinstall the d-bus service.`
        : `GNOME Speech2Text requires a background service for speech processing.
This service is installed separately from the extension (following GNOME guidelines).`,
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
      text: this.isManualRequest
        ? "Even if the service is already installed, you can reinstall."
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

    // Use the button as the install section
    const autoInstallSection = autoInstallButtonWidget;

    // Link to manual instructions on GitHub
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
      text: "For manual instructions, visit the GitHub repository:",
      style: `font-size: 14px; color: ${COLORS.WHITE}; margin: 5px 0;`,
    });

    const repoLinkBox = new St.Button({
      label: "https://github.com/kavehtehrani/gnome-speech2text",
      style: `
        background-color: ${COLORS.LIGHT_GRAY};
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
    // Keep only the GitHub link for manual instructions
    this.dialogContainer.add_child(manualTitle);
    this.dialogContainer.add_child(manualText);
    this.dialogContainer.add_child(repoLinkBox);
    this.dialogContainer.add_child(buttonBox);

    this.overlay.add_child(this.dialogContainer);

    // Close button handler
    this.closeButton.connect("clicked", () => this.close());

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
      // Use D-Bus portal API for opening URLs safely
      const portal = Gio.DBusProxy.new_sync(
        Gio.DBus.session,
        Gio.DBusProxyFlags.NONE,
        null,
        "org.freedesktop.portal.Desktop",
        "/org/freedesktop/portal/desktop",
        "org.freedesktop.portal.OpenURI",
        null
      );

      portal.call_sync(
        "OpenURI",
        new GLib.Variant("(ssa{sv})", ["", url, {}]),
        Gio.DBusCallFlags.NONE,
        -1,
        null
      );

      Main.notify("Speech2Text", "Opening GitHub repository in browser...");
    } catch (e) {
      console.error(`Error opening URL via portal: ${e}`);
      try {
        // Fallback to xdg-open if portal fails
        Gio.app_info_launch_default_for_uri(url, null);
        Main.notify("Speech2Text", "Opening GitHub repository in browser...");
      } catch (fallbackError) {
        console.error(`Error opening URL: ${fallbackError}`);
        Main.notify(
          "Speech2Text Error",
          "Failed to open browser. URL copied to clipboard."
        );
        this._copyToClipboard(url);
      }
    }
  }

  _runAutomaticInstall() {
    try {
      const workingDir = GLib.get_home_dir();
      const scriptPath = `${this.extension.path}/install-service.sh`;
      const command = `bash -c "'${scriptPath}' --pypi --non-interactive; echo; echo 'Press Enter to close...'; read"`;

      // Detect available terminal emulator
      const terminal = this._detectTerminal();

      if (terminal) {
        try {
          const terminalArgs = this._getTerminalArgs(
            terminal,
            workingDir,
            command
          );
          Gio.Subprocess.new(
            [terminal, ...terminalArgs],
            Gio.SubprocessFlags.NONE
          );

          Main.notify(
            "Speech2Text",
            "🔧 Opening service installation in terminal..."
          );
          this.close();
        } catch (terminalError) {
          console.error(`Could not open ${terminal}: ${terminalError}`);
          this._fallbackToClipboard(scriptPath);
        }
      } else {
        console.error("No terminal emulator found");
        Main.notify(
          "Speech2Text Error",
          "No terminal emulator found. Please install a terminal like gnome-terminal, ptyxis, terminator, or xterm."
        );
        this._fallbackToClipboard(scriptPath);
      }
    } catch (e) {
      console.error(`Error running automatic install: ${e}`);
      Main.notify(
        "Speech2Text Error",
        "Automatic installation failed. Please use manual method."
      );
    }
  }

  _detectTerminal() {
    // Non-blocking detection using PATH lookup to avoid freezing GNOME Shell
    const terminals = [
      "ptyxis", // Fedora GNOME default
      "gnome-terminal", // Traditional GNOME terminal
      "terminator", // Popular alternative
      "xterm", // Universal fallback
    ];

    for (const terminal of terminals) {
      try {
        const foundPath = GLib.find_program_in_path(terminal);
        if (foundPath && foundPath.length > 0) {
          console.log(`Found terminal: ${terminal} at ${foundPath}`);
          return terminal;
        }
      } catch (_e) {
        // Ignore and continue
      }
    }

    return null;
  }

  _getTerminalArgs(terminal, workingDir, command) {
    // Return appropriate arguments for each terminal type
    switch (terminal) {
      case "ptyxis":
        return ["--working-directory", workingDir, "--", "bash", "-c", command];
      case "gnome-terminal":
        return [
          `--working-directory=${workingDir}`,
          "--",
          "bash",
          "-c",
          command,
        ];
      case "terminator":
        return ["--working-directory", workingDir, "-e", "bash", "-c", command];
      case "xterm":
        return ["-e", "bash", "-c", `cd "${workingDir}" && ${command}`];
      default:
        // Generic fallback
        return ["-e", "bash", "-c", `cd "${workingDir}" && ${command}`];
    }
  }

  _fallbackToClipboard(scriptPath) {
    // Copy the local installation command to clipboard
    // Note: --pypi installs the companion service package from PyPI.
    // If you are developing from a git clone, use --local instead.
    const localInstallCmd = `bash "${scriptPath}" --pypi --non-interactive`;
    this._copyToClipboard(localInstallCmd);

    Main.notify(
      "Speech2Text",
      "Could not open terminal. Installation command copied to clipboard - please open a terminal manually and paste the command."
    );

    // Show additional help dialog
    this._showTerminalHelpDialog();
  }

  _showTerminalHelpDialog() {
    const helpText = `No supported terminal emulator was found on your system.

To install the Speech2Text service, you need to:

1. Open a terminal manually (Ctrl+Alt+T or search for "Terminal" in your applications)
2. Paste the command that was copied to your clipboard
3. Press Enter and follow the installation instructions

Common ways to open a terminal:
• Press Ctrl+Alt+T (works on most Linux distributions)
• Search for "Terminal" in your application menu
• Right-click on desktop and select "Open Terminal" (if available)
• Use Alt+F2, type "gnome-terminal" and press Enter

Supported terminal emulators:
• ptyxis (Fedora GNOME default)
• gnome-terminal (traditional GNOME terminal)
• terminator (popular alternative)
• xterm (universal fallback)

If you're still having trouble, you can also:
• Visit the GitHub repository for manual instructions
• Install one of the supported terminal emulators`;

    const helpDialog = new St.Modal({
      style: `
        background-color: rgba(20, 20, 20, 0.95);
        border-radius: 12px;
        padding: 24px;
        min-width: 500px;
        max-width: 600px;
        border: ${STYLES.DIALOG_BORDER};
      `,
    });

    const helpContainer = new St.BoxLayout({
      vertical: true,
      style: "spacing: 15px;",
    });

    // Header
    const headerBox = new St.BoxLayout({
      style: "spacing: 10px;",
    });
    const headerIcon = createStyledLabel("💻", "icon", "font-size: 24px;");
    const headerText = createStyledLabel(
      "Terminal Not Found",
      "title",
      `color: ${COLORS.WARNING};`
    );
    headerBox.add_child(headerIcon);
    headerBox.add_child(headerText);

    // Help text
    const helpLabel = new St.Label({
      text: helpText,
      style: `
        font-size: 14px;
        color: ${COLORS.WHITE};
        line-height: 1.4;
      `,
    });

    // Close button
    const closeButton = createHoverButton("Got it!", COLORS.PRIMARY, "#ff8c00");
    closeButton.connect("clicked", () => {
      helpDialog.close();
    });

    helpContainer.add_child(headerBox);
    helpContainer.add_child(helpLabel);
    helpContainer.add_child(closeButton);

    helpDialog.set_content(helpContainer);
    helpDialog.open();
  }

  show() {
    if (!this.overlay) return;

    Main.layoutManager.addTopChrome(this.overlay);

    const monitor = Main.layoutManager.primaryMonitor;
    this.overlay.set_position(monitor.x, monitor.y);
    this.overlay.set_size(monitor.width, monitor.height);

    // Center the dialog
    if (this.centerTimeoutId) {
      GLib.Source.remove(this.centerTimeoutId);
    }
    this.centerTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
      let [dialogWidth, dialogHeight] = this.dialogContainer.get_size();
      if (dialogWidth === 0) dialogWidth = 700;
      if (dialogHeight === 0) dialogHeight = 500;

      // Use integer coordinates in overlay parent space to avoid subpixel blur
      const centerX = Math.round((monitor.width - dialogWidth) / 2);
      const centerY = Math.round((monitor.height - dialogHeight) / 2);
      this.dialogContainer.set_position(centerX, centerY);
      this.centerTimeoutId = null;
      return false;
    });

    this.overlay.grab_key_focus();
    this.overlay.set_reactive(true);
  }

  close() {
    // Clean up timeout sources
    if (this.centerTimeoutId) {
      GLib.Source.remove(this.centerTimeoutId);
      this.centerTimeoutId = null;
    }

    if (this.overlay) {
      cleanupModal(this.overlay, {
        keyPressHandler: this.keyPressHandler,
        clickHandler: this.clickHandler,
      });
      this.overlay = null;
    }
  }
}
