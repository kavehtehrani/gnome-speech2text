# Speech2Text

![GPLv3](https://img.shields.io/badge/License-GPLv3-yellow.svg)
![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black)
![GNOME](https://img.shields.io/badge/GNOME-4A90D9?style=flat&logo=gnome&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Python](https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white)
![D-Bus](https://img.shields.io/badge/D--Bus-000000?style=flat&logo=dbus&logoColor=white)
![Whisper](https://img.shields.io/badge/Whisper-412991?style=flat&logo=openai&logoColor=white)
[![Download from GNOME Extensions](https://img.shields.io/badge/Download%20from-GNOME%20Extensions-blue)](https://extensions.gnome.org/extension/8238/speech2text-extension/)

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
- 🔄 **Non-blocking Mode** - Continue working while transcription processes in the background

## Architecture

The extension consists of two components:

1. **GNOME Extension** (lightweight UI) - Provides the panel button, keyboard shortcuts, and settings
2. **D-Bus Service** (separate package) - Handles audio recording, speech transcription, and text insertion

**Important for GNOME Extensions Store**: This extension follows GNOME's architectural guidelines by using a separate
D-Bus service for speech processing. The extension itself is lightweight and communicates with the external service over
D-Bus using the `org.gnome.Shell.Extensions.Speech2Text` interface. The service is **not bundled** with the extension
and must be installed separately as a dependency. This extension requires the external background
service [speech2text-extension-service](https://pypi.org/project/speech2text-extension-service/) to be installed.
See [Service Installation](Service-Installation) below.

## Requirements

### System Dependencies

- **GNOME Shell 46 or later** (tested up to GNOME 49)
- **Python 3.8–3.13** (Python 3.14+ not supported yet due to ML dependency compatibility)
- **python3-venv** (for virtual environment creation)
- **D-Bus Python library** is installed inside the service virtualenv (`dbus-next`; no system `python3-dbus` / `python3-gi` required)
- **FFmpeg** (for audio recording)
- **xdotool** (for text insertion on X11 only)
- **Clipboard tools**: xclip/xsel (X11) or wl-clipboard (Wayland)

If you are missing any of the required dependencies the installation script will let you know.

## Installation

### GNOME Extensions Store

[![Download from GNOME Extensions](https://img.shields.io/badge/Download%20from-GNOME%20Extensions-blue)](https://extensions.gnome.org/extension/8238/speech2text-extension/)

1. Visit [GNOME Extensions](https://extensions.gnome.org/extension/8238/speech2text-extension/) and click "Install"
2. The extension will automatically detect required system packages and let you know what you will need to install
3. Follow the setup dialog to install the required D-Bus service (automatically downloads from PyPI)
4. Restart GNOME Shell to complete the installation

### Manual Installation

For the manual installation experience, use the repository installer script:

```bash
git clone https://github.com/kavehtehrani/speech2text-extension.git
cd speech2text-extension
make install
```

#### IMPORTANT: Restart GNOME Shell After Installation

**For X11 sessions:**

1. Press `Alt+F2`
2. Type `r`
3. Press `Enter`

**For Wayland sessions:**

1. Log out of your current session
2. Log back in

### Service Installation

The D-Bus service has to be manually installed per GNOME's guidelines. For most people, the 'base' model and 'cpu' processing is sufficient and most compatible across platforms.

```bash
curl -sSL https://raw.githubusercontent.com/kavehtehrani/speech2text-extension/refs/heads/main/service/install-service.sh | bash -s -- --pypi --non-interactive --service-version 1.2.0 --whisper-model base
```

## Whisper model & CPU/GPU settings

Speech2Text uses OpenAI Whisper locally. You configure model/device by (re)installing the D-Bus service with the appropriate installer flags:

- **Whisper model**: `tiny`, `base`, `small`, `medium`, `large`, and variants (including `*.en`, `large-v2`, `large-v3`). See [here](https://github.com/openai/whisper) for more info.
- **Device**:
  - **CPU (default)**: recommended for most users; easier install and compatibility.
  - **GPU**: attempts to use an accelerator backend via PyTorch. On Linux this usually means **NVIDIA CUDA**.
    (Advanced users may be able to use other backends depending on their PyTorch build.)

Important: switching CPU/GPU will require reinstalling the background service so the correct ML dependencies are installed.

For instance if you wanted to run the whisper model 'medium' and use 'gpu' processing, then install the service with:

```bash
curl -sSL https://raw.githubusercontent.com/kavehtehrani/speech2text-extension/refs/heads/main/service/install-service.sh | bash -s -- --pypi --non-interactive --service-version 1.2.0 --gpu --whisper-model medium
```

Notes about installers and distributions:

- This repository includes `service/install-service.sh`, a distro-agnostic service installer that only verifies system
  dependencies and installs the Python D-Bus service into `~/.local/share/speech2text-extension-service`.
- You must install system packages yourself using your distro’s package manager. The setup dialog will list any missing
  packages.
  - Note: the setup dialog’s **Automatic Install** uses `--pypi` (PyPI). If you are developing locally from a git clone,
    use `./service/install-service.sh --local` instead.
  - Note: the installer supports **GPU mode** via `--gpu`.

The service is available as a Python package on
PyPI: [speech2text-extension-service](https://pypi.org/project/speech2text-extension-service/)

### Upgrading from older versions (CUDA/NVIDIA pip packages cleanup)

Older versions of the service installer could pull GPU-related _pip packages_ (e.g. `nvidia-*`) into the service’s
virtual environment. New versions default to **CPU-only** PyTorch wheels unless you explicitly choose GPU mode.

If you are using **CPU mode** and want to remove legacy GPU-related pip packages, simply re-run the installer
(from the setup dialog or manually). The installer rebuilds the service virtual environment from scratch, so it will
remove any old GPU-related pip packages from the service venv automatically.

## Usage

### Quick Start

1. **Click** the microphone icon in the top panel, or
2. **Press** the keyboard shortcut (default: Alt+Super+R)
3. **Speak** when the recording dialog appears
4. **Review** the transcribed text in the preview dialog
5. **Click Insert** to type the text, or **Copy** to clipboard

#### Non-blocking Mode

With non-blocking transcription enabled:

1. Record your speech as usual
2. The modal closes immediately when recording stops
3. A "..." appears next to the microphone icon while processing
4. Click the notification when transcription is ready to review/copy

## Troubleshooting

If the extension doesn't appear in GNOME Extensions:

First make sure 1- extension is enabled in the GNOME Extensions, and 2- you have restarted your shell already. Otherwise, proceed to troubleshoot:

```bash
# View extension logs
journalctl -f | grep -E "(gnome-shell|speech2text-extension-service|speech2text|ffmpeg|org\.gnome\.Speech2Text|Whisper|transcrib)"

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
~/.local/share/speech2text-extension-service/speech2text-extension-service

# Check D-Bus service file
ls ~/.local/share/dbus-1/services/org.gnome.Shell.Extensions.Speech2Text.service
```

You can read more about the D-Bus service here: [D-Bus Service Documentation](./service/README.md).

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

Contributions are welcome! Please feel free to submit a pull request or open issues.

### Reporting Issues

Please include:

- GNOME Shell version (`gnome-shell --version`)
- Operating system and version (`lsb_release -a`)
- Session type (`echo $XDG_SESSION_TYPE`)
- Extension logs (`journalctl /usr/bin/gnome-shell | grep speech2text`)
- Service logs (`journalctl --user -u speech2text-service`)
- **For crashes**: Run `./debug-crash.sh` and include the generated report
- Steps to reproduce the issue
