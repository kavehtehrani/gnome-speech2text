#!/usr/bin/env python3
"""
D-Bus service setup and registration for GNOME Speech2Text WhisperCpp Service.

This module handles:
- D-Bus service file registration
- Desktop entry creation
- Installation verification
- Uninstallation and cleanup

Can be run standalone after pipx installation:
    gnome-speech2text-whispercpp-setup    # Setup
    gnome-speech2text-whispercpp-uninstall  # Cleanup before uninstalling
"""

import importlib.util
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional


def get_service_executable_path() -> Optional[str]:
    """Find the installed service executable path."""
    # Try to find the executable in PATH
    executable = shutil.which("gnome-speech2text-service-whispercpp")
    if executable:
        return str(Path(executable).resolve())

    # Check if we're running from a venv (development mode)
    # Look in the same bin directory as the Python interpreter
    python_bin = Path(sys.executable)
    if python_bin.parent.name == "bin":
        service_bin = python_bin.parent / "gnome-speech2text-service-whispercpp"
        if service_bin.exists():
            return str(service_bin)

    # Fallback: check common pipx installation location
    home = Path.home()
    pipx_bin = home / ".local" / "bin" / "gnome-speech2text-service-whispercpp"
    if pipx_bin.exists():
        return str(pipx_bin)

    return None


def setup_dbus_service() -> bool:
    """Register D-Bus service file."""
    executable_path = get_service_executable_path()
    if not executable_path:
        print("❌ Error: Could not find gnome-speech2text-whispercpp executable")
        print("   Make sure the service is installed via pipx")
        return False

    # D-Bus service directory
    dbus_service_dir = Path.home() / ".local" / "share" / "dbus-1" / "services"
    dbus_service_dir.mkdir(parents=True, exist_ok=True)

    # D-Bus service file path
    service_file = (
        dbus_service_dir / "org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service"
    )

    # D-Bus service file content
    service_content = f"""[D-BUS Service]
Name=org.gnome.Shell.Extensions.Speech2TextWhisperCpp
Exec={executable_path}
"""

    # Write D-Bus service file
    try:
        service_file.write_text(service_content)
        print(f"✅ D-Bus service file registered: {service_file}")
        return True
    except Exception as e:
        print(f"❌ Error: Failed to create D-Bus service file: {e}")
        return False


def setup_desktop_entry() -> bool:
    """Create desktop entry (hidden, for system integration)."""
    executable_path = get_service_executable_path()
    if not executable_path:
        return False

    # Desktop entry directory
    desktop_dir = Path.home() / ".local" / "share" / "applications"
    desktop_dir.mkdir(parents=True, exist_ok=True)

    # Desktop file path
    desktop_file = desktop_dir / "gnome-speech2text-service-whispercpp.desktop"

    # Desktop entry content
    desktop_content = f"""[Desktop Entry]
Type=Application
Name=GNOME Speech2Text Service (WhisperCpp)
Comment=D-Bus service for speech-to-text functionality using whisper.cpp
Exec={executable_path}
Icon=audio-input-microphone
StartupNotify=false
NoDisplay=true
Categories=Utility;
"""

    # Write desktop file
    try:
        desktop_file.write_text(desktop_content)
        print(f"✅ Desktop entry created: {desktop_file}")
        return True
    except Exception as e:
        print(f"❌ Error: Failed to create desktop entry: {e}")
        return False


def verify_dependencies() -> bool:
    """Verify system dependencies are installed."""
    print("\n🔍 Verifying system dependencies...")

    missing = []

    # Check FFmpeg
    if not shutil.which("ffmpeg"):
        missing.append("ffmpeg")
    else:
        print("  ✅ FFmpeg found")

    # Check for clipboard tools (session-type specific)
    session_type = os.environ.get("XDG_SESSION_TYPE", "")
    clipboard_found = False

    if session_type == "wayland":
        if shutil.which("wl-copy"):
            print("  ✅ wl-copy found (Wayland clipboard)")
            clipboard_found = True
        else:
            missing.append("wl-clipboard")
    else:
        # X11 or unknown - check for xclip/xsel
        for tool in ["xclip", "xsel"]:
            if shutil.which(tool):
                print(f"  ✅ {tool} found (X11 clipboard)")
                clipboard_found = True
                break

        if not clipboard_found:
            missing.append("xclip or xsel")

        # Check xdotool for X11 text insertion
        if shutil.which("xdotool"):
            print("  ✅ xdotool found (text insertion)")
        else:
            missing.append("xdotool (optional for text insertion)")

    # Check Python D-Bus bindings
    if importlib.util.find_spec("dbus") is not None:
        print("  ✅ python3-dbus found")
    else:
        missing.append("python3-dbus")

    # Check PyGObject
    try:
        import gi

        gi.require_version("GLib", "2.0")
        print("  ✅ python3-gi (PyGObject) found")
    except (ImportError, ValueError):
        missing.append("python3-gi")

    if missing:
        print("\n⚠️  Missing system dependencies:")
        for dep in missing:
            print(f"    - {dep}")
        print("\nInstall with:")
        print(f"  sudo apt install {' '.join(missing)}")
        return False

    print("\n✅ All system dependencies found")
    return True


def check_whisper_cpp() -> None:
    """Check if whisper.cpp is set up (informational only)."""
    print("\n🔍 Checking whisper.cpp setup...")

    # Check for whisper-server in PATH
    if shutil.which("whisper-server"):
        print("  ✅ whisper-server found in PATH")
    else:
        print("  ℹ️  whisper-server not found in PATH")

    # Check for models in cache
    cache_dir = Path.home() / ".cache" / "whisper.cpp"
    if cache_dir.exists():
        models = list(cache_dir.glob("ggml-*.bin"))
        if models:
            print(f"  ✅ Found {len(models)} whisper.cpp model(s) in cache:")
            for model in models[:3]:  # Show first 3
                print(f"     - {model.name}")
            if len(models) > 3:
                print(f"     ... and {len(models) - 3} more")
        else:
            print("  ⚠️  No models found in ~/.cache/whisper.cpp/")
            print("     Download with: whisper.cpp/models/download-ggml-model.sh base")
    else:
        print("  ℹ️  Cache directory not found: ~/.cache/whisper.cpp/")
        print("     The service can auto-start whisper-server if configured")


def main() -> int:
    """Main setup function."""
    print("=" * 60)
    print("  GNOME Speech2Text Service (WhisperCpp) - Setup")
    print("=" * 60)
    print()

    # Verify the service executable exists
    executable_path = get_service_executable_path()
    if not executable_path:
        print("❌ Error: Service executable not found")
        print("\nPlease install the service first:")
        print("  pipx install gnome-speech2text-service-whispercpp")
        return 1

    print(f"📦 Service executable: {executable_path}")
    print()

    # Setup D-Bus service
    print("🔧 Setting up D-Bus integration...")
    if not setup_dbus_service():
        return 1

    # Setup desktop entry
    if not setup_desktop_entry():
        return 1

    print()

    # Verify dependencies
    deps_ok = verify_dependencies()

    # Check whisper.cpp (informational)
    check_whisper_cpp()

    print()
    print("=" * 60)
    if deps_ok:
        print("✅ Setup completed successfully!")
    else:
        print("⚠️  Setup completed with warnings (missing dependencies)")
        print("   Install missing dependencies and run this again")
    print("=" * 60)
    print()
    print("The D-Bus service will start automatically when the")
    print("GNOME Shell extension requests it.")
    print()
    print("To manually test the service:")
    print(f"  {executable_path}")
    print()
    print("To verify D-Bus registration:")
    print(
        "  dbus-send --session --dest=org.gnome.Shell.Extensions.Speech2TextWhisperCpp \\"
    )
    print("    --print-reply /org/gnome/Shell/Extensions/Speech2TextWhisperCpp \\")
    print("    org.gnome.Shell.Extensions.Speech2TextWhisperCpp.GetServiceStatus")
    print()

    return 0 if deps_ok else 1


def remove_dbus_service() -> bool:
    """Remove D-Bus service file."""
    dbus_service_file = (
        Path.home()
        / ".local"
        / "share"
        / "dbus-1"
        / "services"
        / "org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service"
    )

    if dbus_service_file.exists():
        try:
            dbus_service_file.unlink()
            print(f"✅ Removed D-Bus service file: {dbus_service_file}")
            return True
        except Exception as e:
            print(f"❌ Error removing D-Bus service file: {e}")
            return False
    else:
        print(f"ℹ️  D-Bus service file not found: {dbus_service_file}")
        return True


def remove_desktop_entry() -> bool:
    """Remove desktop entry."""
    desktop_file = (
        Path.home()
        / ".local"
        / "share"
        / "applications"
        / "gnome-speech2text-service-whispercpp.desktop"
    )

    if desktop_file.exists():
        try:
            desktop_file.unlink()
            print(f"✅ Removed desktop entry: {desktop_file}")
            return True
        except Exception as e:
            print(f"❌ Error removing desktop entry: {e}")
            return False
    else:
        print(f"ℹ️  Desktop entry not found: {desktop_file}")
        return True


def remove_old_service_directory() -> bool:
    """Remove old-style service directory if it exists."""
    service_dir = (
        Path.home() / ".local" / "share" / "gnome-speech2text-service-whispercpp"
    )

    if service_dir.exists():
        try:
            shutil.rmtree(service_dir)
            print(f"✅ Removed old service directory: {service_dir}")
            return True
        except Exception as e:
            print(f"❌ Error removing service directory: {e}")
            return False
    else:
        print("ℹ️  Old service directory not found (probably installed via pipx)")
        return True


def stop_running_service() -> bool:
    """Attempt to stop any running service processes."""
    print("\n🔍 Checking for running service processes...")

    try:
        # Try to find running processes
        result = subprocess.run(
            ["pgrep", "-f", "gnome-speech2text-service-whispercpp"],
            capture_output=True,
            text=True,
        )

        if result.returncode == 0 and result.stdout.strip():
            pids = result.stdout.strip().split("\n")
            print(f"Found {len(pids)} running process(es)")

            for pid in pids:
                try:
                    subprocess.run(["kill", pid], check=True)
                    print(f"✅ Stopped process {pid}")
                except subprocess.CalledProcessError:
                    print(
                        f"⚠️  Could not stop process {pid} (may require manual intervention)"
                    )
            return True
        else:
            print("ℹ️  No running service processes found")
            return True
    except FileNotFoundError:
        print("ℹ️  pgrep not available, skipping process check")
        return True
    except Exception as e:
        print(f"⚠️  Error checking for processes: {e}")
        return True


def uninstall() -> int:
    """Main uninstall function - removes all service-related files."""
    print("=" * 60)
    print("  GNOME Speech2Text Service (WhisperCpp) - Uninstall")
    print("=" * 60)
    print()
    print("This will remove:")
    print("  • D-Bus service file")
    print("  • Desktop entry")
    print("  • Old service directory (if exists)")
    print("  • Stop any running service processes")
    print()
    print("⚠️  This will NOT uninstall the pipx package itself.")
    print("   Run 'pipx uninstall gnome-speech2text-service-whispercpp' after this.")
    print()

    # Ask for confirmation
    try:
        response = input("Continue with cleanup? [y/N]: ").strip().lower()
        if response not in ["y", "yes"]:
            print("\n❌ Uninstall cancelled")
            return 1
    except (KeyboardInterrupt, EOFError):
        print("\n\n❌ Uninstall cancelled")
        return 1

    print()

    # Stop running processes
    stop_running_service()

    # Remove files
    print("\n🧹 Removing service files...")
    remove_dbus_service()
    remove_desktop_entry()
    remove_old_service_directory()

    print()
    print("=" * 60)
    print("✅ Cleanup completed!")
    print("=" * 60)
    print()
    print("To complete the uninstallation, run:")
    print("  pipx uninstall gnome-speech2text-service-whispercpp")
    print()
    print("To reinstall later:")
    print("  pipx install gnome-speech2text-service-whispercpp")
    print("  gnome-speech2text-whispercpp-setup")
    print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
