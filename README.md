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

- 🎤 **Real-time Speech Recognition** using OpenAI Whisper
- ⌨️ **Automatic Text Insertion** at cursor location
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

### Wayland (Limited Support)

- ✅ Speech recognition works perfectly
- ⚠️ Text insertion has limitations due to Wayland security restrictions
- ✅ Copy to clipboard always works
- ✅ Auto-skip preview option available for X11 sessions

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

### Seamless Installation from GNOME Extensions Store (Recommended)

When the extension is available on the GNOME Extensions website, installation will be incredibly simple:

1. **Install extension** from GNOME Extensions website
2. **Enable the extension** - microphone icon appears in top panel
3. **Click microphone or use keyboard shortcut** - first-run setup dialog appears automatically
4. **Click "🚀 Automatic Installation"** - the extension handles everything for you!
5. **Restart GNOME Shell** and you're ready to go!

The extension only shows the setup dialog when you actually try to use it for the first time - no intrusive popups on login!

The extension automatically detects if the required service is missing and provides a user-friendly setup dialog with:

- 🚀 **Automatic Installation**: One-click installation that opens terminal and runs all commands
- ✅ Clear step-by-step instructions for manual installation
- ✅ One-click copy buttons for terminal commands
- 🔗 Clickable links to detailed documentation
- ✅ No cryptic error messages

### Manual Installation

#### Step 1: Install the D-Bus Service

The speech processing service must be installed separately:

```bash
# Clone the repository
git clone https://github.com/kavehtehrani/gnome-speech2text.git
cd gnome-speech2text

# Install the D-Bus service
cd speech2text-service
./install.sh
```

This will:

- Install Python dependencies in a virtual environment
- Set up the D-Bus service files
- Start the service automatically

#### Step 2: Install the GNOME Extension

##### Option A: From GNOME Extensions Website

[Link will be available after store approval]

##### Option B: Manual Installation

```bash
# From the repository root
make setup
```

This will install the extension, compile the GSettings schemas, and restart GNOME Shell automatically.

#### Step 3: Enable the Extension

1. Open GNOME Extensions app or GNOME Tweaks
2. Enable "GNOME Speech2Text"
3. **If service not installed**: A setup dialog will appear with installation instructions
4. **If service installed**: The microphone icon will appear in your top panel

#### Step 4: Restart GNOME Shell (if needed)

- **X11**: Press Alt+F2, type 'r', press Enter
- **Wayland**: Log out and log back in

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

The D-Bus service is not running. Check service status:

```bash
# Check if service is running
systemctl --user status speech2text-service

# Start the service manually
systemctl --user start speech2text-service

# Enable auto-start
systemctl --user enable speech2text-service
```

### Audio Recording Issues

1. Check microphone permissions:

   ```bash
   # Test microphone access
   ffmpeg -f pulse -i default -t 3 test.wav
   ```

2. Verify audio dependencies:
   ```bash
   # Check if PulseAudio/PipeWire is running
   pulseaudio --check -v
   ```

### Text Insertion Not Working

1. **On X11**: Ensure xdotool is installed
2. **On Wayland**: Text insertion is limited - use Copy to Clipboard instead
3. Check if target application accepts simulated keyboard input

### Python Dependencies Issues

Reinstall the service environment:

```bash
cd speech2text-service
./install.sh --force
```

### Viewing Logs

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
rm -rf ~/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page
```

### Remove D-Bus Service

```bash
cd speech2text-service
./install.sh --uninstall
```

## Privacy & Security

🔒 **100% Local Processing** - All speech recognition happens on your local machine. Nothing is ever sent to the cloud or external servers. The extension uses OpenAI's Whisper model locally, ensuring complete privacy of your voice data.

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

### D-Bus Service Development

```bash
cd speech2text-service

# Install in development mode
./install.sh --dev

# Test D-Bus interface
python test-dbus.py
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Reporting Issues

Please include:

- GNOME Shell version (`gnome-shell --version`)
- Operating system and version
- Extension logs (`journalctl /usr/bin/gnome-shell`)
- Service logs (`journalctl --user -u speech2text-service`)
- Steps to reproduce the issue

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for detailed version history and changes.
