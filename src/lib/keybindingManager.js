import Meta from "gi://Meta";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

export class KeybindingManager {
  constructor(extensionCore) {
    this.extensionCore = extensionCore;
    this.currentKeybinding = null;
  }

  setupKeybinding() {
    // Remove existing keybinding if it exists
    Main.wm.removeKeybinding("toggle-recording");

    // Get shortcut from settings
    let shortcuts = this.extensionCore
      .getSettingsObject()
      .get_strv("toggle-recording");
    if (shortcuts.length > 0) {
      this.currentKeybinding = shortcuts[0];
    } else {
      // Use a much safer shortcut that doesn't conflict with system shortcuts
      // Avoid Ctrl+C (SIGINT), Ctrl+Z (SIGTSTP), and workspace navigation shortcuts
      this.currentKeybinding = "<Super><Alt>r";
      this.extensionCore
        .getSettingsObject()
        .set_strv("toggle-recording", [this.currentKeybinding]);
    }

    // Register keybinding
    // Store reference to 'this' to avoid context issues in callback
    const self = this;
    Main.wm.addKeybinding(
      "toggle-recording",
      this.extensionCore.getSettingsObject(),
      Meta.KeyBindingFlags.NONE,
      Shell.ActionMode.NORMAL,
      () => {
        console.log(
          "Keyboard shortcut triggered, extension enabled:",
          self.extensionCore.isEnabled
        );
        // Use direct reference to this extension instance
        self.extensionCore.toggleRecording();
      }
    );
    console.log(`Keybinding registered: ${this.currentKeybinding}`);
  }

  getCurrentKeybinding() {
    return this.currentKeybinding;
  }

  cleanup() {
    // Remove keybinding
    Main.wm.removeKeybinding("toggle-recording");
    this.currentKeybinding = null;
  }
}
