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
    this.isManualRequest = errorMessage === "Manual setup guide requested";
    this.isReinstallRequired =
      typeof errorMessage === "string" &&
      errorMessage.startsWith("reinstall_required:");
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
      this.isManualRequest ? "📚" : this.isReinstallRequired ? "🔧" : "⚠️",
      "icon",
      "font-size: 36px;"
    );
    const headerText = createStyledLabel(
      this.isManualRequest
        ? "GNOME Speech2Text Setup Guide"
        : this.isReinstallRequired
        ? "Service Reinstall Required"
        : "Service Installation Required",
      "title",
      `color: ${
        this.isManualRequest
          ? COLORS.INFO
          : this.isReinstallRequired
          ? COLORS.WARNING
          : COLORS.PRIMARY
      };`
    );

    titleContainer.add_child(headerIcon);
    titleContainer.add_child(headerText);

    // Create top-right close button
    this.closeButton = createCloseButton(32);
    const headerBox = createHeaderLayout(titleContainer, this.closeButton);

    // Initialize selection from settings (or reinstall_required hint) early,
    // so we can show the current selection in the dialog text.
    this._initWhisperSelection();

    // Status message
    const statusText = (() => {
      if (this.isManualRequest) {
        return `Setup & reinstall options (current: ${
          this._selectedModel
        } on ${this._selectedDevice.toUpperCase()})`;
      }
      if (this.isReinstallRequired) {
        const device = this.errorMessage.split(":", 2)[1] || "gpu";
        return `Service reinstall required to switch to ${device.toUpperCase()} mode`;
      }
      return `Service Status: ${this.errorMessage}`;
    })();
    const statusLabel = new St.Label({
      text: statusText,
      style: `
        font-size: 14px;
        color: ${
          this.isManualRequest
            ? COLORS.INFO
            : this.isReinstallRequired
            ? COLORS.WARNING
            : COLORS.DANGER
        };
        margin: 10px 0;
        padding: 10px;
        background-color: ${
          this.isManualRequest
            ? "rgba(23, 162, 184, 0.1)"
            : this.isReinstallRequired
            ? "rgba(255, 140, 0, 0.1)"
            : "rgba(255, 0, 0, 0.1)"
        };
        border-radius: 5px;
      `,
    });

    // Main explanation
    const explanation = (() => {
      if (this.isManualRequest) {
        return `Instructions for installing and troubleshooting the Speech2Text service.
Use this if you need to reinstall the d-bus service.`;
      }
      if (this.isReinstallRequired) {
        return `You changed the Whisper compute device (CPU/GPU).
The background service uses a Python environment; switching devices may require reinstalling it so the correct ML dependencies are installed.`;
      }
      return `GNOME Speech2Text requires a background service for speech processing.
This service is installed separately from the extension (following GNOME guidelines).`;
    })();
    const explanationText = new St.Label({
      text: explanation,
      style: `
        font-size: 16px;
        color: ${COLORS.WHITE};
        margin: 15px 0;
        line-height: 1.5;
      `,
    });

    // Show installed state (from installer marker file), and selection (local, not persisted until install)
    this.installedConfigLabel = new St.Label({
      text: this._getInstalledConfigText(),
      style: `
        font-size: 13px;
        color: ${COLORS.LIGHT_GRAY};
        margin: 0 0 8px 0;
      `,
    });
    this.selectedConfigLabel = new St.Label({
      text: this._getSelectedConfigText(),
      style: `
        font-size: 13px;
        color: ${COLORS.LIGHT_GRAY};
        margin: 0 0 8px 0;
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
      text: "Select CPU/GPU and model, then click below to install/reinstall the service in a terminal:",
      style: `font-size: 14px; color: ${COLORS.WHITE}; margin: 5px 0 15px 0;`,
    });

    const whisperConfigSection = this._buildWhisperConfigSection();

    const autoInstallButtonWidget = createHoverButton(
      this.isManualRequest
        ? "🔧 Reinstall Service"
        : this.isReinstallRequired
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
    this.dialogContainer.add_child(this.installedConfigLabel);
    this.dialogContainer.add_child(this.selectedConfigLabel);
    this.dialogContainer.add_child(autoInstallTitle);
    this.dialogContainer.add_child(autoInstallDescription);
    if (whisperConfigSection) {
      this.dialogContainer.add_child(whisperConfigSection);
    }
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

    // If dialog is opened as reinstall-required, prefer the requested device
    if (this.isReinstallRequired) {
      const requested = (
        this.errorMessage.split(":", 2)[1] || ""
      ).toLowerCase();
      if (this._whisperDevices.includes(requested)) {
        this._selectedDevice = requested;
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

  _refreshConfigLabels() {
    this.installedConfigLabel?.set_text(this._getInstalledConfigText());
    this.selectedConfigLabel?.set_text(this._getSelectedConfigText());
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
      this._refreshConfigLabels();
    });
    this.modelNextButton.connect("clicked", () => {
      this._selectedModel = rotate(this._whisperModels, this._selectedModel, 1);
      this.modelValueLabel?.set_text(this._selectedModel);
      this._refreshConfigLabels();
    });

    const updateDeviceStyle = () => {
      this.deviceValueLabel?.set_text(this._selectedDevice);
      this.deviceValueLabel?.set_style(
        createAccentDisplayStyle(
          this._selectedDevice === "gpu" ? COLORS.WARNING : COLORS.SUCCESS,
          "160px"
        )
      );
    };

    this.devicePrevButton.connect("clicked", () => {
      this._selectedDevice = rotate(
        this._whisperDevices,
        this._selectedDevice,
        -1
      );
      updateDeviceStyle();
      this._refreshConfigLabels();
    });
    this.deviceNextButton.connect("clicked", () => {
      this._selectedDevice = rotate(
        this._whisperDevices,
        this._selectedDevice,
        1
      );
      updateDeviceStyle();
      this._refreshConfigLabels();
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

  _runAutomaticInstall() {
    try {
      const workingDir = GLib.get_home_dir();
      const scriptPath = `${this.extension.path}/install-service.sh`;
      // Persist final selection (important for first-time setup).
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
        // Ignore; still proceed to run installer with selected flags.
      }

      const gpuFlag = this._selectedDevice === "gpu" ? " --gpu" : "";
      const modelFlag = ` --whisper-model ${this._selectedModel}`;
      const command = `bash -c "'${scriptPath}' --pypi --non-interactive${gpuFlag}${modelFlag}; echo; echo 'Press Enter to close...'; read"`;

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

          this.close();
        } catch (terminalError) {
          console.error(`Could not open ${terminal}: ${terminalError}`);
          this._fallbackToClipboard(scriptPath);
        }
      } else {
        console.error("No terminal emulator found");
        this._fallbackToClipboard(scriptPath);
      }
    } catch (e) {
      console.error(`Error running automatic install: ${e}`);
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
          log.debug(`Found terminal: ${terminal} at ${foundPath}`);
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
    const gpuFlag = this._selectedDevice === "gpu" ? " --gpu" : "";
    const modelFlag = ` --whisper-model ${this._selectedModel}`;
    const localInstallCmd = `bash "${scriptPath}" --pypi --non-interactive${gpuFlag}${modelFlag}`;
    this._copyToClipboard(localInstallCmd);

    log.debug(
      "Could not open terminal. Installation command copied to clipboard."
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
