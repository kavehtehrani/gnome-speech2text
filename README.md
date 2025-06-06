# GNOME Speech2Text

A GNOME Shell extension that adds speech-to-text functionality using OpenAI's Whisper model. Speak into your microphone and have your words automatically typed wherever your cursor is.

## Features

- 🎤 **Real-time Speech Recognition** using OpenAI Whisper
- ⌨️ **Automatic Text Insertion** at cursor location
- 🖱️ **Click to Record** from top panel microphone icon
- ⌨️ **Keyboard Shortcut** support (default: Ctrl+Shift+Alt+C)
- 🖥️ **Interactive Terminal Setup** with progress visibility
- 🔧 **Built-in Troubleshooting** tools in settings
- 🌍 **Multi-language Support** (depending on Whisper model)
- ⚙️ **Easy Configuration** through settings panel

## Requirements

- GNOME Shell 45 or later
- Python 3.8 or later
- FFmpeg
- xdotool
- Internet connection for initial model download (~200-500MB)

## Installation

### Option 1: Using the Install Script (Recommended)

1. Clone or download the repository:

```bash
git clone https://github.com/kavehtehrani/gnome-speech2text.git
cd gnome-speech2text
```

2. Run the install script:

```bash
./scripts/install.sh
```

3. Follow the interactive prompts in the terminal for Python environment setup

4. Restart GNOME Shell:
   - **X11**: Press Alt+F2, type 'r', press Enter
   - **Wayland**: Log out and log back in

### Option 2: From Local Package

1. Clone the repository and build the package:

```bash
git clone https://github.com/kavehtehrani/gnome-speech2text.git
cd gnome-speech2text
./scripts/package_zip.sh
```

2. Extract and install the built package:

```bash
cd dist
unzip gnome-speech2text@kaveh.page.zip
cd gnome-speech2text@kaveh.page
./scripts/install.sh
```

### Option 3: Manual Installation

1. Clone the repository:

```bash
git clone https://github.com/kavehtehrani/gnome-speech2text.git
cd gnome-speech2text
```

2. Copy extension files:

```bash
mkdir -p ~/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page
cp -r src/* ~/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page/
cp -r scripts ~/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page/
cp requirements.txt ~/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page/
```

3. Set up Python environment:

```bash
cd ~/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page
./scripts/setup_env.sh --interactive
```

4. Restart GNOME Shell and enable the extension

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

1. Right-click microphone icon → Settings
2. Click "Install/Reinstall Python Environment"
3. Follow terminal prompts to reinstall

### Missing Dependencies?

Install required system packages:

**Ubuntu/Debian:**

```bash
sudo apt-get install python3 python3-pip python3-venv ffmpeg xdotool
```

**Fedora:**

```bash
sudo dnf install python3 python3-pip ffmpeg xdotool
```

**Arch Linux:**

```bash
sudo pacman -S python python-pip ffmpeg xdotool
```

### Manual Python Environment Reset

```bash
cd ~/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page
rm -rf venv
./scripts/setup_env.sh --interactive
```

## Uninstallation

### Using the Uninstall Script

```bash
cd gnome-speech2text
./scripts/uninstall.sh
```

### Manual Uninstallation

1. Disable the extension in GNOME Extensions app
2. Remove extension directory:

```bash
rm -rf ~/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page
```

3. Clean up schemas:

```bash
rm -f ~/.local/share/glib-2.0/schemas/org.gnome.shell.extensions.gnome-speech2text.gschema.xml
glib-compile-schemas ~/.local/share/glib-2.0/schemas/
```

4. Restart GNOME Shell

## Development

### Building the Extension Package

```bash
./scripts/package_zip.sh
```

This creates `dist/gnome-speech2text@kaveh.page.zip` with all necessary files.

### Building Debian Package

```bash
./scripts/build_deb.sh
```

### Project Structure

```
gnome-speech2text/
├── src/                    # Extension source files
│   ├── extension.js        # Main extension code
│   ├── metadata.json       # Extension metadata
│   ├── whisper_typing.py   # Python speech recognition
│   ├── schemas/            # GSettings schemas
│   └── icons/              # Extension icons
├── scripts/                # Installation and build scripts
│   ├── install.sh          # Installation script
│   ├── uninstall.sh        # Uninstallation script
│   ├── setup_env.sh        # Python environment setup
│   ├── package_zip.sh      # Package creation
│   └── build_deb.sh        # Debian package builder
├── requirements.txt        # Python dependencies
└── README.md              # This file
```

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
