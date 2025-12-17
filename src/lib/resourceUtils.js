import * as Main from "resource:///org/gnome/shell/ui/main.js";
import GLib from "gi://GLib";

let _debugEnabled = null;
export function isDebugEnabled() {
  if (_debugEnabled === null) {
    const v = String(GLib.getenv("SPEECH2TEXT_DEBUG") || "").toLowerCase();
    _debugEnabled = v === "1" || v === "true" || v === "yes";
  }
  return _debugEnabled;
}

export const log = {
  debug: (...args) => {
    if (isDebugEnabled()) console.log(...args);
  },
  info: (...args) => {
    if (isDebugEnabled()) console.log(...args);
  },
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

// Helper to safely disconnect event handlers
export function safeDisconnect(actor, handlerId, handlerName = "handler") {
  try {
    if (actor && handlerId) {
      actor.disconnect(handlerId);
      log.debug(`Disconnected ${handlerName} (ID: ${handlerId})`);
      return true;
    }
  } catch (e) {
    log.warn(`Error disconnecting ${handlerName}: ${e}`);
  }
  return false;
}

// Modal dialog cleanup utility
export function cleanupModal(overlay, handlers = {}) {
  try {
    // Disconnect event handlers
    const clickId = handlers.clickHandlerId ?? handlers.clickHandler;
    const keyPressId = handlers.keyPressHandlerId ?? handlers.keyPressHandler;
    const keyReleaseId =
      handlers.keyReleaseHandlerId ?? handlers.keyReleaseHandler;

    if (clickId) {
      safeDisconnect(overlay, clickId, "click handler");
    }
    if (keyPressId) {
      safeDisconnect(overlay, keyPressId, "key press handler");
    }
    if (keyReleaseId) {
      safeDisconnect(overlay, keyReleaseId, "key release handler");
    }

    // Remove from layout manager with better error handling
    if (overlay && overlay.get_parent()) {
      try {
        Main.layoutManager.removeChrome(overlay);
        log.debug("Modal overlay removed from chrome successfully");
      } catch (removeError) {
        log.warn(`Error removing modal from chrome: ${removeError.message}`);
        // Try alternative cleanup if removeChrome fails
        try {
          if (overlay.destroy) {
            overlay.destroy();
            log.debug("Modal overlay destroyed as fallback");
          }
        } catch (destroyError) {
          log.warn(`Error destroying modal overlay: ${destroyError.message}`);
        }
      }
    } else if (overlay) {
      log.debug("Modal overlay has no parent, skipping chrome removal");
    }

    return true;
  } catch (e) {
    log.warn(`Error cleaning up modal: ${e.message}`);
    return false;
  }
}
