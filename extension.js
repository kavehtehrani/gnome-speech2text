import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import St from "gi://St";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

let button;

export default class WhisperTypingExtension extends Extension {
  enable() {
    button = new PanelMenu.Button(0.0, "WhisperTyping");
    let icon = new St.Icon({
      gicon: Gio.icon_new_for_string(
        this.path + "/icons/microphone-symbolic.svg"
      ),
      style_class: "system-status-icon",
    });
    button.add_child(icon);
    button.connect("button-press-event", () => {
      GLib.spawn_command_line_async(
        `${this.path}/venv/bin/python3 ${this.path}/whisper_typing.py`
      );
    });
    Main.panel.addToStatusArea("WhisperTyping", button);
  }

  disable() {
    if (button) {
      button.destroy();
      button = null;
    }
  }
}

function init() {
  return new WhisperTypingExtension();
}
