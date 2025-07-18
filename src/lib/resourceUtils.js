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
    if (handlers.clickHandlerId) {
      safeDisconnect(overlay, handlers.clickHandlerId, "click handler");
    }
    if (handlers.keyPressHandlerId) {
      safeDisconnect(overlay, handlers.keyPressHandlerId, "key press handler");
    }

    // Remove from layout manager
    if (overlay && overlay.get_parent()) {
      Main.layoutManager.removeChrome(overlay);
      console.log("Modal overlay removed from chrome");
    }

    return true;
  } catch (e) {
    console.log(`Error cleaning up modal: ${e}`);
    return false;
  }
}
