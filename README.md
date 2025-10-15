# GNOME Speech2Text

![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)
![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black)
![GNOME](https://img.shields.io/badge/GNOME-4A90D9?style=flat&logo=gnome&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Python](https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white)
![D-Bus](https://img.shields.io/badge/D--Bus-000000?style=flat&logo=dbus&logoColor=white)
![Whisper](https://img.shields.io/badge/Whisper-412991?style=flat&logo=openai&logoColor=white)
[![Download from GNOME Extensions](https://img.shields.io/badge/Download%20from-GNOME%20Extensions-blue)](https://extensions.gnome.org/extension/8238/gnome-speech2text/)

A GNOME Shell extension that adds speech-to-text functionality
using OpenAI's automated speech recognition [Whisper](https://github.com/openai/whisper) model. Speak into your microphone and have your words transcribed with the option to automatically insert at your cursor (on X11 only).

![recording-modal](./images/recording-modal.png)

## Features

- 🎤 **Speech Recognition** using OpenAI Whisper
- 🖱️ **Click to Record** from top panel microphone icon
- ⌨️ **Keyboard Shortcut** support (default: Alt+Super+R)
- 🌍 **Multi-language Support** (depending on Whisper model)
- 🔒 **Privacy-First** - All processing happens locally
- ⌨️ **Automatic Text Insertion** at cursor location (only on X11)

## Architecture

The extension consists of two components:

1. **GNOME Extension** (lightweight UI) - Provides the panel button, keyboard shortcuts, and settings
2. **D-Bus Service** (separate package) - Handles audio recording, speech transcription, and text insertion

This separation ensures the extension follows GNOME's best practices and security guidelines.

**Important for GNOME Extensions Store**: This extension follows GNOME's architectural guidelines by using a separate
D-Bus service for speech processing. The extension itself is lightweight and communicates with the external service over
D-Bus using the `org.gnome.Shell.Extensions.Speech2TextWhisperCpp` interface. The service is **not bundled** with the extension
and must be installed separately as a dependency. This extension requires the external background
service [gnome-speech2text-service-whispercpp](https://pypi.org/project/gnome-speech2text-service-whispercpp/) to be installed. The first time
you run the extension you will get a notification with installation instructions.

## Requirements

### System Dependencies

- **GNOME Shell 46 or later** (tested up to GNOME 48)
- **Python 3.8 or later** (with pip)
- **python3-venv** (for virtual environment creation)
- **python3-dbus** (for D-Bus integration)
- **python3-gi** (PyGObject for GLib integration)
- **FFmpeg** (for audio recording)
- **xdotool** (for text insertion on X11 only)
- **Clipboard tools**: xclip/xsel (X11) or wl-clipboard (Wayland)

If you are missing any of the required dependencies the installation script will let you know.

## Installation

The extension requires two components:
1. **GNOME Extension** (UI) - from GNOME Extensions store
2. **WhisperCpp Service** (backend) - installed separately via pipx

### Step 1: Install System Dependencies

**Ubuntu/Debian:**
```bash
sudo apt install python3 pipx ffmpeg python3-dbus python3-gi wl-clipboard xdotool xclip
```

**Fedora:**
```bash
sudo dnf install python3 pipx ffmpeg python3-dbus python3-gobject wl-clipboard xdotool xclip
```

### Step 2: Install WhisperCpp Service

**Option A: Using the installer script (recommended)**
```bash
# From source
./service-whispercpp/install.sh

# Or one-liner from GitHub
curl -fsSL https://raw.githubusercontent.com/kavehtehrani/gnome-speech2text/main/service-whispercpp/install.sh | bash
```

**Option B: Manual installation with pipx**
```bash
pipx install --system-site-packages gnome-speech2text-service-whispercpp
gnome-speech2text-whispercpp-setup
```

For service configuration and troubleshooting, see [service-whispercpp/README.md](./service-whispercpp/README.md).

### Step 3: Install GNOME Extension

**From GNOME Extensions Store (recommended):**

[![Download from GNOME Extensions](https://img.shields.io/badge/Download%20from-GNOME%20Extensions-blue)](https://extensions.gnome.org/extension/8238/gnome-speech2text/)

Visit [GNOME Extensions](https://extensions.gnome.org/extension/8238/gnome-speech2text/) and click "Install"

**From source (for development):**
```bash
git clone https://github.com/kavehtehrani/gnome-speech2text.git
cd gnome-speech2text
make install
```

### First Time Setup

If you install the extension before the service, it will show a helpful notification with installation instructions when you try to use it.

#### IMPORTANT: Restart GNOME Shell After Installation

**For X11 sessions:**

1. Press `Alt+F2`
2. Type `r`
3. Press `Enter`

**For Wayland sessions:**

1. Log out of your current session
2. Log back in

#### Troubleshooting Installation

If the extension doesn't appear in GNOME Extensions:

First make sure 1- extension is enabled in the GNOME Extensions, and 2- you have restarted your shell already. Otherwise, proceed to troubleshoot:

```bash
# View extension logs
journalctl -f | grep -E "(gnome-shell|gnome-speech2text-service|speech2text|ffmpeg|org\.gnome\.Speech2Text)"

# Check installation status
make status

# Verify schema compilation
make verify-schema

```

If the D-Bus service isn't working:

```bash
# Check if service is running
dbus-send --session --print-reply --dest=org.gnome.Shell.Extensions.Speech2TextWhisperCpp /org/gnome/Shell/Extensions/Speech2TextWhisperCpp org.gnome.Shell.Extensions.Speech2TextWhisperCpp.GetServiceStatus

# Start the service manually
gnome-speech2text-service-whispercpp

# Check D-Bus service file
ls ~/.local/share/dbus-1/services/org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service

# Re-run setup if needed
gnome-speech2text-whispercpp-setup
```

You can read more about the D-Bus service here: [D-Bus Service Documentation](./service-whispercpp/README.md).

## Usage

### Quick Start

1. **Click** the microphone icon in the top panel, or
2. **Press** the keyboard shortcut (default: Alt+Super+R)
3. **Speak** when the recording dialog appears
4. **Review** the transcribed text in the preview dialog
5. **Click Insert** to type the text, or **Copy** to clipboard

### Settings

Right-click the microphone icon to access:

- **Settings**: Configure extension preferences
  - **Keyboard Shortcuts**: Customize the recording hotkey
  - **Recording Duration**: Set maximum recording time (10-300 seconds)
  - **Copy to Clipboard**: Automatically copy transcribed text
  - **Skip Preview (X11 only)**: Instantly insert text without preview
- **Setup Guide**: View service installation instructions anytime

## Troubleshooting

### GNOME Shell Crashes

If you experience GNOME Shell crashes when using the extension, use the crash analysis script:

```bash
# After a crash, run the debug script
./debug-crash.sh
```

This script will analyze system logs and generate a detailed crash report. Choose option 1 (last 30 minutes) after
experiencing a crash. The script will create a timestamped file with all relevant crash information.

### Text Insertion Not Working

1. **On X11**: Ensure xdotool is installed
2. **On Wayland**: Text insertion is limited - use Copy to Clipboard instead
3. Check if target application accepts simulated keyboard input

## Uninstallation

**Step 1: Remove the extension**
```bash
# Via GNOME Extensions tool (recommended)
# Or manually:
rm -rf ~/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page
```

**Step 2: Remove the WhisperCpp service**
```bash
# Clean up service files first (removes D-Bus files, desktop entries, etc.)
gnome-speech2text-whispercpp-uninstall

# Then uninstall the pipx package
pipx uninstall gnome-speech2text-service-whispercpp
```

**Development: Use Makefile**
```bash
make uninstall  # Removes both extension and service files
```

## Privacy & Security

🔒 **100% Local Processing** - All speech recognition happens on your local machine. Nothing is ever sent to the cloud or
external servers. The extension uses OpenAI's Whisper model locally, ensuring privacy of your voice data.

## Development

### Quick Start

```bash
# Clone the repository
git clone https://github.com/kavehtehrani/gnome-speech2text.git
cd gnome-speech2text

# Install prerequisites
sudo apt install python3-dbus python3-gi  # Debian/Ubuntu
# OR
sudo dnf install python3-dbus python3-gobject  # Fedora

# Install service in development mode and extension
make install-service-dev
make install

# Check installation status
make status
```

### Extension Development

Work on the GNOME Shell extension (UI, keyboard shortcuts, etc.):

```bash
# Make changes to extension code in src/

# Reinstall extension
make install

# Restart GNOME Shell (X11: Alt+F2, type 'r', Enter)
# Or log out/in on Wayland

# Check for errors
journalctl -f | grep speech2text
```

### Service Development

Work on the Python D-Bus service (speech processing, etc.):

See **[service-whispercpp/README.md](./service-whispercpp/README.md)** for detailed service development instructions.

Quick reference:
```bash
# Make changes to service code in service-whispercpp/src/

# Restart the service (changes are live in development mode)
pkill -f gnome-speech2text-service-whispercpp

# Service auto-starts when extension needs it
# Or manually start for debugging:
cd service-whispercpp
.venv/bin/gnome-speech2text-service-whispercpp

# Check service logs
journalctl -f | grep -E 'gnome-speech2text|whispercpp'
```

### Makefile Targets

```bash
make install-service-dev   # Install service in development mode (uv)
make install-service-prod  # Install service from PyPI (production)
make install               # Install extension
make uninstall             # Remove extension and service
make clean                 # Remove build artifacts
make package               # Create extension package for GNOME Extensions store
make status                # Check installation status
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open issues.

### Reporting Issues

Please include:

- GNOME Shell version (`gnome-shell --version`)
- Operating system and version (`lsb_release -a`)
- Session type (`echo $XDG_SESSION_TYPE`)
- Extension logs (`journalctl /usr/bin/gnome-shell | grep speech2text`)
- Service logs (`journalctl --user -u speech2text-service`)
- **For crashes**: Run `./debug-crash.sh` and include the generated report
- Steps to reproduce the issue
