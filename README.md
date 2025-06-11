# GNOME Speech2Text

A GNOME Shell extension that adds speech-to-text functionality using
[OpenAI's Whisper](https://github.com/openai/whisper) model. Speak into your microphone
and have your words automatically typed wherever your cursor is.

I wrote this extension to mostly use with Cursor AI since speaking is much faster than typing. I'm on Ubuntu 24.04 and
GNOME Shell 46, and unfortunately couldn't find any existing extensions that did this, so I built this over a weekend half
vibe-learning GNOME extensions and half vice-coding the actual script.

![recording-modal](./images/recording-modal.png)

## Features

- 🎤 **Real-time Speech Recognition** using OpenAI Whisper
- ⌨️ **Automatic Text Insertion** at cursor location
- 🖱️ **Click to Record** from top panel microphone icon
- ⌨️ **Keyboard Shortcut** support (default: Ctrl+Shift+Alt+C)
- 🌍 **Multi-language Support** (depending on Whisper model)
- ⚙️ **Easy Configuration** through settings panel

**Note: This extension is currently only working on X11. If there's interest in Wayland support, I can look into it.**

## Requirements

- GNOME Shell 46 or later
- Python 3.8 or later
- FFmpeg
- xdotool

## System Requirements Installation

Before installing the extension, make sure you have the required system packages:

### Ubuntu/Debian

```bash
sudo apt update
sudo apt install python3 python3-pip python3-venv ffmpeg xdotool libglib2.0-dev
```

I have only tested this on Ubuntu 24.04, but it should work on any GNOME Shell 46+ distribution with the above packages installed.

## Installation

### Option 1: One-Line Install (Recommended)

Run this single command to download and install everything automatically:

```bash
wget -qO- https://raw.githubusercontent.com/kavehtehrani/gnome-speech2text/main/scripts/install.sh | bash
```

Then restart GNOME Shell:

- **X11**: Press Alt+F2, type 'r', press Enter
- **Wayland**: Log out and log back in

### Option 2: From Local Repository

If you prefer to clone the repository first:

```bash
git clone https://github.com/kavehtehrani/gnome-speech2text.git
cd gnome-speech2text
./scripts/install.sh
```

### Option 3: GNOME Extensions Website

[Pending Approval]

## First-Time Setup

When you first enable the extension, if the Python environment isn't set up:

1. **Automatic Setup**: A terminal window will open automatically
2. **Interactive Prompts**: Follow the on-screen instructions
3. **Progress Visibility**: Watch the installation progress in real-time
4. **Completion**: Terminal will show success message and next steps

## Usage

### Quick Start

1. **Click** the microphone icon in the top panel, or
2. **Press** the keyboard shortcut (default: Ctrl+Shift+Alt+C)
3. **Speak** when the recording dialog appears
4. **Press Enter** to process and insert text, or **Escape** to cancel

### Settings

Right-click the microphone icon → Settings to configure:

- Keyboard shortcuts
- Troubleshooting tools
- Manual Python environment reinstall

## Troubleshooting

### Extension Not Working?

1. First make sure the extension is enabled in GNOME Tweaks or Extensions app and has no error message.
2. Right-click microphone icon → Settings
3. Click "Install/Reinstall Python Environment"
4. Follow terminal prompts to reinstall

You can always read the logs in the terminal or journal to see if there are any errors by running:
`journalctl /usr/bin/gnome-shell -f`

## Development

### Building the Extension Package

```bash
./scripts/package_zip.sh
```

This creates `dist/gnome-speech2text@kaveh.page.zip` with all necessary files.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Reporting Issues

Please include:

- GNOME Shell version
- Operating system
- Error logs from terminal or journal
- Steps to reproduce

## Credits

- Uses OpenAI's Whisper for speech recognition
- Built for GNOME Shell extension framework
