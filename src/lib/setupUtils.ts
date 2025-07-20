import Gio from "gi://Gio";
import GLib from "gi://GLib";

export function runSetupScript(extensionPath: string): boolean {
  try {
    const setupScript = `${extensionPath}/scripts/setup_env.sh`;
    const file = Gio.File.new_for_path(setupScript);

    // Make sure the script is executable
    const info = file.query_info(
      "unix::mode",
      Gio.FileQueryInfoFlags.NONE,
      null
    );
    const mode = info.get_attribute_uint32("unix::mode");
    file.set_attribute_uint32(
      "unix::mode",
      mode | 0o111,
      Gio.FileQueryInfoFlags.NONE,
      null
    );

    // Run the setup script
    const [success, pid] = GLib.spawn_async(
      null, // working directory
      ["bash", setupScript], // command and args
      null, // envp
      GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
      null // child_setup
    );

    if (!success) {
      throw new Error("Failed to start setup script");
    }

    // Wait for the process to complete
    GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, (pid, status) => {
      if (status !== 0) {
        log("Setup script failed with status: " + status);
      } else {
        log("Setup script completed successfully");
      }
      GLib.spawn_close_pid(pid);
    });

    return true;
  } catch (e) {
    log("Error running setup script: " + e.message);
    return false;
  }
}

export function checkSetupStatus(extensionPath: string): { needsSetup: boolean; message?: string } {
  const venvPath = `${extensionPath}/venv`;
  const venvDir = Gio.File.new_for_path(venvPath);

  // Check if virtual environment exists
  if (!venvDir.query_exists(null)) {
    return {
      needsSetup: true,
      message: "Python environment not found. Running setup...",
    };
  }

  return { needsSetup: false };
}
