import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { COLORS, STYLES } from "./constants.js";
import { createHoverButton, createHorizontalBox } from "./uiUtils.js";
import { cleanupChromeWidget } from "./resourceUtils.js";

export class TranscriptionProgress {
  constructor(onCancel) {
    this.onCancel = onCancel;
    this.container = null;
    this._ellipsisTimeoutId = null;
    this._centerTimeoutId = null;
    this._ellipsisStep = 0;
    this._label = null;

    this._build();
  }

  _build() {
    this.container = new St.Widget({
      style: `
        background-color: ${COLORS.TRANSPARENT_BLACK_85};
        border-radius: ${STYLES.DIALOG_BORDER_RADIUS};
        padding: 16px 18px;
        border: ${STYLES.DIALOG_BORDER};
        min-width: 320px;
        max-width: 420px;
      `,
      layout_manager: new Clutter.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        spacing: 12,
      }),
      reactive: true,
      can_focus: false,
      track_hover: true,
    });

    const header = new St.BoxLayout({
      vertical: false,
      style: "spacing: 12px;",
      x_align: Clutter.ActorAlign.START,
    });

    const icon = new St.Label({
      text: "🧠",
      style: "font-size: 28px;",
      y_align: Clutter.ActorAlign.CENTER,
    });

    this._label = new St.Label({
      text: "Transcribing…",
      style: `font-size: 16px; font-weight: bold; color: ${COLORS.WHITE};`,
      y_align: Clutter.ActorAlign.CENTER,
      x_align: Clutter.ActorAlign.START,
      x_expand: true,
    });

    header.add_child(icon);
    header.add_child(this._label);

    const hint = new St.Label({
      text: "You can keep working while Speech2Text processes your audio.",
      style: `font-size: 13px; color: ${COLORS.LIGHT_GRAY};`,
      x_align: Clutter.ActorAlign.START,
    });

    const buttons = createHorizontalBox("10px", "0px");
    buttons.set_x_align(Clutter.ActorAlign.END);

    const cancelButton = createHoverButton(
      "Cancel",
      COLORS.SECONDARY,
      COLORS.DARK_GRAY
    );
    cancelButton.connect("clicked", () => this.onCancel?.());
    buttons.add_child(cancelButton);

    this.container.add_child(header);
    this.container.add_child(hint);
    this.container.add_child(buttons);
  }

  open() {
    if (!this.container) return;

    Main.layoutManager.addTopChrome(this.container);
    this.container.show();

    // Position near top-right of primary monitor (below panel)
    const monitor = Main.layoutManager.primaryMonitor;
    const margin = 16;
    const yOffset = 60;

    // Wait one tick for size allocation then position.
    if (this._centerTimeoutId) GLib.Source.remove(this._centerTimeoutId);
    this._centerTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
      let [w, h] = this.container.get_size();
      if (w === 0) w = 360;
      if (h === 0) h = 120;

      const x = Math.round(monitor.x + monitor.width - w - margin);
      const y = Math.round(monitor.y + yOffset);
      this.container.set_position(x, y);
      this._centerTimeoutId = null;
      return false;
    });

    this._startEllipsisAnimation();
  }

  _startEllipsisAnimation() {
    this._stopEllipsisAnimation();
    this._ellipsisStep = 0;

    this._ellipsisTimeoutId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      500,
      () => {
        if (!this._label) return false;
        this._ellipsisStep = (this._ellipsisStep + 1) % 4;
        const dots = ".".repeat(this._ellipsisStep);
        this._label.set_text(`Transcribing${dots}`);
        return true;
      }
    );
  }

  _stopEllipsisAnimation() {
    if (this._ellipsisTimeoutId) {
      GLib.Source.remove(this._ellipsisTimeoutId);
      this._ellipsisTimeoutId = null;
    }
  }

  close() {
    this._stopEllipsisAnimation();

    if (this._centerTimeoutId) {
      GLib.Source.remove(this._centerTimeoutId);
      this._centerTimeoutId = null;
    }

    if (this.container) {
      cleanupChromeWidget(this.container, { destroy: true });

      this.container = null;
      this._label = null;
    }
  }
}
