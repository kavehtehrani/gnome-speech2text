# GNOME Speech2Text Service

A D-Bus service that provides speech-to-text functionality for the GNOME Shell Speech2Text extension.

## Overview

This service handles the actual speech recognition processing using OpenAI's Whisper API. It runs as a D-Bus service and communicates with the GNOME Shell extension to provide seamless speech-to-text functionality.

## Features

- **Real-time speech recognition** using OpenAI Whisper
- **D-Bus integration** for seamless desktop integration
- **Audio recording** with configurable duration
- **Multiple output modes** (clipboard, text insertion, preview)
- **Error handling** and recovery
- **Session management** for multiple concurrent recordings

## Installation

### System Dependencies

This service requires several system packages to be installed:

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install -y \
    python3 python3-pip python3-venv python3-dbus python3-gi \
    ffmpeg xdotool xclip wl-clipboard
```

### Service Installation

The service can be installed via pip:

```bash
pip install gnome-speech2text-service
```

Or from the source repository:

```bash
cd service/
pip install .
```

### D-Bus Registration

After installation, you need to register the D-Bus service and desktop entry. Recommended options:

1. Using the repository (local source install)

```bash
# From the repo root
./src/install-service.sh --local
```

2. Using the bundled installer (PyPI install)

```bash
# From the repo root
./src/install-service.sh --pypi
```

The installer will:

- Create a per-user virtual environment under `~/.local/share/gnome-speech2text-service/venv`
- Install the `gnome-speech2text-service` package
- Register the D-Bus service at `~/.local/share/dbus-1/services/org.gnome.Shell.Extensions.Speech2Text.service`
- Create a desktop entry at `~/.local/share/applications/gnome-speech2text-service.desktop`

## Usage

### Starting the Service

The service is D-Bus activated and starts automatically when requested by the extension. You can also start it manually:

```bash
# If the entry point is on PATH (pip install)
gnome-speech2text-service

# Or via the per-user wrapper created by the installer
~/.local/share/gnome-speech2text-service/gnome-speech2text-service
```

### Configuration

The service uses OpenAI's API for speech recognition. You'll need to:

1. Get an OpenAI API key from [OpenAI Platform](https://platform.openai.com/)
2. Configure it through the GNOME Shell extension preferences

### D-Bus Interface

The service provides the following D-Bus methods:

- `StartRecording(duration, copy_to_clipboard, preview_mode)` → `recording_id`
- `StopRecording(recording_id)` → `success`
- `GetRecordingStatus(recording_id)` → `status, progress`
- `CancelRecording(recording_id)` → `success`

Signals:

- `TranscriptionReady(recording_id, text)`
- `RecordingProgress(recording_id, progress)`
- `RecordingError(recording_id, error_message)`

## Requirements

- **Python**: 3.8 or higher
- **System**: Linux with D-Bus support
- **Desktop**: GNOME Shell (tested on GNOME 46+)

## License

This project is licensed under the GPL-2.0-or-later license. See the LICENSE file for details.

## Contributing

Contributions are welcome! Please see the main repository for contribution guidelines:
https://github.com/kavehtehrani/gnome-speech2text
