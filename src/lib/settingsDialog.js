import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import St from "gi://St";
import Meta from "gi://Meta";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { COLORS, STYLES, createAccentDisplayStyle } from "./constants.js";
import {
  createHoverButton,
  createStyledLabel,
  createVerticalBox,
  createHorizontalBox,
  createSeparator,
} from "./uiUtils.js";
import {
  createCloseButton,
  createIncrementButton,
  createCenteredBox,
  createHeaderLayout,
} from "./buttonUtils.js";
import { cleanupModal } from "./resourceUtils.js";

export class SettingsDialog {
  constructor(extension) {
    this.extension = extension;
    this.settings = extension.settings;
    this.overlay = null;
    this.currentShortcutDisplay = null;
    this.clipboardCheckbox = null;
    this.clipboardCheckboxIcon = null;
    this.skipPreviewCheckbox = null;
    this.skipPreviewCheckboxIcon = null;
    this.centerTimeoutId = null;

    // Whisper settings controls
    this.whisperModelPrevButton = null;
    this.whisperModelNextButton = null;
    this.whisperModelValueLabel = null;
    this.whisperDevicePrevButton = null;
    this.whisperDeviceNextButton = null;
    this.whisperDeviceValueLabel = null;
  }

  show() {
    if (this.overlay) {
      return; // Already open
    }

    this._createDialog();
    this._setupEventHandlers();
    this._showDialog();
  }

  close() {
    // Clean up timeout sources
    if (this.centerTimeoutId) {
      GLib.Source.remove(this.centerTimeoutId);
      this.centerTimeoutId = null;
    }

    if (this.overlay) {
      cleanupModal(this.overlay, {});
      this.overlay = null;
    }
  }

  _createDialog() {
    // Main settings window
    let settingsWindow = new St.BoxLayout({
      style_class: "settings-window",
      vertical: true,
      style: `
        background-color: rgba(20, 20, 20, 0.95);
        border-radius: 12px;
        padding: 24px;
        min-width: 550px;
        max-width: 600px;
        border: ${STYLES.DIALOG_BORDER};
      `,
    });

    // Build all sections
    const headerBox = this._buildHeaderSection();
    const shortcutSection = this._buildShortcutSection();
    const durationSection = this._buildDurationSection();
    const whisperSection = this._buildWhisperSection();
    const clipboardSection = this._buildClipboardSection();
    const skipPreviewSection = this._buildSkipPreviewSection();

    // Assemble window
    settingsWindow.add_child(headerBox);
    settingsWindow.add_child(shortcutSection);
    settingsWindow.add_child(createSeparator());
    settingsWindow.add_child(durationSection);
    settingsWindow.add_child(createSeparator());
    settingsWindow.add_child(whisperSection);
    settingsWindow.add_child(createSeparator());
    settingsWindow.add_child(clipboardSection);

    // Only add skip preview section on X11
    const isWayland = Meta.is_wayland_compositor();
    if (!isWayland && skipPreviewSection) {
      settingsWindow.add_child(createSeparator());
      settingsWindow.add_child(skipPreviewSection);
    }

    // Create modal overlay
    this.overlay = new St.Widget({
      style: `background-color: ${COLORS.TRANSPARENT_BLACK_70};`,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    this.overlay.add_child(settingsWindow);
    this.settingsWindow = settingsWindow;
  }

  _buildWhisperSection() {
    let whisperSection = createVerticalBox();
    let whisperLabel = createStyledLabel("Speech Recognition", "subtitle");
    let whisperDescription = createStyledLabel(
      "Configure the Whisper model and whether to use CPU or GPU (CUDA).",
      "description"
    );

    // Model selector
    const models = [
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

    const currentModel = (() => {
      const m = this.settings.get_string("whisper-model");
      if (m && models.includes(m)) return m;
      return "base";
    })();

    let modelRow = createHorizontalBox();
    let modelLabel = createStyledLabel("Model:", "normal", "min-width: 80px;");

    let modelControlBox = createCenteredBox(false, "8px");
    this.whisperModelPrevButton = createIncrementButton("←", 28);
    this.whisperModelNextButton = createIncrementButton("→", 28);
    this.whisperModelValueLabel = createStyledLabel(
      currentModel,
      "normal",
      createAccentDisplayStyle(COLORS.PRIMARY, "140px")
    );

    modelControlBox.add_child(this.whisperModelPrevButton);
    modelControlBox.add_child(this.whisperModelValueLabel);
    modelControlBox.add_child(this.whisperModelNextButton);

    modelRow.add_child(modelLabel);
    modelRow.add_child(modelControlBox);

    // Device selector
    const devices = ["cpu", "gpu"];
    const currentDevice = (() => {
      const d = this.settings.get_string("whisper-device");
      if (d && devices.includes(d)) return d;
      return "cpu";
    })();

    let deviceRow = createHorizontalBox();
    let deviceLabel = createStyledLabel(
      "Device:",
      "normal",
      "min-width: 80px;"
    );

    let deviceControlBox = createCenteredBox(false, "8px");
    this.whisperDevicePrevButton = createIncrementButton("←", 28);
    this.whisperDeviceNextButton = createIncrementButton("→", 28);
    this.whisperDeviceValueLabel = createStyledLabel(
      currentDevice,
      "normal",
      createAccentDisplayStyle(
        currentDevice === "gpu" ? COLORS.WARNING : COLORS.SUCCESS,
        "140px"
      )
    );

    deviceControlBox.add_child(this.whisperDevicePrevButton);
    deviceControlBox.add_child(this.whisperDeviceValueLabel);
    deviceControlBox.add_child(this.whisperDeviceNextButton);

    deviceRow.add_child(deviceLabel);
    deviceRow.add_child(deviceControlBox);

    // Small warning note (especially relevant for GPU)
    const deviceNote = createStyledLabel(
      "Note: switching CPU/GPU may require reinstalling the background service.",
      "small",
      "margin-top: 4px;"
    );

    whisperSection.add_child(whisperLabel);
    whisperSection.add_child(whisperDescription);
    whisperSection.add_child(modelRow);
    whisperSection.add_child(deviceRow);
    whisperSection.add_child(deviceNote);

    // Keep model list available for event handlers
    this._whisperModels = models;
    this._whisperDevices = devices;

    return whisperSection;
  }

  _buildHeaderSection() {
    let titleContainer = createCenteredBox(false, "15px");
    titleContainer.set_x_align(Clutter.ActorAlign.START);
    titleContainer.set_x_expand(true);

    let titleIcon = createStyledLabel("🎤", "icon", "");
    let titleLabel = createStyledLabel("Speech2Text Settings", "title");

    titleContainer.add_child(titleIcon);
    titleContainer.add_child(titleLabel);

    this.closeButton = createCloseButton(32);
    return createHeaderLayout(titleContainer, this.closeButton);
  }

  _buildShortcutSection() {
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

    const shortcuts = this.settings.get_strv("toggle-recording");
    const currentShortcut = shortcuts.length > 0 ? shortcuts[0] : null;
    this.currentShortcutDisplay = createStyledLabel(
      currentShortcut || "No shortcut set",
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
    this.changeShortcutButton = createHoverButton(
      "Change Shortcut",
      COLORS.INFO,
      "#0077ee"
    );
    this.resetToDefaultButton = createHoverButton(
      "Reset to Default",
      COLORS.WARNING,
      "#ff8c00"
    );
    this.removeShortcutButton = createHoverButton(
      "Remove Shortcut",
      COLORS.DANGER,
      "#dc3545"
    );

    shortcutButtonBox.add_child(this.changeShortcutButton);
    shortcutButtonBox.add_child(this.resetToDefaultButton);
    shortcutButtonBox.add_child(this.removeShortcutButton);

    shortcutSection.add_child(shortcutLabel);
    shortcutSection.add_child(shortcutDescription);
    shortcutSection.add_child(currentShortcutBox);
    shortcutSection.add_child(shortcutButtonBox);

    return shortcutSection;
  }

  _buildDurationSection() {
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
    this.durationValueLabel = createStyledLabel(
      `${currentDuration}s`,
      "normal",
      createAccentDisplayStyle(COLORS.PRIMARY, "60px")
    );

    // Create duration control buttons
    let durationControlBox = createCenteredBox(false, "8px");
    this.decreaseButton = createIncrementButton("−", 28);
    this.increaseButton = createIncrementButton("+", 28);

    durationControlBox.add_child(this.decreaseButton);
    durationControlBox.add_child(this.durationValueLabel);
    durationControlBox.add_child(this.increaseButton);

    durationSliderBox.add_child(durationSliderLabel);
    durationSliderBox.add_child(durationControlBox);

    durationSection.add_child(durationLabel);
    durationSection.add_child(durationDescription);
    durationSection.add_child(durationSliderBox);

    return durationSection;
  }

  _buildClipboardSection() {
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

    clipboardCheckboxBox.add_child(clipboardCheckboxLabel);
    clipboardCheckboxBox.add_child(this.clipboardCheckbox);

    clipboardSection.add_child(clipboardLabel);
    clipboardSection.add_child(clipboardDescription);
    clipboardSection.add_child(clipboardCheckboxBox);

    return clipboardSection;
  }

  _buildSkipPreviewSection() {
    const isWayland = Meta.is_wayland_compositor();
    if (isWayland) {
      return null;
    }

    let skipPreviewSection = createVerticalBox();
    let skipPreviewLabel = createStyledLabel(
      "Auto-Insert Mode (X11 Only)",
      "subtitle"
    );
    let skipPreviewDescription = createStyledLabel(
      "Skip the preview dialog and insert text immediately after recording. Only works on X11.",
      "description"
    );

    let skipPreviewCheckboxBox = createHorizontalBox();
    let skipPreviewCheckboxLabel = createStyledLabel(
      "Auto-insert:",
      "normal",
      "min-width: 130px;"
    );

    let isSkipPreviewEnabled = this.settings.get_boolean("skip-preview-x11");
    this.skipPreviewCheckbox = new St.Button({
      style: `
        width: 20px;
        height: 20px;
        border-radius: 3px;
        border: 2px solid ${COLORS.SECONDARY};
        background-color: ${
          isSkipPreviewEnabled ? COLORS.PRIMARY : "transparent"
        };
        margin-right: 10px;
      `,
      reactive: true,
      can_focus: true,
    });

    this.skipPreviewCheckboxIcon = new St.Label({
      text: isSkipPreviewEnabled ? "✓" : "",
      style: `color: white; font-size: 14px; font-weight: bold; text-align: center;`,
    });
    this.skipPreviewCheckbox.add_child(this.skipPreviewCheckboxIcon);

    skipPreviewCheckboxBox.add_child(skipPreviewCheckboxLabel);
    skipPreviewCheckboxBox.add_child(this.skipPreviewCheckbox);

    skipPreviewSection.add_child(skipPreviewLabel);
    skipPreviewSection.add_child(skipPreviewDescription);
    skipPreviewSection.add_child(skipPreviewCheckboxBox);

    return skipPreviewSection;
  }

  _setupEventHandlers() {
    // Close button
    this.closeButton.connect("clicked", () => this.close());

    // Keyboard shortcuts
    this.changeShortcutButton.connect("clicked", () => {
      this.extension.uiManager.captureNewShortcut((newShortcut) => {
        if (newShortcut) {
          this.settings.set_strv("toggle-recording", [newShortcut]);
          this.currentShortcutDisplay.set_text(newShortcut);
          this.extension.keybindingManager?.setupKeybinding();
          Main.notify("Speech2Text", `Shortcut changed to: ${newShortcut}`);
        }
      });
    });

    this.resetToDefaultButton.connect("clicked", () => {
      const defaultShortcut = "<Super><Alt>r";
      this.settings.set_strv("toggle-recording", [defaultShortcut]);
      this.currentShortcutDisplay.set_text(defaultShortcut);
      this.extension.keybindingManager?.setupKeybinding();
      Main.notify(
        "Speech2Text",
        `Shortcut reset to default: ${defaultShortcut}`
      );
    });

    this.removeShortcutButton.connect("clicked", () => {
      Main.wm.removeKeybinding("toggle-recording");
      this.settings.set_strv("toggle-recording", []);
      this.currentShortcutDisplay.set_text("No shortcut set");
      Main.notify("Speech2Text", "Keyboard shortcut removed");
    });

    // Duration controls
    this.decreaseButton.connect("clicked", () => {
      let current = this.settings.get_int("recording-duration");
      let newValue = Math.max(10, current - 10);
      this.settings.set_int("recording-duration", newValue);
      this.durationValueLabel.set_text(`${newValue}s`);
    });

    this.increaseButton.connect("clicked", () => {
      let current = this.settings.get_int("recording-duration");
      let newValue = Math.min(300, current + 10);
      this.settings.set_int("recording-duration", newValue);
      this.durationValueLabel.set_text(`${newValue}s`);
    });

    // Whisper model controls
    if (this.whisperModelPrevButton && this.whisperModelNextButton) {
      const rotateModel = (direction) => {
        const models = this._whisperModels || ["base"];
        const current = this.settings.get_string("whisper-model") || "base";
        const idx = Math.max(0, models.indexOf(current));
        const nextIdx =
          (idx + direction + models.length) % Math.max(1, models.length);
        const nextModel = models[nextIdx] || "base";
        this.settings.set_string("whisper-model", nextModel);
        this.whisperModelValueLabel?.set_text(nextModel);
        Main.notify("Speech2Text", `Whisper model set to: ${nextModel}`);
      };
      this.whisperModelPrevButton.connect("clicked", () => rotateModel(-1));
      this.whisperModelNextButton.connect("clicked", () => rotateModel(1));
    }

    // Whisper device controls (CPU/GPU) + reinstall prompt on change
    if (this.whisperDevicePrevButton && this.whisperDeviceNextButton) {
      const rotateDevice = (direction) => {
        const devices = this._whisperDevices || ["cpu", "gpu"];
        const oldDevice = this.settings.get_string("whisper-device") || "cpu";
        const idx = Math.max(0, devices.indexOf(oldDevice));
        const nextIdx =
          (idx + direction + devices.length) % Math.max(1, devices.length);
        const nextDevice = devices[nextIdx] || "cpu";
        if (nextDevice === oldDevice) return;

        this.settings.set_string("whisper-device", nextDevice);
        this.whisperDeviceValueLabel?.set_text(nextDevice);
        this.whisperDeviceValueLabel?.set_style(
          createAccentDisplayStyle(
            nextDevice === "gpu" ? COLORS.WARNING : COLORS.SUCCESS,
            "140px"
          )
        );

        // Prompt reinstall so the user can switch the service environment
        // (especially important when switching CPU -> GPU).
        Main.notify(
          "Speech2Text",
          `Whisper device set to: ${nextDevice}. Service reinstall may be required.`
        );

        // Close settings to avoid stacking modals, then open installer dialog.
        try {
          this.close();
        } catch (_e) {
          // Ignore close issues; still show setup dialog.
        }
        this.extension.uiManager?.showServiceSetupDialog(
          `reinstall_required:${nextDevice}`
        );
      };
      this.whisperDevicePrevButton.connect("clicked", () => rotateDevice(-1));
      this.whisperDeviceNextButton.connect("clicked", () => rotateDevice(1));
    }

    // Clipboard checkbox
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

    // Skip preview checkbox (X11 only)
    if (this.skipPreviewCheckbox) {
      this.skipPreviewCheckbox.connect("clicked", () => {
        let currentState = this.settings.get_boolean("skip-preview-x11");
        let newState = !currentState;

        this.settings.set_boolean("skip-preview-x11", newState);

        this.skipPreviewCheckbox.set_style(`
          width: 20px;
          height: 20px;
          border-radius: 3px;
          border: 2px solid ${COLORS.SECONDARY};
          background-color: ${newState ? COLORS.PRIMARY : "transparent"};
          margin-right: 10px;
        `);

        this.skipPreviewCheckboxIcon.set_text(newState ? "✓" : "");
        Main.notify(
          "Speech2Text",
          `Auto-insert mode ${newState ? "enabled" : "disabled"} (X11 only)`
        );
      });
    }

    // Modal overlay handlers
    this.overlay.connect("button-press-event", () => Clutter.EVENT_STOP);
    this.overlay.connect("key-press-event", (actor, event) => {
      if (event.get_key_symbol() === Clutter.KEY_Escape) {
        this.close();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_STOP;
    });
  }

  _showDialog() {
    let monitor = Main.layoutManager.primaryMonitor;
    this.overlay.set_size(monitor.width, monitor.height);
    this.overlay.set_position(monitor.x, monitor.y);

    // Center the settings window
    if (this.centerTimeoutId) {
      GLib.Source.remove(this.centerTimeoutId);
    }
    this.centerTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
      let [windowWidth, windowHeight] = this.settingsWindow.get_size();
      if (windowWidth === 0) windowWidth = 450;
      if (windowHeight === 0)
        windowHeight = Math.min(monitor.height * 0.8, 600);

      // Use integer coordinates in overlay parent space to avoid subpixel blur
      const centerX = Math.round((monitor.width - windowWidth) / 2);
      const centerY = Math.round((monitor.height - windowHeight) / 2);
      this.settingsWindow.set_position(centerX, centerY);
      this.centerTimeoutId = null;
      return false;
    });

    Main.layoutManager.addTopChrome(this.overlay);
    this.overlay.grab_key_focus();
    this.overlay.set_reactive(true);
  }
}
