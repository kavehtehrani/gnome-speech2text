# Whisper Typing GNOME Extension

A GNOME Shell extension that adds speech-to-text functionality using
[OpenAI's Whisper](https://github.com/openai/whisper) model. Speak into your microphone and have your words automatically typed out.

I wrote this extension to make it easier for me to use speech-to-text in my daily workflow, especially as I have become
a heavy user of Cursor AI and speech is much faster than typing. I'm on Ubuntu 24.04 LTS and GNOME 46, and unfortunately
Ubuntu doesn't have a native speech-to-text feature yet. This is my first GNOME extension, hopefully it's as bug-free and
useful as it can be but if you're having difficulties please feel free to open an issue on GitHub and I'll do my best to help you out.

## Features

- 🎤 One-click recording with visual feedback
- ⌨️ Automatic typing of transcribed text
- ⚡ Fast and accurate transcription using Whisper
- 🎯 Customizable keyboard shortcuts
- 🎨 Beautiful and intuitive UI

## Installation

Choose one of the following installation methods:

### Method 1: One-line Installation (Recommended)

The easiest way to install the extension. This script will handle everything automatically:

```bash
wget -qO- https://raw.githubusercontent.com/kavehtehrani/gnome-speech2text/main/install.sh | bash
```

### Method 2: Debian Package

If you prefer using a .deb package:

```bash
# Download the .deb file
wget https://github.com/kavehtehrani/gnome-speech2text/releases/latest/download/whisper-typing_1.0-1_all.deb

# Install it
sudo dpkg -i whisper-typing_1.0-1_all.deb
sudo apt-get install -f  # Install any missing dependencies
```

### Method 3: From GNOME Extensions Website

1. Visit [GNOME Extensions](https://extensions.gnome.org/extension/whisper-typing@kaveh.page/)
2. Click the "Install" button
3. Follow the on-screen instructions

### Method 4: Manual Installation

If you prefer to install manually:

1. Clone this repository:

   ```bash
   git clone https://github.com/kavehtehrani/gnome-speech2text.git
   cd gnome-speech2text
   ```

2. Run the setup script:

   ```bash
   ./setup_env.sh
   ```

3. Copy the extension to your GNOME extensions directory:

   ```bash
   cp -r whisper-typing@kaveh.page ~/.local/share/gnome-shell/extensions/
   ```

4. Restart GNOME Shell:

   - On X11: Press Alt+F2, type 'r' and press Enter
   - On Wayland: Log out and log back in

5. Enable the extension:
   ```bash
   gnome-extensions enable whisper-typing@kaveh.page
   ```

## Dependencies

- Python 3.8 or higher
- GNOME Shell 45 or higher
- FFmpeg (for audio processing)
- OpenAI Whisper (automatically installed by setup script)

## Usage

1. Click the microphone icon in the top panel or use the keyboard shortcut (default: Ctrl+Shift+Alt+C)
2. Speak into your microphone
3. Press Enter or click "Stop Recording" to process the audio
4. The transcribed text will be automatically typed out

### Keyboard Shortcuts

- **Start/Stop Recording**: Ctrl+Shift+Alt+C (customizable in settings)
- **Cancel Recording**: Escape key
- **Process Recording**: Enter key or Space

## Configuration

Click the extension icon and select "Settings" to:

- Change the keyboard shortcut
- View current settings
- Access additional options

## Troubleshooting

### Common Issues

1. **Extension not working after installation**

   - Ensure all dependencies are installed: `./setup_env.sh`
   - Check if the extension is enabled in GNOME Extensions
   - Restart GNOME Shell
     - On X11 press Alt+F2, type 'r' and press Enter
     - On Wayland, log out and log back in

2. **No audio input detected**

   - Check your microphone settings in GNOME Settings
   - Ensure your microphone is not being used by another application
   - Try selecting a different input device

3. **Transcription not working**
   - Ensure you have an active internet connection
   - Check if FFmpeg is properly installed
   - Verify Python dependencies are installed correctly

You can always check the log entries by running: `journalctl /usr/bin/gnome-shell -f`

### Getting Help

If you encounter any issues:

1. Check the [GitHub Issues](https://github.com/kavehtehrani/gnome-speech2text/issues)
2. Create a new issue with detailed information about your problem
3. Include your GNOME Shell version and system information

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
