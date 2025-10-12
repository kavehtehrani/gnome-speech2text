# GNOME Speech2Text Service - OpenAI Backend

An alternative D-Bus service for the GNOME Speech2Text extension that uses the OpenAI API (compatible with OpenAI's API and whisper.cpp servers) instead of the local Whisper Python package.

## Overview

This service provides the same D-Bus interface as the original `gnome-speech2text-service` but uses the `openai` Python package to communicate with:
- OpenAI's cloud API
- A local whisper.cpp server
- Any OpenAI-compatible transcription API

## Features

- **Flexible Backend**: Connect to cloud or local transcription services
- **Type-Safe**: Full type hints with mypy strict mode support
- **Modern Development**: Uses uv for development, black/ruff/mypy for code quality
- **Compatible**: Maintains 1:1 D-Bus interface compatibility with the original service
- **Lightweight**: No large ML models loaded in memory

## Installation

### For Development (with uv)

```bash
cd service-openai

# First, install system dependencies (required for D-Bus and GLib bindings)
sudo apt install python3-dbus python3-gi  # Debian/Ubuntu
# OR
sudo dnf install python3-dbus python3-gobject  # Fedora

# Initialize and sync dependencies (uses system packages for dbus/gi)
uv venv --system-site-packages
uv sync --group dev

# Run development commands
uv run black .              # Format code
uv run ruff check .         # Lint code
uv run mypy .               # Type check code

# Run the service
uv run python src/gnome_speech2text_service_openai/service.py
```

### For Production (with pip)

```bash
cd service-openai

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Or install as package
pip install .

# Run the service
gnome-speech2text-service-openai
```

### System Dependencies

Same as the original service:
- `ffmpeg` - for audio recording
- `xdotool` - for text insertion (X11)
- `wl-clipboard` - for clipboard on Wayland
- `xclip` or `xsel` - for clipboard on X11
- `python3-dbus` and `python3-gi` - for D-Bus and GLib integration

## Configuration

The service is configured via environment variables:

### WHISPER_SERVER_URL
The base URL of your OpenAI-compatible API endpoint.

**Default**: `http://localhost:8080/v1`

**Examples**:
```bash
# Local whisper.cpp server
export WHISPER_SERVER_URL="http://localhost:8080/v1"

# OpenAI cloud API
export WHISPER_SERVER_URL="https://api.openai.com/v1"
export OPENAI_API_KEY="sk-..."

# Custom server
export WHISPER_SERVER_URL="http://192.168.1.100:9000/v1"
```

### WHISPER_MODEL
The model name to use for transcription.

**Default**: `base`

**Examples**:
```bash
# For whisper.cpp (model name doesn't matter, use what's loaded)
export WHISPER_MODEL="base"

# For OpenAI API
export WHISPER_MODEL="whisper-1"
```

### OPENAI_API_KEY
Required only when using OpenAI's cloud API. Not needed for local whisper.cpp servers.

```bash
export OPENAI_API_KEY="sk-your-api-key-here"
```

## Setting up whisper.cpp Server

For a local, private transcription server:

1. **Build whisper.cpp with server support**:
   ```bash
   git clone https://github.com/ggerganov/whisper.cpp
   cd whisper.cpp
   make server
   ```

2. **Download a model**:
   ```bash
   bash ./models/download-ggml-model.sh base
   ```

3. **Start the server**:
   ```bash
   ./server -m models/ggml-base.bin --host 0.0.0.0 --port 8080
   ```

4. **Test the connection**:
   ```bash
   curl http://localhost:8080/v1/models
   ```

## Usage

### Starting the Service

The service will be automatically started by D-Bus when the GNOME extension makes a request:

```bash
# Check if service is registered
dbus-send --session --dest=org.gnome.Shell.Extensions.Speech2Text \
  --print-reply /org/gnome/Shell/Extensions/Speech2Text \
  org.gnome.Shell.Extensions.Speech2Text.GetServiceStatus

# Manually start for debugging
gnome-speech2text-service-openai
```

### Development Commands

```bash
# Format code (black)
uv run black .

# Check code style and quality (ruff)
uv run ruff check .

# Fix auto-fixable issues
uv run ruff check --fix .

# Type check (mypy)
uv run mypy .

# Run all checks
uv run black --check . && uv run ruff check . && uv run mypy .
```

## D-Bus Interface

The service implements the `org.gnome.Shell.Extensions.Speech2Text` interface:

### Methods
- `StartRecording(duration: int, copy_to_clipboard: bool, preview_mode: bool) -> recording_id: str`
- `StopRecording(recording_id: str) -> success: bool`
- `CancelRecording(recording_id: str) -> success: bool`
- `TypeText(text: str, copy_to_clipboard: bool) -> success: bool`
- `GetServiceStatus() -> status: str`
- `CheckDependencies() -> (all_available: bool, missing: list[str])`

### Signals
- `RecordingStarted(recording_id: str)`
- `RecordingStopped(recording_id: str, reason: str)`
- `TranscriptionReady(recording_id: str, text: str)`
- `RecordingError(recording_id: str, error_message: str)`
- `TextTyped(text: str, success: bool)`

## Differences from Original Service

| Feature | Original Service | OpenAI Service |
|---------|-----------------|----------------|
| Backend | Whisper Python package | OpenAI API / whisper.cpp |
| Model Loading | Loads model into memory | API calls to external service |
| Memory Usage | High (model in RAM) | Low (no model in memory) |
| Processing | Local CPU/GPU | External server |
| Dependencies | torch, whisper | openai package only |
| Configuration | Model selected at startup | Environment variables |
| Network | None required | Requires API access |
| Type Hints | None | Full mypy strict mode |
| Dev Tools | None | black, ruff, mypy via uv |

## Architecture

```
┌─────────────────────────────────────────┐
│   GNOME Shell Extension                 │
│   (UI, Keyboard shortcuts)              │
└─────────────────┬───────────────────────┘
                  │ D-Bus Interface
                  │ org.gnome.Shell.Extensions.Speech2Text
┌─────────────────▼───────────────────────┐
│   Speech2Text Service (OpenAI)          │
│   - Audio recording (FFmpeg)            │
│   - Text typing (xdotool/ydotool)       │
│   - Clipboard (wl-copy/xclip)           │
│   - Transcription coordination          │
└─────────────────┬───────────────────────┘
                  │ OpenAI API (HTTPS)
                  │ POST /v1/audio/transcriptions
┌─────────────────▼───────────────────────┐
│   Transcription Backend                 │
│   - OpenAI Cloud API, OR                │
│   - whisper.cpp local server, OR        │
│   - Any OpenAI-compatible API           │
└─────────────────────────────────────────┘
```

## Troubleshooting

### Service won't start
- Check D-Bus registration: `dbus-send --session --dest=org.gnome.Shell.Extensions.Speech2Text --print-reply ...`
- Check logs: `journalctl --user -f | grep speech2text`
- Verify dependencies: run the service manually and check error messages

### Can't connect to whisper.cpp server
- Verify server is running: `curl http://localhost:8080/v1/models`
- Check `WHISPER_SERVER_URL` environment variable
- Check firewall settings if using remote server

### OpenAI API errors
- Verify `OPENAI_API_KEY` is set correctly
- Check API quota and billing
- Ensure `WHISPER_SERVER_URL` points to OpenAI: `https://api.openai.com/v1`

### Transcription is slow
- Use a smaller model with whisper.cpp (tiny, base)
- Use a faster server/hardware
- Check network latency if using remote API

## License

GPL-2.0-or-later (same as the original project)

## Credits

Based on the original `gnome-speech2text` project by Kaveh Tehrani.
