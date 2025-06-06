# GNOME Speech2Text

A GNOME Shell extension that adds speech-to-text functionality using OpenAI's Whisper model. Speak into your microphone and have your words automatically typed out.

## Features

- Speech-to-text conversion using OpenAI's Whisper model
- Automatic typing of recognized text
- Support for multiple languages
- Configurable keyboard shortcuts
- Easy installation and setup

## Requirements

- GNOME Shell 45 or later
- Python 3.8 or later
- FFmpeg
- Internet connection for initial model download

## Installation

### Using the Install Script

1. Download the extension:

```bash
wget https://github.com/kaveh/gnome-speech2text/releases/latest/download/gnome-speech2text@kaveh.page.zip
```

2. Run the install script:

```bash
./scripts/install.sh
```

### Manual Installation

1. Download the extension:

```bash
wget https://github.com/kaveh/gnome-speech2text/releases/latest/download/gnome-speech2text@kaveh.page.zip
```

2. Extract the extension:

```bash
unzip gnome-speech2text@kaveh.page.zip -d ~/.local/share/gnome-shell/extensions/
```

3. Make the setup script executable:

```bash
chmod +x ~/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page/setup_env.sh
```

4. Run the setup script:

```bash
~/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page/setup_env.sh
```

5. Restart GNOME Shell:

   - Press Alt+F2
   - Type 'r' and press Enter

6. Enable the extension:
   - Open GNOME Extensions
   - Find "GNOME Speech2Text" and enable it

## Uninstallation

### Using the Uninstall Script

Run the uninstall script:

```bash
./scripts/uninstall.sh
```

### Manual Uninstallation

1. Disable the extension:

   - Open GNOME Extensions
   - Find "GNOME Speech2Text" and disable it

2. Remove the extension directory:

```bash
rm -rf ~/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page
```

3. Restart GNOME Shell:
   - Press Alt+F2
   - Type 'r' and press Enter

## Configuration

The extension can be configured through the GNOME Extensions app:

- Language selection
- Keyboard shortcuts
- Model size
- Other settings

## Building from Source

1. Clone the repository:

```bash
git clone https://github.com/kaveh/gnome-speech2text.git
cd gnome-speech2text
```

2. Build the extension:

```bash
./scripts/build_deb.sh
```

3. Install the package:

```bash
sudo dpkg -i dist/gnome-speech2text_1.0-1_all.deb
sudo apt-get install -f
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
