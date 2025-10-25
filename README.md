# GNOME Speech2Text

![GPLv3](https://img.shields.io/badge/License-GPLv3-yellow.svg)
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
D-Bus using the `org.gnome.Shell.Extensions.Speech2Text` interface. The service is **not bundled** with the extension
and must be installed separately as a dependency. This extension requires the external background
service [gnome-speech2text-service](https://pypi.org/project/gnome-speech2text-service/) to be installed. The first time
you run the extension you will get a popup to guide you through this setup.

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

### GNOME Extensions Store

[![Download from GNOME Extensions](https://img.shields.io/badge/Download%20from-GNOME%20Extensions-blue)](https://extensions.gnome.org/extension/8238/gnome-speech2text/)

1. Visit [GNOME Extensions](https://extensions.gnome.org/extension/8238/gnome-speech2text/) and click "Install"
2. The extension will automatically detect required system packages and let you know what you will need to install
3. Follow the setup dialog to install the required D-Bus service (automatically downloads from PyPI)
4. Restart GNOME Shell to complete the installation

### Manual Installation

For the manual installation experience, use the repository installer script:

```bash
git clone https://github.com/kavehtehrani/gnome-speech2text.git
cd gnome-speech2text
make install
```

### First Time Setup

The extension automatically detects if the required service is missing and provides a user-friendly setup dialog with
automatic or manual installation options.

Notes about installers and distributions:

- The extension bundle includes `src/install-service.sh`, a distro-agnostic service installer that only verifies system
  dependencies and installs the Python D-Bus service into `~/.local/share/gnome-speech2text-service`.
- You must install system packages yourself using your distro’s package manager. The setup dialog will list any missing
  packages.

#### IMPORTANT: Restart GNOME Shell After Installation

**For X11 sessions:**

1. Press `Alt+F2`
2. Type `r`
3. Press `Enter`

**For Wayland sessions:**

1. Log out of your current session
2. Log back in

### Alternative: Service-Only Installation

If you only want to manually install the D-Bus service (for development or advanced users):

```bash
# Install just the service from local source
./src/install-service.sh --local

# Or install from PyPI
./src/install-service.sh --pypi
```

The service is available as a Python package on
PyPI: [gnome-speech2text-service](https://pypi.org/project/gnome-speech2text-service/)

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
dbus-send --session --print-reply --dest=org.gnome.Shell.Extensions.Speech2Text /org/gnome/Shell/Extensions/Speech2Text org.gnome.Shell.Extensions.Speech2Text.GetServiceStatus

# Start the service manually
~/.local/share/gnome-speech2text-service/gnome-speech2text-service

# Check D-Bus service file
ls ~/.local/share/dbus-1/services/org.gnome.Shell.Extensions.Speech2Text.service
```

You can read more about the D-Bus service here: [D-Bus Service Documentation](./service/README.md).

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

### Gnome Extensions

You should be able to uninstall the extension directly using the GNOME Extensions tool.

### Manual Uninstallation

```bash
# Remove everything (extension + service)
make clean
```

## Privacy & Security

🔒 **100% Local Processing** - All speech recognition happens on your local machine. Nothing is ever sent to the cloud or
external servers. The extension uses OpenAI's Whisper model locally, ensuring privacy of your voice data.

## Development

### Building from Source

```bash
# Complete development setup (install extension + service + compile schemas)
make setup

# Check installation status
make status

# Clean installation (extension + d-bus service)
make clean
```

## License

This project is licensed under the GPLv3 - see the LICENSE file for details.

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
