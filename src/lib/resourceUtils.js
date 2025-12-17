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
export function cleanupModal(overlay, handlers = {}, { destroy = true } = {}) {
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
      }
    } else if (overlay) {
      log.debug("Modal overlay has no parent, skipping chrome removal");
    }

    // Always destroy the overlay by default to avoid leaving detached actors.
    if (destroy && overlay?.destroy) {
      try {
        overlay.destroy();
      } catch (destroyError) {
        log.warn(
          `Error destroying modal overlay: ${
            destroyError?.message || destroyError
          }`
        );
      }
    }

    return true;
  } catch (e) {
    log.warn(`Error cleaning up modal: ${e.message}`);
    return false;
  }
}

/**
 * Remove a widget from GNOME Shell chrome (if present) and optionally destroy it.
 * Intended for non-modal chrome widgets (e.g. floating progress toasts).
 */
export function cleanupChromeWidget(widget, { destroy = true } = {}) {
  if (!widget) return false;

  try {
    try {
      if (widget.get_parent && widget.get_parent()) {
        Main.layoutManager.removeChrome(widget);
      }
    } catch (e) {
      log.warn("Failed to remove chrome widget:", e?.message || String(e));
    }

    if (destroy && widget.destroy) {
      try {
        widget.destroy();
      } catch (e) {
        log.warn("Failed to destroy chrome widget:", e?.message || String(e));
      }
    }

    return true;
  } catch (e) {
    log.warn("Failed to cleanup chrome widget:", e?.message || String(e));
    return false;
  }
}

/**
 * GNOME-modal teardown helper used by `RecordingDialog.close()`.
 *
 * IMPORTANT: This function intentionally mirrors the existing teardown logic
 * (removeChrome → fallback parent removal paths → destroy), because GNOME Shell
 * can be very sensitive across versions. Keep changes minimal.
 */
export function cleanupRecordingModal(modal, { isGNOME48Plus } = {}) {
  try {
    // Remove from chrome if it has a parent
    if (modal?.get_parent) {
      const parent = modal.get_parent();
      if (parent) {
        // Try the official method first
        try {
          Main.layoutManager.removeChrome(modal);
          log.debug("Modal removed from chrome successfully");
        } catch (chromeError) {
          log.debug(
            "Chrome removal failed, trying direct parent removal:",
            chromeError?.message || String(chromeError)
          );

          // For GNOME 48+, try a gentler approach first
          if (isGNOME48Plus) {
            try {
              // Try to hide first, then remove with delay
              if (modal.hide) modal.hide();
              // Do immediate removal instead of delayed
              try {
                parent.remove_child(modal);
                log.debug("Modal removed from parent immediately (GNOME 48+)");
              } catch (delayedError) {
                log.debug(
                  "Immediate parent removal failed:",
                  delayedError?.message || String(delayedError)
                );
              }
            } catch (gnome48Error) {
              log.debug(
                "GNOME 48+ specific removal failed:",
                gnome48Error?.message || String(gnome48Error)
              );
              // Fallback to direct removal
              try {
                parent.remove_child(modal);
                log.debug("Modal removed from parent directly (fallback)");
              } catch (parentError) {
                log.debug(
                  "Direct parent removal also failed:",
                  parentError?.message || String(parentError)
                );
              }
            }
          } else {
            // Standard fallback for older GNOME versions
            try {
              parent.remove_child(modal);
              log.debug("Modal removed from parent directly");
            } catch (parentError) {
              log.debug(
                "Direct parent removal also failed:",
                parentError?.message || String(parentError)
              );
            }
          }
        }
      }
    }

    // Finally, destroy the modal
    if (modal?.destroy) {
      try {
        modal.destroy();
        log.debug("Modal destroyed successfully");
      } catch (destroyError) {
        log.debug(
          "Modal destruction failed:",
          destroyError?.message || String(destroyError)
        );
      }
    }
  } catch (e) {
    log.warn("Delayed cleanup failed:", e?.message || String(e));
  }
}
