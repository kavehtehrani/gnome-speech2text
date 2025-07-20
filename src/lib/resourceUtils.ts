import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

export interface EventHandlers {
  clickHandlerId?: number;
  keyPressHandlerId?: number;
  [key: string]: number | undefined;
}

export interface CleanupResult {
  cleanedDialog: boolean;
  cleanedProcess: boolean;
}

// Helper to safely disconnect event handlers
export function safeDisconnect(actor: any, handlerId: number | undefined, handlerName = "handler"): boolean {
  try {
    if (actor && handlerId) {
      actor.disconnect(handlerId);
      log(`Disconnected ${handlerName} (ID: ${handlerId})`);
      return true;
    }
  } catch (e) {
    log(`Error disconnecting ${handlerName}: ${e}`);
  }
  return false;
}

// Modal dialog cleanup utility
export function cleanupModal(overlay: any, handlers: EventHandlers = {}): boolean {
  try {
    // Disconnect event handlers
    if (handlers.clickHandlerId) {
      safeDisconnect(overlay, handlers.clickHandlerId, "click handler");
    }
    if (handlers.keyPressHandlerId) {
      safeDisconnect(overlay, handlers.keyPressHandlerId, "key press handler");
    }

    // Remove from layout manager
    if (overlay && overlay.get_parent()) {
      Main.layoutManager.removeChrome(overlay);
      log("Modal overlay removed from chrome");
    }

    return true;
  } catch (e) {
    log(`Error cleaning up modal: ${e}`);
    return false;
  }
}

// Process cleanup utility with signal support
export function cleanupProcess(pid: number | null, signal = "USR1", processName = "process"): boolean {
  if (!pid) return false;

  try {
    GLib.spawn_command_line_sync(`kill -${signal} ${pid}`);
    log(`Sent ${signal} signal to ${processName} (PID: ${pid})`);
    return true;
  } catch (e) {
    log(`Error sending ${signal} to ${processName} (PID: ${pid}): ${e}`);
    return false;
  }
}

// Recording state cleanup utility
export function cleanupRecordingState(extension: any, iconResetStyle = ""): CleanupResult {
  let cleanedDialog = false;
  let cleanedProcess = false;

  // Clean up dialog
  if (extension.recordingDialog) {
    try {
      extension.recordingDialog.close();
      extension.recordingDialog = null;
      cleanedDialog = true;
      log("Recording dialog cleaned up");
    } catch (e) {
      log(`Error cleaning up recording dialog: ${e}`);
      extension.recordingDialog = null; // Force cleanup even if close fails
    }
  }

  // Clean up process
  if (extension.recordingProcess) {
    cleanedProcess = cleanupProcess(
      extension.recordingProcess,
      "USR1",
      "recording process"
    );
    extension.recordingProcess = null;
  }

  // Reset icon style using optional chaining
  extension.icon?.set_style(iconResetStyle);
  if (extension.icon) {
    log("Icon style reset");
  }

  return { cleanedDialog, cleanedProcess };
}
