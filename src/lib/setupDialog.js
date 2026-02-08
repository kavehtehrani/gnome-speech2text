import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { COLORS, STYLES } from "./constants.js";
import { createHorizontalBox, createStyledLabel } from "./uiUtils.js";
import {
  createCenteredBox,
  createHeaderLayout,
  createCloseButton,
} from "./buttonUtils.js";
import {
  log,
  readInstalledServiceConfig,
  showModalDialog,
  closeModalDialog,
  setupModalEventHandlers,
} from "./resourceUtils.js";

export class ServiceSetupDialog {
  constructor(extension, errorMessage) {
    this.extension = extension;
    this.errorMessage = errorMessage;
    this.overlay = null;
    this.centerTimeoutId = null;

    // Installed service environment state (from installer marker file).
    this._installedModel = null;
    this._installedDevice = null;
    this._installedAt = null;
    this._installStateKnown = false;

    // UI refs
    this.statusLabel = null;

    this._buildDialog();
  }

  _refreshStatusLabel() {
    const installed = readInstalledServiceConfig();
    this._installStateKnown = installed.known;
    this._installedModel = installed.model;
    this._installedDevice = installed.device;
    this._installedAt = installed.installedAt;

    if (!this.statusLabel) return;

    if (this._installStateKnown) {
      this.statusLabel.set_text(this._getInstalledConfigText());
      this.statusLabel.set_style(`
        font-size: 14px;
        color: ${COLORS.INFO};
        margin: 10px 0;
        padding: 10px;
        background-color: rgba(23, 162, 184, 0.1);
        border-radius: 5px;
      `);
    } else {
      this.statusLabel.set_text(
        `Service Status: ${this.errorMessage || "Service not installed"}`
      );
      this.statusLabel.set_style(`
        font-size: 14px;
        color: ${COLORS.DANGER};
        margin: 10px 0;
        padding: 10px;
        background-color: rgba(255, 0, 0, 0.1);
        border-radius: 5px;
      `);
    }
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

    const headerIcon = createStyledLabel("⚠️", "icon", "font-size: 36px;");
    const headerText = createStyledLabel(
      "Speech2Text Service Setup",
      "title",
      `color: ${COLORS.PRIMARY};`
    );

    titleContainer.add_child(headerIcon);
    titleContainer.add_child(headerText);

    // Create top-right close button
    this.closeButton = createCloseButton(32);
    const headerBox = createHeaderLayout(titleContainer, this.closeButton);

    // Status message (installed state)
    this.statusLabel = new St.Label({
      text: "",
      style: "",
    });
    this._refreshStatusLabel();

    // Main explanation
    const explanation = `Speech2Text requires a background service for speech processing.
This service is installed separately from the extension (following GNOME guidelines).
Installation instructions are maintained in the project repository.`;
    const explanationText = new St.Label({
      text: explanation,
      style: `
        font-size: 16px;
        color: ${COLORS.WHITE};
        margin: 15px 0;
        line-height: 1.5;
      `,
    });

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
      text: "For installation instructions, visit the GitHub repository:",
      style: `font-size: 14px; color: ${COLORS.WHITE}; margin: 5px 0;`,
    });

    const repoLink = new St.Button({
      label: "https://github.com/kavehtehrani/speech2text-extension",
      style: `
        background-color: transparent;
        border: none;
        color: ${COLORS.INFO};
        font-size: 14px;
        padding: 0;
        margin: 5px 0 10px 0;
        text-decoration: underline;
      `,
      x_align: Clutter.ActorAlign.START,
    });

    repoLink.connect("clicked", () => {
      this._openUrl("https://github.com/kavehtehrani/speech2text-extension");
    });

    // Action buttons
    const buttonBox = createHorizontalBox();
    buttonBox.set_x_align(Clutter.ActorAlign.CENTER);

    // Assemble dialog
    this.dialogContainer.add_child(headerBox);
    this.dialogContainer.add_child(this.statusLabel);
    this.dialogContainer.add_child(explanationText);
    this.dialogContainer.add_child(manualTitle);
    this.dialogContainer.add_child(manualText);
    this.dialogContainer.add_child(repoLink);
    this.dialogContainer.add_child(buttonBox);

    this.overlay.add_child(this.dialogContainer);

    // Close button handler
    this.closeButton.connect("clicked", () => this.close());

    // Set up standard modal event handlers (Escape key + click outside to close)
    const handlers = setupModalEventHandlers(this.overlay, () => this.close());
    this.keyPressHandler = handlers.keyPressHandler;
    this.clickHandler = handlers.clickHandler;
  }

  _getInstalledConfigText() {
    if (!this._installStateKnown)
      return "Installed service environment: not installed (or unknown)";
    const at = this._installedAt ? `, installed_at=${this._installedAt}` : "";
    return `Installed service environment: model=${
      this._installedModel || "unknown"
    }, device=${this._installedDevice || "unknown"}${at}`;
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

      log.debug("Opening GitHub repository in browser...");
    } catch (e) {
      console.error(`Error opening URL via portal: ${e}`);
      try {
        // Fallback to xdg-open if portal fails
        Gio.app_info_launch_default_for_uri(url, null);
      } catch (fallbackError) {
        console.error(`Error opening URL: ${fallbackError}`);
        this._copyToClipboard(url);
      }
    }
  }

  show() {
    if (!this.overlay) return;
    this._refreshStatusLabel();

    // Clear any existing centering timeout
    if (this.centerTimeoutId) {
      GLib.Source.remove(this.centerTimeoutId);
    }
    // showModalDialog returns a timeout ID for widget centering
    this.centerTimeoutId = showModalDialog(this.overlay, this.dialogContainer, {
      fallbackWidth: 700,
      fallbackHeight: 500,
      onComplete: () => (this.centerTimeoutId = null),
    });
  }

  close() {
    closeModalDialog(
      this.overlay,
      {
        keyPressHandler: this.keyPressHandler,
        clickHandler: this.clickHandler,
      },
      this.centerTimeoutId
    );
    this.centerTimeoutId = null;
    this.overlay = null;
  }
}
