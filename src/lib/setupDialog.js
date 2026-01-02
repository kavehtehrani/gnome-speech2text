import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { COLORS, STYLES, createAccentDisplayStyle } from "./constants.js";
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
  createIncrementButton,
} from "./buttonUtils.js";
import { cleanupModal, centerWidgetOnMonitor, log } from "./resourceUtils.js";

export class ServiceSetupDialog {
  constructor(extension, errorMessage) {
    this.extension = extension;
    this.errorMessage = errorMessage;
    this.overlay = null;
    this.centerTimeoutId = null;

    // Setup-time Whisper config (defaults: base + cpu)
    this._whisperModels = [
      "tiny",
      "tiny.en",
      "base",
      "base.en",
      "small",
      "small.en",
      "medium",
      "medium.en",
      "large",
      "large-v2",
      "large-v3",
    ];
    this._whisperDevices = ["cpu", "gpu"];
    this._selectedModel = "base";
    this._selectedDevice = "cpu";
    this._installedModel = null;
    this._installedDevice = null;
    this._installedAt = null;
    this._installStateKnown = false;

    // UI refs
    this.modelValueLabel = null;
    this.deviceValueLabel = null;
    this.modelPrevButton = null;
    this.modelNextButton = null;
    this.devicePrevButton = null;
    this.deviceNextButton = null;
    this.installedConfigLabel = null;
    this.selectedConfigLabel = null;
    this.commandLabel = null;
    this.copyButton = null;

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

    const headerIcon = createStyledLabel("⚠️", "icon", "font-size: 36px;");
    const headerText = createStyledLabel(
      "GNOME Speech2Text Service Setup",
      "title",
      `color: ${COLORS.PRIMARY};`
    );

    titleContainer.add_child(headerIcon);
    titleContainer.add_child(headerText);

    // Create top-right close button
    this.closeButton = createCloseButton(32);
    const headerBox = createHeaderLayout(titleContainer, this.closeButton);

    // Initialize selection from settings early,
    // so we can show the current selection in the dialog text.
    this._initWhisperSelection();

    // Status message
    const statusText = (() => {
      let text = `Current configuration: ${
        this._selectedModel
      } on ${this._selectedDevice.toUpperCase()}`;
      // Add installation timestamp if service is installed
      if (this._installStateKnown && this._installedAt) {
        // Format timestamp for display (e.g., "2024-01-15T10:30:00Z" -> "Jan 15, 2024 10:30")
        try {
          const date = new Date(this._installedAt);
          const formattedDate = date.toLocaleString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          text += ` • Installed: ${formattedDate}`;
        } catch (_e) {
          // If date parsing fails, just show the raw timestamp
          text += ` • Installed: ${this._installedAt}`;
        }
      } else if (!this._installStateKnown) {
        // Service not installed
        text = `Service Status: ${
          this.errorMessage || "Service not installed"
        }`;
      }
      return text;
    })();
    const statusLabel = new St.Label({
      text: statusText,
      style: `
        font-size: 14px;
        color: ${this._installStateKnown ? COLORS.INFO : COLORS.DANGER};
        margin: 10px 0;
        padding: 10px;
        background-color: ${
          this._installStateKnown
            ? "rgba(23, 162, 184, 0.1)"
            : "rgba(255, 0, 0, 0.1)"
        };
        border-radius: 5px;
      `,
    });

    // Main explanation
    const explanation = `GNOME Speech2Text requires a background service for speech processing.
This service is installed separately from the extension (following GNOME guidelines).
Copy the command below and run it in your terminal to install or reinstall the service.`;
    const explanationText = new St.Label({
      text: explanation,
      style: `
        font-size: 16px;
        color: ${COLORS.WHITE};
        margin: 15px 0;
        line-height: 1.5;
      `,
    });

    // Automatic installation option
    const autoInstallTitle = new St.Label({
      text: "Installation Command:",
      style: `
        font-size: 18px;
        font-weight: bold;
        color: ${COLORS.SUCCESS};
        margin: 20px 0 10px 0;
      `,
    });

    const autoInstallDescription = new St.Label({
      text: "Select CPU/GPU and model, then copy and run the command below in your terminal:",
      style: `font-size: 14px; color: ${COLORS.WHITE}; margin: 5px 0 15px 0;`,
    });

    const whisperConfigSection = this._buildWhisperConfigSection();

    // Command display section with copy button
    const commandSection = this._buildCommandSection();

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

    const repoLink = new St.Button({
      label: "https://github.com/kavehtehrani/gnome-speech2text",
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
      this._openUrl("https://github.com/kavehtehrani/gnome-speech2text");
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
    if (whisperConfigSection) {
      this.dialogContainer.add_child(whisperConfigSection);
    }
    if (commandSection) {
      this.dialogContainer.add_child(commandSection);
    }
    // Keep only the GitHub link for manual instructions
    this.dialogContainer.add_child(manualTitle);
    this.dialogContainer.add_child(manualText);
    this.dialogContainer.add_child(repoLink);
    this.dialogContainer.add_child(buttonBox);

    this.overlay.add_child(this.dialogContainer);

    // Initialize command display after dialog is built
    this._initializeCommand();

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

  _initWhisperSelection() {
    // Prefer the *installed* environment state (from installer marker file).
    this._loadInstallState();
    if (this._installStateKnown) {
      if (
        this._installedModel &&
        this._whisperModels.includes(this._installedModel)
      )
        this._selectedModel = this._installedModel;
      if (
        this._installedDevice &&
        this._whisperDevices.includes(this._installedDevice)
      )
        this._selectedDevice = this._installedDevice;
    } else {
      // Fall back to persisted settings (these represent user preference, not necessarily installed state).
      try {
        const s = this.extension?.settings;
        if (s) {
          const m = s.get_string("whisper-model");
          if (m && this._whisperModels.includes(m)) this._selectedModel = m;
          const d = s.get_string("whisper-device");
          if (d && this._whisperDevices.includes(d)) this._selectedDevice = d;
        }
      } catch (_e) {
        // Ignore and fall back to defaults
      }
    }
  }

  _loadInstallState() {
    try {
      const home = GLib.get_home_dir();
      const path = `${home}/.local/share/gnome-speech2text-service/install-state.conf`;
      const file = Gio.File.new_for_path(path);
      if (!file.query_exists(null)) {
        this._installStateKnown = false;
        return;
      }
      const [ok, contents] = file.load_contents(null);
      if (!ok) {
        this._installStateKnown = false;
        return;
      }
      const text = new TextDecoder().decode(contents);
      const lines = text.split("\n");
      const kv = {};
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx <= 0) continue;
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim();
        kv[k] = v;
      }
      this._installedDevice = kv.device || null;
      this._installedModel = kv.model || null;
      this._installedAt = kv.installed_at || null;
      this._installStateKnown = true;
    } catch (_e) {
      this._installStateKnown = false;
    }
  }

  _getInstalledConfigText() {
    if (!this._installStateKnown)
      return "Installed service environment: not installed (or unknown)";
    const at = this._installedAt ? `, installed_at=${this._installedAt}` : "";
    return `Installed service environment: model=${
      this._installedModel || "unknown"
    }, device=${this._installedDevice || "unknown"}${at}`;
  }

  _getSelectedConfigText() {
    return `Selected for (re)install: model=${this._selectedModel}, device=${this._selectedDevice}`;
  }

  _buildWhisperConfigSection() {
    const section = createVerticalBox("6px", "5px", "5px");

    const title = createStyledLabel("Service configuration", "subtitle");
    const desc = createStyledLabel(
      "These settings affect which dependencies are installed into the service environment.",
      "description"
    );

    // Model row
    const modelRow = createHorizontalBox();
    const modelLabel = createStyledLabel(
      "Model:",
      "normal",
      "min-width: 80px;"
    );
    const modelControl = createCenteredBox(false, "8px");
    this.modelPrevButton = createIncrementButton("←", 28);
    this.modelNextButton = createIncrementButton("→", 28);
    this.modelValueLabel = createStyledLabel(
      this._selectedModel,
      "normal",
      createAccentDisplayStyle(COLORS.PRIMARY, "160px")
    );
    modelControl.add_child(this.modelPrevButton);
    modelControl.add_child(this.modelValueLabel);
    modelControl.add_child(this.modelNextButton);
    modelRow.add_child(modelLabel);
    modelRow.add_child(modelControl);

    // Device row
    const deviceRow = createHorizontalBox();
    const deviceLabel = createStyledLabel(
      "Device:",
      "normal",
      "min-width: 80px;"
    );
    const deviceControl = createCenteredBox(false, "8px");
    this.devicePrevButton = createIncrementButton("←", 28);
    this.deviceNextButton = createIncrementButton("→", 28);
    this.deviceValueLabel = createStyledLabel(
      this._selectedDevice,
      "normal",
      createAccentDisplayStyle(
        this._selectedDevice === "gpu" ? COLORS.WARNING : COLORS.SUCCESS,
        "160px"
      )
    );
    deviceControl.add_child(this.devicePrevButton);
    deviceControl.add_child(this.deviceValueLabel);
    deviceControl.add_child(this.deviceNextButton);
    deviceRow.add_child(deviceLabel);
    deviceRow.add_child(deviceControl);

    const note = createStyledLabel(
      "GPU mode typically requires NVIDIA CUDA on Linux. CPU mode avoids installing NVIDIA/CUDA pip packages.",
      "small",
      "margin-top: 4px;"
    );
    const defaultNote = createStyledLabel(
      "Recommended default (most compatible across platforms): model=base, device=cpu.",
      "small",
      "margin-top: 2px;"
    );

    // Wire controls
    const rotate = (arr, current, dir) => {
      const idx = Math.max(0, arr.indexOf(current));
      const nextIdx = (idx + dir + arr.length) % Math.max(1, arr.length);
      return arr[nextIdx] || arr[0];
    };

    this.modelPrevButton.connect("clicked", () => {
      this._selectedModel = rotate(
        this._whisperModels,
        this._selectedModel,
        -1
      );
      this.modelValueLabel?.set_text(this._selectedModel);
      this._updateCommand();
    });
    this.modelNextButton.connect("clicked", () => {
      this._selectedModel = rotate(this._whisperModels, this._selectedModel, 1);
      this.modelValueLabel?.set_text(this._selectedModel);
      this._updateCommand();
    });

    const updateDeviceStyle = () => {
      this.deviceValueLabel?.set_text(this._selectedDevice);
      this.deviceValueLabel?.set_style(
        createAccentDisplayStyle(COLORS.SUCCESS, "160px")
      );
    };

    this.devicePrevButton.connect("clicked", () => {
      this._selectedDevice = rotate(
        this._whisperDevices,
        this._selectedDevice,
        -1
      );
      updateDeviceStyle();
      this._updateCommand();
    });
    this.deviceNextButton.connect("clicked", () => {
      this._selectedDevice = rotate(
        this._whisperDevices,
        this._selectedDevice,
        1
      );
      updateDeviceStyle();
      this._updateCommand();
    });

    section.add_child(title);
    section.add_child(desc);
    section.add_child(modelRow);
    section.add_child(deviceRow);
    section.add_child(note);
    section.add_child(defaultNote);
    return section;
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

  _getExtensionVersion() {
    // Try to get version from metadata
    try {
      if (this.extension?.metadata) {
        // Try version-name first (display version like "1.1")
        let version = this.extension.metadata["version-name"];
        if (!version && this.extension.metadata.version) {
          version = this.extension.metadata.version;
        }

        if (version) {
          return version;
        }
      }
    } catch (_e) {
      // Ignore errors
    }

    // Fallback: try to read from metadata.json file directly
    try {
      const metadataPath = `${this.extension.path}/metadata.json`;
      const file = Gio.File.new_for_path(metadataPath);
      if (file.query_exists(null)) {
        const [ok, contents] = file.load_contents(null);
        if (ok) {
          const text = new TextDecoder().decode(contents);
          const metadata = JSON.parse(text);
          if (metadata["version-name"]) {
            return metadata["version-name"];
          }
          if (metadata.version) {
            return metadata.version;
          }
        }
      }
    } catch (_e) {
      // Ignore errors
    }

    return null;
  }

  _mapExtensionVersionToServiceVersion(extensionVersion) {
    if (!extensionVersion) {
      return "1.1.0"; // Safe default
    }

    // Simple mapping: if version is "1.1", convert to "1.1.0"
    // If it's already "1.1.0", use as-is
    // For more complex cases, we can add a mapping table later

    const versionStr = String(extensionVersion).trim();

    // If it already has 3 parts (major.minor.patch), use as-is
    if (/^\d+\.\d+\.\d+/.test(versionStr)) {
      return versionStr;
    }

    // If it has 2 parts (major.minor), append .0
    if (/^\d+\.\d+/.test(versionStr)) {
      return `${versionStr}.0`;
    }

    // If it's just a number, treat as major version
    if (/^\d+$/.test(versionStr)) {
      return `${versionStr}.0.0`;
    }

    // Fallback to default
    return "1.1.0";
  }

  _generateInstallCommand() {
    // Persist final selection (important for first-time setup)
    try {
      this.extension?.settings?.set_string(
        "whisper-model",
        this._selectedModel
      );
      this.extension?.settings?.set_string(
        "whisper-device",
        this._selectedDevice
      );
    } catch (_e) {
      // Ignore; still proceed to generate command
    }

    // Get extension version and map to service version
    const extensionVersion = this._getExtensionVersion();
    const serviceVersion =
      this._mapExtensionVersionToServiceVersion(extensionVersion);

    // Build the remote installation command
    const baseUrl =
      "https://raw.githubusercontent.com/kavehtehrani/gnome-speech2text/main/src/install-service.sh";
    const flags = [
      "--pypi",
      "--non-interactive",
      `--service-version ${serviceVersion}`,
    ];

    if (this._selectedDevice === "gpu") {
      flags.push("--gpu");
    }

    flags.push(`--whisper-model ${this._selectedModel}`);

    const command = `curl -sSL ${baseUrl} | bash -s -- ${flags.join(" ")}`;

    return command;
  }

  _buildCommandSection() {
    const section = createVerticalBox("8px", "5px", "5px");

    // Command display box with copy button
    const commandBox = new St.BoxLayout({
      style: `
        background-color: rgba(0, 0, 0, 0.5);
        border: 1px solid ${COLORS.LIGHT_GRAY};
        border-radius: 5px;
        padding: 12px;
        spacing: 10px;
      `,
    });

    // Command label (selectable text)
    this.commandLabel = new St.Label({
      text: this._generateInstallCommand(),
      style: `
        font-family: monospace;
        font-size: 13px;
        color: ${COLORS.WHITE};
        selectable: true;
      `,
    });
    // Enable line wrapping
    this.commandLabel.clutter_text.set_line_wrap(true);
    this.commandLabel.clutter_text.set_ellipsize(0); // No ellipsize, use wrapping
    // Set wrap mode to WORD for better word breaking
    this.commandLabel.clutter_text.set_line_wrap_mode(2); // Pango.WrapMode.WORD
    this.commandLabel.set_x_expand(true);
    commandBox.add_child(this.commandLabel);

    // Copy button (icon only)
    this.copyButton = new St.Button({
      style: `
        background-color: ${COLORS.PRIMARY};
        border-radius: 4px;
        padding: 8px;
        min-width: 32px;
        min-height: 32px;
      `,
      reactive: true,
      can_focus: true,
      track_hover: true,
      x_align: Clutter.ActorAlign.CENTER,
      y_align: Clutter.ActorAlign.CENTER,
    });

    const copyIcon = createStyledLabel(
      "📋",
      "icon",
      "font-size: 16px; margin: 0; text-align: center;"
    );
    copyIcon.set_x_align(Clutter.ActorAlign.CENTER);
    copyIcon.set_y_align(Clutter.ActorAlign.CENTER);
    this.copyButton.set_child(copyIcon);

    this.copyButton.connect("clicked", () => {
      const command = this._generateInstallCommand();
      if (this._copyToClipboard(command)) {
        // Show feedback
        copyIcon.set_text("✅");
        this.copyButton.set_style(`
          background-color: ${COLORS.SUCCESS};
          border-radius: 4px;
          padding: 8px;
          min-width: 32px;
          min-height: 32px;
        `);

        // Reset after 2 seconds
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
          copyIcon.set_text("📋");
          this.copyButton.set_style(`
            background-color: ${COLORS.PRIMARY};
            border-radius: 4px;
            padding: 8px;
            min-width: 32px;
            min-height: 32px;
          `);
          return false;
        });
      }
    });

    this.copyButton.connect("enter-event", () => {
      this.copyButton.set_style(`
        background-color: ${COLORS.WARNING};
        border-radius: 4px;
        padding: 8px;
        min-width: 32px;
        min-height: 32px;
      `);
    });

    this.copyButton.connect("leave-event", () => {
      this.copyButton.set_style(`
        background-color: ${COLORS.PRIMARY};
        border-radius: 4px;
        padding: 8px;
        min-width: 32px;
        min-height: 32px;
      `);
    });

    commandBox.add_child(this.copyButton);

    section.add_child(commandBox);
    return section;
  }

  _updateCommand() {
    if (this.commandLabel) {
      const command = this._generateInstallCommand();
      this.commandLabel.set_text(command);
    }
  }

  _initializeCommand() {
    // Initialize command when dialog is built
    if (this.commandLabel) {
      this._updateCommand();
    }
  }

  show() {
    if (!this.overlay) return;

    // Update command when dialog is shown
    this._updateCommand();

    Main.layoutManager.addTopChrome(this.overlay);

    const monitor = Main.layoutManager.primaryMonitor;
    this.overlay.set_position(monitor.x, monitor.y);
    this.overlay.set_size(monitor.width, monitor.height);

    // Center the dialog
    this.centerTimeoutId = centerWidgetOnMonitor(
      this.dialogContainer,
      monitor,
      {
        fallbackWidth: 700,
        fallbackHeight: 500,
        existingTimeoutId: this.centerTimeoutId,
        onComplete: () => (this.centerTimeoutId = null),
      }
    );

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
