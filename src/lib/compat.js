import Meta from "gi://Meta";

// Meta.is_wayland_compositor() was removed in GNOME 50 together with the
// X11 backend, so a missing function means the session is always Wayland.
// On GNOME 46-49 the real value is returned (X11 sessions still exist there).
export function isWaylandCompositor() {
  return Meta.is_wayland_compositor?.() ?? true;
}
