import * as Main from "resource:///org/gnome/shell/ui/main.js";
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
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

/**
 * Read the installed service configuration from install-state.conf.
 * This file is created by the official installer script.
 *
 * @returns {Object} Configuration object with:
 *   - known: boolean - true if install-state.conf exists and was readable
 *   - model: string|null - Whisper model name (e.g. "base", "medium")
 *   - device: string|null - Device type ("cpu" or "gpu")
 *   - installedAt: string|null - ISO timestamp when service was installed
 */
export function readInstalledServiceConfig() {
  try {
    const path = `${getServiceDir()}/install-state.conf`;
    const file = Gio.File.new_for_path(path);
    if (!file.query_exists(null)) return { known: false };
    const [ok, contents] = file.load_contents(null);
    if (!ok) return { known: false };

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

    return {
      known: true,
      model: kv.model || null,
      device: kv.device || null,
      installedAt: kv.installed_at || null,
    };
  } catch (e) {
    log.debug(
      "Failed to read installed service config (non-fatal):",
      e?.message || String(e)
    );
    return { known: false };
  }
}

/**
 * Center a widget on a monitor after a brief delay (to allow size allocation).
 * Returns a timeout ID that should be cleaned up on close.
 *
 * @param {St.Widget} widget - The widget to center
 * @param {Object} monitor - The monitor object (from Main.layoutManager.primaryMonitor)
 * @param {Object} options - Options
 * @param {number} options.fallbackWidth - Fallback width if widget reports 0
 * @param {number} options.fallbackHeight - Fallback height if widget reports 0
 * @param {number|null} options.existingTimeoutId - Existing timeout to clear first
 * @param {function} options.onComplete - Optional callback when centering is done
 * @returns {number} The timeout ID (store this and clean up with GLib.Source.remove)
 */
export function centerWidgetOnMonitor(
  widget,
  monitor,
  {
    fallbackWidth = 400,
    fallbackHeight = 300,
    existingTimeoutId = null,
    onComplete = null,
    sourceName = "speech2text-extension: centerWidgetOnMonitor",
  } = {}
) {
  if (existingTimeoutId) {
    GLib.Source.remove(existingTimeoutId);
  }

  const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
    let [width, height] = widget.get_size();
    if (width === 0) width = fallbackWidth;
    if (height === 0) height = fallbackHeight;

    const centerX = Math.round((monitor.width - width) / 2);
    const centerY = Math.round((monitor.height - height) / 2);
    widget.set_position(centerX, centerY);

    if (onComplete) onComplete();
    return false; // GLib.SOURCE_REMOVE
  });

  GLib.Source.set_name_by_id(timeoutId, sourceName);

  return timeoutId;
}

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
    if (widget.get_parent?.()) {
      Main.layoutManager.removeChrome(widget);
    }
    if (destroy && widget.destroy) widget.destroy();
    return true;
  } catch (e) {
    log.warn("Failed to cleanup chrome widget:", e?.message || String(e));
    return false;
  }
}

/**
 * Get the service installation directory path.
 * @returns {string} Path to ~/.local/share/speech2text-extension-service
 */
export function getServiceDir() {
  return `${GLib.get_home_dir()}/.local/share/speech2text-extension-service`;
}

/**
 * Get the service binary executable path.
 * @returns {string} Path to the speech2text-extension-service binary
 */
export function getServiceBinaryPath() {
  return `${getServiceDir()}/speech2text-extension-service`;
}

/**
 * Show a modal dialog with standard positioning, centering, and focus handling.
 * This is the common pattern used by SetupDialog, SettingsDialog, and ShortcutCapture.
 *
 * @param {St.Widget} overlay - The modal overlay widget
 * @param {St.Widget} dialogWidget - The dialog container widget to center
 * @param {Object} options - Configuration options
 * @param {number} options.fallbackWidth - Fallback width if widget reports 0
 * @param {number} options.fallbackHeight - Fallback height if widget reports 0
 * @param {number|null} options.existingTimeoutId - Existing center timeout to clear first
 * @param {function} options.onComplete - Optional callback when centering completes
 * @returns {number} The center timeout ID (store for cleanup)
 */
export function showModalDialog(overlay, dialogWidget, options = {}) {
  Main.layoutManager.addTopChrome(overlay);

  const monitor = Main.layoutManager.primaryMonitor;
  overlay.set_position(monitor.x, monitor.y);
  overlay.set_size(monitor.width, monitor.height);

  const timeoutId = centerWidgetOnMonitor(dialogWidget, monitor, {
    fallbackWidth: options.fallbackWidth || 600,
    fallbackHeight: options.fallbackHeight || 400,
    existingTimeoutId: options.existingTimeoutId || null,
    onComplete: () => {
      if (options.onComplete) options.onComplete();
    },
  });

  overlay.grab_key_focus();
  overlay.set_reactive(true);

  return timeoutId;
}

/**
 * Close a modal dialog with standard cleanup (timeout removal and modal cleanup).
 *
 * @param {St.Widget|null} overlay - The modal overlay widget (may be null)
 * @param {Object} handlers - Event handler IDs to disconnect
 * @param {number|null} handlers.keyPressHandler - Key press handler ID
 * @param {number|null} handlers.keyReleaseHandler - Key release handler ID (optional)
 * @param {number|null} handlers.clickHandler - Click handler ID
 * @param {number|null} centerTimeoutId - Center timeout ID to remove
 */
export function closeModalDialog(overlay, handlers, centerTimeoutId) {
  if (centerTimeoutId) {
    GLib.Source.remove(centerTimeoutId);
  }

  if (overlay) {
    cleanupModal(overlay, handlers);
  }
}

/**
 * Set up standard modal event handlers (Escape key to close, click outside to close).
 * Returns handler IDs that should be passed to closeModalDialog() for cleanup.
 *
 * @param {St.Widget} overlay - The modal overlay widget
 * @param {function} onClose - Callback function to call when dialog should close
 * @returns {Object} Handler IDs: { keyPressHandler, clickHandler }
 */
export function setupModalEventHandlers(overlay, onClose) {
  const keyPressHandler = overlay.connect("key-press-event", (actor, event) => {
    const keyval = event.get_key_symbol();
    if (keyval === Clutter.KEY_Escape) {
      onClose();
      return Clutter.EVENT_STOP;
    }
    return Clutter.EVENT_PROPAGATE;
  });

  const clickHandler = overlay.connect("button-press-event", (actor, event) => {
    if (event.get_source() === overlay) {
      onClose();
      return Clutter.EVENT_STOP;
    }
    return Clutter.EVENT_PROPAGATE;
  });

  return { keyPressHandler, clickHandler };
}

/**
 * GNOME-modal teardown helper used by `RecordingDialog.close()`.
 *
 * IMPORTANT: This function intentionally mirrors the existing teardown logic
 * (removeChrome → fallback parent removal paths → destroy), because GNOME Shell
 * can be very sensitive across versions. Keep changes minimal.
 */
export function cleanupRecordingModal(modal, { isGNOME48Plus } = {}) {
  if (!modal) return;

  // Remove from chrome if it has a parent
  const parent = modal.get_parent?.();
  if (parent) {
    try {
      Main.layoutManager.removeChrome(modal);
      log.debug("Modal removed from chrome successfully");
    } catch (chromeError) {
      log.debug(
        "Chrome removal failed, trying direct parent removal:",
        chromeError?.message || String(chromeError)
      );
      // NOTE: keep fallback removal; GNOME Shell behavior can vary across versions.
      if (isGNOME48Plus) modal.hide?.();
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

  // Finally, destroy the modal
  try {
    modal.destroy?.();
    log.debug("Modal destroyed successfully");
  } catch (destroyError) {
    log.debug(
      "Modal destruction failed:",
      destroyError?.message || String(destroyError)
    );
  }
}
