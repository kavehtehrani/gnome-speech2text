# GNOME Speech2Text Extension - Development Guide

## Overview
A GNOME Shell extension that provides speech-to-text functionality using OpenAI's Whisper model. Users can speak into their microphone and have text automatically typed at the cursor location or copied to clipboard.

## Core Functionality
- **Real-time Speech Recognition**: Uses OpenAI Whisper (base model) running locally
- **Text Insertion**: Automatically types transcribed text at cursor position (X11 only)
- **Clipboard Support**: Can copy transcribed text to clipboard
- **Preview Mode**: Shows transcription before insertion
- **Wayland/X11 Support**: Adapts behavior based on display server

## Project Structure

```
gnome-speech2text/
├── src/                          # Extension source code
│   ├── extension.js              # Main extension file (1770 lines)
│   ├── metadata.json             # Extension metadata
│   ├── whisper_typing.py         # Python backend for speech processing
│   ├── lib/                      # Modular JavaScript utilities
│   │   ├── constants.js          # Color constants and styles
│   │   ├── focusUtils.js         # Window focus management
│   │   ├── recordingDialog.js    # Recording UI dialog
│   │   ├── resourceUtils.js      # Resource cleanup utilities
│   │   ├── setupUtils.js         # Environment setup utilities
│   │   └── uiUtils.js            # UI component creation helpers
│   ├── schemas/                  # GSettings schema
│   │   └── org.gnome.shell.extensions.gnome-speech2text.gschema.xml
│   └── icons/                    # Extension icons
│       └── microphone-symbolic.svg
├── scripts/                      # Installation and setup scripts
│   ├── install.sh                # Main installation script
│   ├── setup_env.sh              # Python environment setup
│   ├── uninstall.sh              # Extension removal
│   └── package_zip.sh            # Packaging for distribution
├── images/                       # Documentation images
│   └── recording-modal.png
├── requirements.txt              # Python dependencies
├── README.md                     # User documentation
└── LICENSE                       # MIT license
```

## Architecture

### Frontend (GNOME Shell Extension)
- **Main Extension** (`src/extension.js`): Core extension logic with panel button, settings UI, and recording management
- **Recording Dialog** (`src/lib/recordingDialog.js`): Modal UI for recording states (recording, processing, preview)
- **Utilities**: Modular helper functions for UI, focus management, and resource cleanup

### Backend (Python)
- **Speech Processing** (`src/whisper_typing.py`): Handles audio recording (ffmpeg), transcription (Whisper), and text typing (xdotool)

### Key Components

#### Extension States
1. **Idle**: Extension loaded, ready to start recording
2. **Recording**: Audio being captured via ffmpeg
3. **Processing**: Whisper transcribing the audio
4. **Preview**: Showing transcribed text to user (unless skipped)
5. **Typing**: Inserting text at cursor location

#### Display Server Handling
- **X11**: Full functionality including automatic text insertion
- **Wayland**: Limited to clipboard copying due to security restrictions

## Development Environment

### System Requirements
- GNOME Shell 46+
- Python 3.8+
- FFmpeg (audio recording)
- xdotool (text insertion on X11)
- wl-copy/xclip (clipboard support)

### Python Dependencies
```
openai-whisper
torch
```

### Setup Commands
```bash
# Install system dependencies (Ubuntu/Debian)
sudo apt install python3 python3-pip python3-venv ffmpeg xdotool libglib2.0-dev

# Install extension
./scripts/install.sh

# Restart GNOME Shell
# X11: Alt+F2, type 'r', Enter
# Wayland: Log out and back in
```

### Build/Test Commands
- **Install Environment**: `./scripts/setup_env.sh`
- **Manual Testing**: Use microphone icon in top panel or Ctrl+Shift+Alt+C
- **Logs**: `journalctl /usr/bin/gnome-shell -f`
- **Uninstall**: `./scripts/uninstall.sh`

## Key Features

### Settings (Configurable)
- **Keyboard Shortcut**: Default Ctrl+Shift+Alt+C (customizable)
- **Recording Duration**: 10 seconds to 5 minutes (default: 1 minute)
- **Clipboard Copying**: Optional automatic clipboard copy
- **Skip Preview** (X11 only): Insert text immediately without preview dialog

### File Locations
- **Extension Directory**: `~/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page/`
- **Python Environment**: `{extension-dir}/venv/`
- **Settings Schema**: System-wide GSettings

## Code Patterns

### Error Handling
- Graceful cleanup on process termination
- Signal handling for recording interruption
- Fallback methods for clipboard access

### UI Patterns
- Modal dialogs with backdrop
- Styled buttons with hover effects
- Real-time status updates during processing

### Process Management
- Python subprocess spawning with pipe communication
- Signal-based communication (SIGUSR1 for graceful stop)
- Async process monitoring with GLib callbacks

## Testing Notes
- Extension heavily tested on Ubuntu 24.04 / GNOME 46 / X11
- Wayland support is functional but more finicky
- First-time setup downloads ~200-500MB (Whisper model + PyTorch)
- Recording duration configurable for different use cases

## Privacy & Security
- 100% local processing (no cloud/external servers)
- OpenAI Whisper runs locally on user's machine
- No network connections required after initial setup
- Voice data never leaves the local system

## Common Issues
- **Setup Failures**: Usually due to missing system dependencies
- **Recording Issues**: Often related to audio permissions or missing ffmpeg
- **Text Insertion Failures**: Check xdotool installation and X11 vs Wayland
- **Permission Errors**: May need to restart GNOME Shell after installation