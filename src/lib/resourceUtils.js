import * as Main from "resource:///org/gnome/shell/ui/main.js";

// Helper to safely disconnect event handlers
export function safeDisconnect(actor, handlerId, handlerName = "handler") {
  try {
    if (actor && handlerId) {
      actor.disconnect(handlerId);
      console.log(`Disconnected ${handlerName} (ID: ${handlerId})`);
      return true;
    }
  } catch (e) {
    console.log(`Error disconnecting ${handlerName}: ${e}`);
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
        console.log("Modal overlay removed from chrome successfully");
      } catch (removeError) {
        console.log(`Error removing modal from chrome: ${removeError.message}`);
        // Try alternative cleanup if removeChrome fails
        try {
          if (overlay.destroy) {
            overlay.destroy();
            console.log("Modal overlay destroyed as fallback");
          }
        } catch (destroyError) {
          console.log(
            `Error destroying modal overlay: ${destroyError.message}`
          );
        }
      }
    } else if (overlay) {
      console.log("Modal overlay has no parent, skipping chrome removal");
    }

    return true;
  } catch (e) {
    console.log(`Error cleaning up modal: ${e.message}`);
    return false;
  }
}
