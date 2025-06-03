# Whisper Typing GNOME Extension

Adds a microphone button to your GNOME panel to run Whisper AI and transcribe speech to text.

## System Requirements

- GNOME Shell 46 or later
- Python 3.8 or higher
- pip3
- ffmpeg
- Internet connection (for initial model download)

## Installation

### Method 1: Direct Installation

1. Download the latest release from the [GNOME Extensions website](https://extensions.gnome.org/extension/XXXX/whisper-typing/)
2. Extract the downloaded file to `~/.local/share/gnome-shell/extensions/`
3. Run the setup script:
   ```bash
   cd ~/.local/share/gnome-shell/extensions/whisper_typing@kaveh.dev
   ./setup_env.sh
   ```
4. Restart GNOME Shell (Alt+F2, type 'r' and press Enter)
5. Enable the extension using GNOME Extensions app or:
   ```bash
   gnome-extensions enable whisper_typing@kaveh.dev
   ```

### Method 2: Using the .deb Package

1. Download the .deb package from the releases page
2. Install using your package manager:
   ```bash
   sudo dpkg -i whisper-typing_1.0_all.deb
   sudo apt-get install -f  # Install any missing dependencies
   ```
3. Enable the extension using GNOME Extensions app or:
   ```bash
   gnome-extensions enable whisper_typing@kaveh.dev
   ```

## Usage

1. Click the microphone icon in your GNOME panel
2. Speak into your microphone
3. The transcribed text will be automatically typed into the active text field

## Troubleshooting

If you encounter any issues:

1. Check that all system requirements are met
2. Ensure the extension is enabled in GNOME Extensions
3. Check the extension logs:
   ```bash
   journalctl -f -o cat /usr/bin/gnome-shell
   ```
4. Verify your microphone is working and has proper permissions

## Building from Source

If you want to build the extension from source:

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/whisper-typing.git
   cd whisper-typing
   ```
2. Run the setup script:
   ```bash
   ./setup_env.sh
   ```
3. Follow the installation steps above

## License

This project is licensed under the MIT License - see the LICENSE file for details.
