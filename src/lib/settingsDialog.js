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
    this.nonBlockingTranscriptionCheckbox = null;
    this.nonBlockingTranscriptionCheckboxIcon = null;
    this.centerTimeoutId = null;
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
    const optionsSection = this._buildOptionsSection();

    // Assemble window
    settingsWindow.add_child(headerBox);
    settingsWindow.add_child(shortcutSection);
    settingsWindow.add_child(createSeparator());
    settingsWindow.add_child(durationSection);
    settingsWindow.add_child(createSeparator());
    settingsWindow.add_child(optionsSection);

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
    shortcutSection.add_child(currentShortcutBox);
    shortcutSection.add_child(shortcutButtonBox);

    return shortcutSection;
  }

  _buildDurationSection() {
    let durationSection = createVerticalBox();
    // Clean single-row layout: label + control beside it
    const row = createHorizontalBox("12px", "0px");

    let durationLabel = createStyledLabel("Recording duration", "subtitle");
    durationLabel.set_x_expand(true);
    durationLabel.set_x_align(Clutter.ActorAlign.START);

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

    row.add_child(durationLabel);
    row.add_child(durationControlBox);

    durationSection.add_child(row);

    return durationSection;
  }

  _buildOptionsSection() {
    const section = createVerticalBox("10px", "10px", "0px");

    // 1) copy-to-clipboard
    {
      const row = createHorizontalBox("12px", "0px");
      const label = createStyledLabel(
        "Copy to clipboard automatically",
        "normal"
      );
      label.set_x_expand(true);
      label.set_x_align(Clutter.ActorAlign.START);

      const enabled = this.settings.get_boolean("copy-to-clipboard");
      this.clipboardCheckbox = new St.Button({
        style: `
          width: 20px;
          height: 20px;
          border-radius: 3px;
          border: 2px solid ${COLORS.SECONDARY};
          background-color: ${enabled ? COLORS.PRIMARY : "transparent"};
          margin-right: 10px;
        `,
        reactive: true,
        can_focus: true,
      });
      this.clipboardCheckboxIcon = new St.Label({
        text: enabled ? "✓" : "",
        style: `color: white; font-size: 14px; font-weight: bold; text-align: center;`,
      });
      this.clipboardCheckbox.add_child(this.clipboardCheckboxIcon);

      row.add_child(label);
      row.add_child(this.clipboardCheckbox);
      section.add_child(row);
    }

    // 2) non-blocking transcription
    {
      const row = createHorizontalBox("12px", "0px");
      const label = createStyledLabel("Non-blocking transcription", "normal");
      label.set_x_expand(true);
      label.set_x_align(Clutter.ActorAlign.START);

      const enabled = this.settings.get_boolean("non-blocking-transcription");
      this.nonBlockingTranscriptionCheckbox = new St.Button({
        style: `
          width: 20px;
          height: 20px;
          border-radius: 3px;
          border: 2px solid ${COLORS.SECONDARY};
          background-color: ${enabled ? COLORS.PRIMARY : "transparent"};
          margin-right: 10px;
        `,
        reactive: true,
        can_focus: true,
      });

      this.nonBlockingTranscriptionCheckboxIcon = new St.Label({
        text: enabled ? "✓" : "",
        style: `color: white; font-size: 14px; font-weight: bold; text-align: center;`,
      });
      this.nonBlockingTranscriptionCheckbox.add_child(
        this.nonBlockingTranscriptionCheckboxIcon
      );

      row.add_child(label);
      row.add_child(this.nonBlockingTranscriptionCheckbox);
      section.add_child(row);
    }

    // 3) auto-insert (X11 only)
    if (!Meta.is_wayland_compositor()) {
      const row = createHorizontalBox("12px", "0px");
      const label = createStyledLabel(
        "Auto-insert mode at cursor (x11 only)",
        "normal"
      );
      label.set_x_expand(true);
      label.set_x_align(Clutter.ActorAlign.START);

      const enabled = this.settings.get_boolean("skip-preview-x11");
      this.skipPreviewCheckbox = new St.Button({
        style: `
          width: 20px;
          height: 20px;
          border-radius: 3px;
          border: 2px solid ${COLORS.SECONDARY};
          background-color: ${enabled ? COLORS.PRIMARY : "transparent"};
          margin-right: 10px;
        `,
        reactive: true,
        can_focus: true,
      });

      this.skipPreviewCheckboxIcon = new St.Label({
        text: enabled ? "✓" : "",
        style: `color: white; font-size: 14px; font-weight: bold; text-align: center;`,
      });
      this.skipPreviewCheckbox.add_child(this.skipPreviewCheckboxIcon);

      row.add_child(label);
      row.add_child(this.skipPreviewCheckbox);
      section.add_child(row);
    } else {
      // Ensure these references are null on Wayland.
      this.skipPreviewCheckbox = null;
      this.skipPreviewCheckboxIcon = null;
    }

    return section;
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

    const _setSkipPreviewToggleUi = (enabled) => {
      if (!this.skipPreviewCheckbox || !this.skipPreviewCheckboxIcon) return;
      this.skipPreviewCheckbox.set_style(`
        width: 20px;
        height: 20px;
        border-radius: 3px;
        border: 2px solid ${COLORS.SECONDARY};
        background-color: ${enabled ? COLORS.PRIMARY : "transparent"};
        margin-right: 10px;
        opacity: ${enabled ? 1 : 1};
      `);
      this.skipPreviewCheckboxIcon.set_text(enabled ? "✓" : "");
    };

    const _setNonBlockingToggleUi = (enabled) => {
      if (
        !this.nonBlockingTranscriptionCheckbox ||
        !this.nonBlockingTranscriptionCheckboxIcon
      )
        return;
      this.nonBlockingTranscriptionCheckbox.set_style(`
        width: 20px;
        height: 20px;
        border-radius: 3px;
        border: 2px solid ${COLORS.SECONDARY};
        background-color: ${enabled ? COLORS.PRIMARY : "transparent"};
        margin-right: 10px;
      `);
      this.nonBlockingTranscriptionCheckboxIcon.set_text(enabled ? "✓" : "");
    };

    const _setSkipPreviewEnabledState = (enabled) => {
      // Disable interaction when non-blocking is enabled (mutual exclusion)
      if (!this.skipPreviewCheckbox) return;
      this.skipPreviewCheckbox.reactive = enabled;
      this.skipPreviewCheckbox.can_focus = enabled;
      // Visually indicate disabled state.
      this.skipPreviewCheckbox.set_opacity(enabled ? 255 : 120);
    };

    // Non-blocking transcription checkbox
    if (this.nonBlockingTranscriptionCheckbox) {
      this.nonBlockingTranscriptionCheckbox.connect("clicked", () => {
        const currentState = this.settings.get_boolean(
          "non-blocking-transcription"
        );
        const newState = !currentState;

        this.settings.set_boolean("non-blocking-transcription", newState);

        // Enforce mutual exclusion with auto-insert on X11.
        if (newState && this.settings.get_boolean("skip-preview-x11")) {
          this.settings.set_boolean("skip-preview-x11", false);
          _setSkipPreviewToggleUi(false);
        }

        // Disable/enable the auto-insert toggle UI depending on non-blocking state.
        _setSkipPreviewEnabledState(!newState);

        _setNonBlockingToggleUi(newState);
        Main.notify(
          "Speech2Text",
          `Non-blocking transcription ${newState ? "enabled" : "disabled"}`
        );
      });

      // Initialize auto-insert toggle disabled state based on current setting.
      const nonBlockingEnabledNow = this.settings.get_boolean(
        "non-blocking-transcription"
      );
      _setSkipPreviewEnabledState(!nonBlockingEnabledNow);
    }

    // Skip preview checkbox (X11 only)
    if (this.skipPreviewCheckbox) {
      this.skipPreviewCheckbox.connect("clicked", () => {
        // If non-blocking is enabled, don't allow auto-insert.
        if (this.settings.get_boolean("non-blocking-transcription")) {
          Main.notify(
            "Speech2Text",
            "Disable non-blocking transcription to enable auto-insert."
          );
          return;
        }

        let currentState = this.settings.get_boolean("skip-preview-x11");
        let newState = !currentState;

        this.settings.set_boolean("skip-preview-x11", newState);

        // If user enables auto-insert, ensure non-blocking is off.
        if (
          newState &&
          this.settings.get_boolean("non-blocking-transcription")
        ) {
          this.settings.set_boolean("non-blocking-transcription", false);
          _setNonBlockingToggleUi(false);
        }

        _setSkipPreviewToggleUi(newState);
        Main.notify(
          "Speech2Text",
          `Auto-insert mode ${newState ? "enabled" : "disabled"} (X11 only)`
        );
      });
    }

    // Modal overlay handlers
    // GNOME 49+ can route button-press-event through the overlay in a way that
    // blocks clicks on child widgets if we always stop propagation.
    // Only stop clicks on the backdrop itself; let child widgets (e.g. close button)
    // receive events normally.
    this.overlay.connect("button-press-event", (actor, event) => {
      try {
        const source = event?.get_source?.();
        return source === actor ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
      } catch {
        return Clutter.EVENT_STOP;
      }
    });
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
