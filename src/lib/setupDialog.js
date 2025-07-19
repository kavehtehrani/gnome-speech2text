import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { COLORS, STYLES } from "./constants.js";
import {
  createHoverButton,
  createVerticalBox,
  createHorizontalBox,
} from "./uiUtils.js";
import { cleanupModal } from "./resourceUtils.js";

export class ServiceSetupDialog {
  constructor(errorMessage) {
    this.errorMessage = errorMessage;
    this.overlay = null;
    this._buildDialog();
  }

  _buildDialog() {
    // Create modal overlay
    this.overlay = new Clutter.Actor({
      reactive: true,
      can_focus: true,
    });
    this.overlay.set_background_color(
      Clutter.Color.from_string("rgba(0,0,0,0.8)")[1]
    );

    // Main dialog container
    this.dialogContainer = new St.BoxLayout({
      style: `
        background-color: ${COLORS.SURFACE};
        border: 2px solid ${COLORS.PRIMARY};
        border-radius: 15px;
        padding: 30px;
        min-width: 600px;
        max-width: 700px;
      `,
      vertical: true,
      x_align: Clutter.ActorAlign.CENTER,
      y_align: Clutter.ActorAlign.CENTER,
    });

    // Header
    const headerBox = createHorizontalBox();

    const headerIcon = new St.Label({
      text: "⚠️",
      style: "font-size: 36px; margin-right: 15px;",
    });

    const headerText = new St.Label({
      text: "Service Installation Required",
      style: `
        font-size: 24px;
        font-weight: bold;
        color: ${COLORS.PRIMARY};
      `,
    });

    headerBox.add_child(headerIcon);
    headerBox.add_child(headerText);

    // Error message
    const errorLabel = new St.Label({
      text: `Service Status: ${this.errorMessage}`,
      style: `
        font-size: 14px;
        color: ${COLORS.DANGER};
        margin: 10px 0;
        padding: 10px;
        background-color: rgba(255, 0, 0, 0.1);
        border-radius: 5px;
      `,
    });

    // Main explanation
    const explanationText = new St.Label({
      text: `GNOME Speech2Text requires a background service for speech processing.
This service needs to be installed separately from the extension.`,
      style: `
        font-size: 16px;
        color: ${COLORS.WHITE};
        margin: 15px 0;
        line-height: 1.5;
      `,
    });

    // Installation instructions
    const instructionsTitle = new St.Label({
      text: "Installation Instructions:",
      style: `
        font-size: 18px;
        font-weight: bold;
        color: ${COLORS.PRIMARY};
        margin: 20px 0 10px 0;
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

    const dependenciesBox = new St.Entry({
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
        width: 600px;
      `,
      can_focus: true,
      editable: false,
    });

    const step3 = new St.Label({
      text: "3. Download and install the service:",
      style: `font-size: 14px; color: ${COLORS.WHITE}; margin: 5px 0;`,
    });

    const installCommandBox = new St.Entry({
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
        width: 600px;
      `,
      can_focus: true,
      editable: false,
    });

    const step4 = new St.Label({
      text: "4. Restart GNOME Shell (Alt+F2, type 'r', press Enter) or log out and back in",
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

    const repoLinkBox = new St.Entry({
      text: "https://github.com/kavehtehrani/gnome-speech2text",
      style: `
        background-color: ${COLORS.DARK_GRAY};
        border: 1px solid ${COLORS.INFO};
        border-radius: 5px;
        color: ${COLORS.INFO};
        font-size: 12px;
        padding: 10px;
        margin: 5px 0 10px 20px;
        width: 400px;
      `,
      can_focus: true,
      editable: false,
    });

    // Action buttons
    const buttonBox = createHorizontalBox();
    buttonBox.set_x_align(Clutter.ActorAlign.CENTER);

    const copyDepsButton = createHoverButton(
      "Copy Dependencies Command",
      COLORS.INFO,
      "#0077ee"
    );

    const copyInstallButton = createHoverButton(
      "Copy Install Command",
      COLORS.SUCCESS,
      "#34ce57"
    );

    const closeButton = createHoverButton(
      "Close",
      COLORS.SECONDARY,
      COLORS.DARK_GRAY
    );

    // Button actions
    copyDepsButton.connect("clicked", () => {
      this._copyToClipboard(
        "sudo apt install python3 python3-pip python3-venv ffmpeg xdotool xclip"
      );
      Main.notify("Speech2Text", "Dependencies command copied to clipboard!");
    });

    copyInstallButton.connect("clicked", () => {
      this._copyToClipboard(
        "wget -qO- https://raw.githubusercontent.com/kavehtehrani/gnome-speech2text/main/speech2text-service/install.sh | bash"
      );
      Main.notify("Speech2Text", "Install command copied to clipboard!");
    });

    closeButton.connect("clicked", () => {
      this.close();
    });

    buttonBox.add_child(copyDepsButton);
    buttonBox.add_child(copyInstallButton);
    buttonBox.add_child(closeButton);

    // Assemble dialog
    this.dialogContainer.add_child(headerBox);
    this.dialogContainer.add_child(errorLabel);
    this.dialogContainer.add_child(explanationText);
    this.dialogContainer.add_child(instructionsTitle);
    this.dialogContainer.add_child(step1);
    this.dialogContainer.add_child(step2);
    this.dialogContainer.add_child(dependenciesBox);
    this.dialogContainer.add_child(step3);
    this.dialogContainer.add_child(installCommandBox);
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
