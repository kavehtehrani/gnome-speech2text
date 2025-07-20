import GLib from "gi://GLib";

export interface FocusState {
  hasActiveWindow: boolean;
  windowId: string | null;
  currentFocus: any;
  error?: any;
}

// Focus debugging utility function
export function debugFocusState(context = ""): FocusState {
  const prefix = context ? `🔍 ${context} FOCUS DEBUG` : "🔍 FOCUS DEBUG";

  try {
    const currentFocus = global.stage.get_key_focus();
    log(
      `${prefix} - Current stage focus: ${
        currentFocus ? currentFocus.toString() : "NULL"
      }`
    );

    // Try to get active window info using xdotool (X11)
    const [success, stdout] = GLib.spawn_command_line_sync(
      "xdotool getactivewindow"
    );

    if (success && stdout) {
      const windowId = new TextDecoder().decode(stdout).trim();
      log(`${prefix} - Active X11 window ID: ${windowId}`);

      // Get window name
      const [nameSuccess, nameStdout] = GLib.spawn_command_line_sync(
        `xdotool getwindowname ${windowId}`
      );
      if (nameSuccess && nameStdout) {
        const windowName = new TextDecoder().decode(nameStdout).trim();
        log(`${prefix} - Active window name: ${windowName}`);
      }

      return { hasActiveWindow: true, windowId, currentFocus };
    } else {
      // NO ACTIVE WINDOW - this is the problem!
      log(
        `${prefix} - No active X11 window found - this will cause focus issues!`
      );
      return { hasActiveWindow: false, windowId: null, currentFocus };
    }
  } catch (e) {
    log(`${prefix} - Error getting focus info: ${e}`);
    return {
      hasActiveWindow: false,
      windowId: null,
      currentFocus: null,
      error: e,
    };
  }
}

// Helper function to establish X11 focus context when no active window exists
export function establishX11FocusContext(callback: (() => void) | null = null): boolean {
  try {
    // Try to find and focus any available window to establish X11 context
    const [findSuccess, findStdout] = GLib.spawn_command_line_sync(
      "xdotool search --onlyvisible '.*' | head -1"
    );

    if (findSuccess && findStdout) {
      const anyWindowId = new TextDecoder().decode(findStdout).trim();
      if (anyWindowId) {
        log(
          `🔍 FOCUS DEBUG - Found window ${anyWindowId}, focusing it to establish X11 context`
        );
        GLib.spawn_command_line_sync(`xdotool windowfocus ${anyWindowId}`);
        GLib.spawn_command_line_sync(`xdotool windowactivate ${anyWindowId}`);

        if (callback) {
          // Wait a moment for focus to settle
          GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            callback();
            return false;
          });
          return true; // Indicates callback will be called asynchronously
        }
        return true;
      }
    }
  } catch (e) {
    log(`🔍 FOCUS DEBUG - Error establishing X11 context: ${e}`);
  }

  callback?.(); // Call immediately if we couldn't establish context
  return false;
}
