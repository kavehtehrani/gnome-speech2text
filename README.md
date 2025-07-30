# GNOME Speech2Text

A GNOME Shell extension that adds speech-to-text functionality using [OpenAI's Whisper](https://github.com/openai/whisper) model. Speak into your microphone and have your words automatically typed wherever your cursor is.

This extension follows GNOME's architectural guidelines by using a D-Bus service for speech processing, making it lightweight and suitable for the GNOME Extensions store.

![recording-modal](./images/recording-modal.png)

## Architecture

The extension consists of two components:

1. **GNOME Extension** (lightweight UI) - Provides the panel button, keyboard shortcuts, and settings
2. **D-Bus Service** (background process) - Handles audio recording, speech transcription, and text insertion

This separation ensures the extension follows GNOME's best practices and security guidelines.

## Features

- 🎤 **Speech Recognition** using OpenAI Whisper
- ⌨️ **Automatic Text Insertion** at cursor location (only on X11)
- 🖱️ **Click to Record** from top panel microphone icon
- ⌨️ **Keyboard Shortcut** support (default: Ctrl+Shift+Alt+C)
- 🌍 **Multi-language Support** (depending on Whisper model)
- ⚙️ **Easy Configuration** through settings panel
- 🔒 **Privacy-First** - All processing happens locally
- 🖥️ **X11 and Wayland Support**

## Display Server Compatibility

### X11 (Full Support)

- ✅ Text insertion works perfectly
- ✅ Preview dialog with Insert/Copy options
- ✅ Skip preview option for instant text insertion
- ✅ Auto-skip preview option available for X11 sessions

### Wayland (Limited Support)

- ✅ Speech recognition works perfectly
- ⚠️ Text insertion has limitations due to Wayland security restrictions
- ✅ Copy to clipboard always works

## Requirements

### System Dependencies

- GNOME Shell 46 or later
- Python 3.8 or later
- FFmpeg (for audio recording)
- xdotool (for text insertion)
- One of: xclip, xsel, or wl-copy (for clipboard support)

### Installation of System Dependencies

Before installing the extension, make sure you have the required system packages:

#### Ubuntu/Debian

```bash
sudo apt update
sudo apt install python3 python3-pip python3-venv ffmpeg xdotool xclip
```

**Note:** This extension has been tested extensively on Ubuntu 24.04 / GNOME 46 / X11+Wayland. It should work on other GNOME Shell 46+ distributions with the above packages installed, but hasn't been tested on other platforms yet.

## Installation

### GNOME Extensions Store (Work in Progress)

🚧 This extension is currently under review for the GNOME Extensions website. Once approved, it will be available for easy installation directly from the website.

### Quick Installation (Recommended)

For the easiest installation experience, use our unified installer:

```bash
# Clone the repository
git clone https://github.com/kavehtehrani/gnome-speech2text.git
cd gnome-speech2text

# Run the installation script
./install.sh
```

This script will:

- Check system dependencies and guide you through installing any missing ones
- Install the D-Bus service automatically
- Install the GNOME extension and compile schemas
- Provide instructions for restarting GNOME Shell
- Give you clear next steps to start using the extension

### First Time Setup

The extension automatically detects if the required service is missing and provides a user-friendly setup dialog with automatic or manual installation options.

This will:

- Create a Python virtual environment
- Install required Python packages (OpenAI Whisper, etc.)
- Set up D-Bus service files

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

```bash
# View extension logs
journalctl /usr/bin/gnome-shell -f

# Check installation status
make status

# Verify schema compilation
make verify-schema

```

If the D-Bus service isn't working:

```bash
# Check service status
systemctl --user status speech2text-service

# Restart the service
systemctl --user restart speech2text-service

# View service logs
journalctl --user -u speech2text-service -f
```

## Usage

### Quick Start

1. **Click** the microphone icon in the top panel, or
2. **Press** the keyboard shortcut (default: Ctrl+Shift+Alt+C)
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

### Keyboard Shortcuts

- **Escape**: Cancel recording or close dialogs
- **Enter**: Stop recording and process audio
- **Default Hotkey**: Ctrl+Shift+Alt+C (customizable)

## Troubleshooting

### Extension Shows "Service Unavailable"

### Text Insertion Not Working

1. **On X11**: Ensure xdotool is installed
2. **On Wayland**: Text insertion is limited - use Copy to Clipboard instead
3. Check if target application accepts simulated keyboard input

### Viewing System Logs

```bash
# Extension logs
journalctl /usr/bin/gnome-shell -f

# Service logs
journalctl --user -u speech2text-service -f

# Or check service output directly
systemctl --user status speech2text-service
```

## Uninstallation

### Remove Extension


```bash
# Remove everything (extension + service)
make clean
```

## Privacy & Security

🔒 **100% Local Processing** - All speech recognition happens on your local machine. Nothing is ever sent to the cloud or external servers. The extension uses OpenAI's Whisper model locally, ensuring privacy of your voice data.

## Development

### Building from Source

```bash
# Complete development setup (install + compile schemas + restart)
make setup

# Development install only (no restart)
make dev-install

# Build distribution package
make package

# Check installation status
make status

# Clean installation
make clean
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open issues.

### Reporting Issues

Please include:

- GNOME Shell version (`gnome-shell --version`)
- Operating system and version
- Extension logs (`journalctl /usr/bin/gnome-shell`)
- Service logs (`journalctl --user -u speech2text-service`)
- Steps to reproduce the issue
