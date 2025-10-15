# GNOME Speech2Text Service - Whisper.cpp Backend

An alternative D-Bus service for the GNOME Speech2Text extension that uses a local whisper.cpp server for speech recognition, eliminating the need for cloud APIs or loading large ML models in memory.

## Overview

This service provides the same D-Bus interface as the original `gnome-speech2text-service` but connects to a whisper.cpp server for transcription. It includes a custom `WhisperCppClient` that handles:
- Automatic server health checking
- Optional auto-start of whisper.cpp server
- Audio transcription via HTTP API

### Why whisper.cpp?

The whisper.cpp server provides:
- **Fast local inference** - C++ implementation of OpenAI's Whisper model
- **Low memory usage** - Efficient GGML quantized models
- **Privacy** - All processing happens locally, no cloud API needed
- **No Python ML dependencies** - No need for PyTorch, CUDA, etc.

### whisper.cpp API Support

This service uses whisper.cpp's native HTTP server API:
- ✅ `POST /inference` - Audio transcription
- ✅ `GET /health` - Server health checking

## Features

- **Local Processing**: All transcription happens on your machine via whisper.cpp
- **Auto-Start**: Automatically starts whisper.cpp server if not running
- **Type-Safe**: Full type hints with mypy strict mode support
- **Modern Development**: Uses uv for development, black/ruff/mypy for code quality
- **Compatible**: Maintains 1:1 D-Bus interface compatibility with the original service
- **Lightweight**: Minimal dependencies (only `requests` library needed)

## Installation

### For Users

**Option 1: Quick install** (from this source directory):
```bash
./install.sh
```

**Option 2: Manual install from PyPI** (if you don't have the source):
```bash
pipx install --system-site-packages gnome-speech2text-service-whispercpp
gnome-speech2text-whispercpp-setup
```

### For Development

Development uses `uv` for managing the environment and dependencies in editable mode.

**Prerequisites:**
```bash
# Install system dependencies (required for D-Bus and GLib bindings)
sudo apt install python3-dbus python3-gi  # Debian/Ubuntu
# OR
sudo dnf install python3-dbus python3-gobject  # Fedora

# Install uv if not already installed
pip install uv
```

**Setup:**
```bash
# Create venv with system site packages (for python3-dbus and python3-gi)
uv venv --system-site-packages

# Install package in editable mode + all dependencies (runtime + dev)
uv sync --group dev

# Register service with D-Bus
.venv/bin/gnome-speech2text-whispercpp-setup
```

**Development workflow:**
```bash
# Make changes to code in src/
# Changes are immediately active - just restart the service to test

# To restart the service:
pkill -f gnome-speech2text-service-whispercpp

# The service will auto-start when the extension calls it
# Or manually start it for debugging:
.venv/bin/gnome-speech2text-service-whispercpp

# View service logs
journalctl -f | grep -E 'gnome-speech2text|whispercpp'
```

**Code quality tools:**
```bash
# Format code
uv run black .

# Lint code
uv run ruff check .
uv run ruff check --fix .  # Auto-fix issues

# Type check
uv run mypy .

# Run all checks
uv run black --check . && uv run ruff check . && uv run mypy .
```

### System Dependencies

Required for the service to function:
- `ffmpeg` - for audio recording
- `xdotool` - for text insertion (X11 only)
- `wl-clipboard` - for clipboard on Wayland
- `xclip` or `xsel` - for clipboard on X11
- `python3-dbus` and `python3-gi` - for D-Bus and GLib integration (must be system packages)

## Configuration

The service is configured via environment variables:

### WHISPER_SERVER_URL
Base URL of your whisper.cpp server.

**Default**: `http://localhost:8080`

```bash
export WHISPER_SERVER_URL="http://localhost:8080"      # Local server
export WHISPER_SERVER_URL="http://192.168.1.100:8080"  # Remote server
```

### WHISPER_MODEL
Model to use when auto-starting the server. Only applies if `WHISPER_AUTO_START=true`.

**Default**: `small`

**Available**: `tiny`, `base`, `small`, `medium`, `large-v3`, `large-v3-turbo`, plus variants like `base.en`, `small-q5_1`, etc.

```bash
export WHISPER_MODEL="base"          # Faster, lower accuracy
export WHISPER_MODEL="small"         # Good balance (default)
export WHISPER_MODEL="large-v3-turbo"  # Best quality
```

### WHISPER_LANGUAGE
Language for auto-started server. Only applies if `WHISPER_AUTO_START=true`.

**Default**: `auto`

```bash
export WHISPER_LANGUAGE="auto"  # Auto-detect (default)
export WHISPER_LANGUAGE="en"    # English only
export WHISPER_LANGUAGE="es"    # Spanish only
```

### WHISPER_VAD_MODEL
VAD (Voice Activity Detection) model to filter silence from audio. Only applies if `WHISPER_AUTO_START=true`.

VAD helps prevent hallucinations (like "Thank you for watching") when processing silent audio by filtering out non-speech portions.

**Default**: `auto`

**Options**:
- `auto` - Auto-discover VAD models in `~/.cache/whisper.cpp/` (matches `ggml-silero-v*.bin`)
- `none` - Disable VAD
- Specific name like `silero-v5.1.2` - Use that model explicitly

```bash
export WHISPER_VAD_MODEL="auto"           # Auto-discover (default)
export WHISPER_VAD_MODEL="none"           # Disable VAD
export WHISPER_VAD_MODEL="silero-v5.1.2"  # Use specific model
```

### WHISPER_AUTO_START
Auto-start whisper.cpp server if not running.

**Default**: `true`

```bash
export WHISPER_AUTO_START="false"  # Connect to existing server only
export WHISPER_AUTO_START="true"   # Auto-start if needed (default)
```

## Setting up whisper.cpp

1. **Build whisper.cpp with server support**:
   ```bash
   git clone https://github.com/ggerganov/whisper.cpp
   cd whisper.cpp
   make server
   ```

2. **Download a transcription model**:
   ```bash
   # Download main model to ~/.cache/whisper.cpp/
   bash ./models/download-ggml-model.sh base ~/.cache/whisper.cpp
   ```

3. **(Optional but recommended) Download VAD model**:
   ```bash
   # Download VAD model to filter silence and prevent hallucinations
   bash ./models/download-vad-model.sh silero-v5.1.2 ~/.cache/whisper.cpp
   ```

4. **That's it!** The service will auto-start the whisper-server when needed.

   To verify the service can start the server:
   ```bash
   curl http://localhost:8080/health
   # Should return {"status":"ok"} after the service starts it
   ```

## Usage

### Starting the Service

The service will be automatically started by D-Bus when the GNOME extension makes a request:

```bash
# Check if service is registered
dbus-send --session --dest=org.gnome.Shell.Extensions.Speech2TextWhisperCpp \
  --print-reply /org/gnome/Shell/Extensions/Speech2TextWhisperCpp \
  org.gnome.Shell.Extensions.Speech2TextWhisperCpp.GetServiceStatus

# Manually start for debugging
gnome-speech2text-service-whispercpp
```


## D-Bus Interface

The service implements the `org.gnome.Shell.Extensions.Speech2TextWhisperCpp` interface (compatible with the original service):

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

| Feature | Original Service | Whisper.cpp Service |
|---------|-----------------|---------------------|
| Backend | Whisper Python package | whisper.cpp HTTP server |
| Model Loading | Loads model into memory | Separate server process |
| Memory Usage | High (model in service RAM) | Low (model in server RAM) |
| Processing | Local Python/CPU/GPU | Local C++/CPU/GPU (faster) |
| Dependencies | torch, whisper, numpy | requests only |
| Configuration | Model selected at startup | Environment variables |
| Network | None required | HTTP to localhost |
| Type Hints | Minimal | Full mypy strict mode |
| Dev Tools | None | black, ruff, mypy via uv |
| Server Management | N/A | Auto-start, health checks |

## Architecture

```
┌─────────────────────────────────────────┐
│   GNOME Shell Extension                 │
│   (UI, Keyboard shortcuts)              │
└─────────────────┬───────────────────────┘
                  │ D-Bus
┌─────────────────▼───────────────────────┐
│   Speech2Text Service (whisper.cpp)     │
│   - Audio recording (FFmpeg)            │
│   - Text typing (xdotool/ydotool)       │
│   - Clipboard (wl-copy/xclip)           │
│   - WhisperCppClient                    │
└─────────────────┬───────────────────────┘
                  │ HTTP (POST /inference, GET /health)
┌─────────────────▼───────────────────────┐
│   whisper.cpp Server                    │
│   - Fast C++ inference                  │
│   - GGML quantized models               │
│   - Local, private processing           │
└─────────────────────────────────────────┘
```

## Troubleshooting

### Service won't start
- Check D-Bus registration: `dbus-send --session --dest=org.gnome.Shell.Extensions.Speech2TextWhisperCpp --print-reply /org/gnome/Shell/Extensions/Speech2TextWhisperCpp org.gnome.Shell.Extensions.Speech2TextWhisperCpp.GetServiceStatus`
- Check logs: `journalctl --user -f | grep speech2text`
- Verify dependencies: run the service manually and check error messages

### Can't connect to whisper.cpp server
- Verify server is running: `curl http://localhost:8080/health` (should return `{"status":"ok"}`)
- Check `WHISPER_SERVER_URL` environment variable matches server address
- Check if server is listening: `netstat -tlnp | grep 8080`
- Start server manually: `whisper-server -m ~/.cache/whisper.cpp/ggml-base.bin -l auto`

### Transcription is slow
- Use a smaller model (tiny or base recommended for CPU)
- Use a machine with more CPU cores (whisper.cpp uses multiple threads)
- Consider using a GPU build of whisper.cpp if available
- Check CPU usage during transcription - high load indicates CPU bottleneck

### "Missing dependencies" or "Server not responding" errors
- The service uses the `/health` endpoint to check whisper.cpp server status
- Make sure your whisper.cpp server is recent enough to support the `/health` endpoint
- Update whisper.cpp: `cd whisper.cpp && git pull && make server`
- If auto-start fails, try starting the server manually first
- Check logs: `journalctl --user -f | grep whisper`

### Model download fails
- Ensure write access to `~/.cache/whisper.cpp/`
- Check disk space (models: 75MB to 3GB)
- Download manually using official script:
  ```bash
  git clone https://github.com/ggerganov/whisper.cpp
  cd whisper.cpp
  ./models/download-ggml-model.sh base ~/.cache/whisper.cpp
  ```

## Uninstallation

To completely remove the service:

```bash
# Step 1: Clean up service files (D-Bus, desktop entries, etc.)
gnome-speech2text-whispercpp-uninstall

# Step 2: Uninstall the pipx package
pipx uninstall gnome-speech2text-service-whispercpp
```

The uninstall command will:
- Stop any running service processes
- Remove D-Bus service file
- Remove desktop entry
- Remove old service directory (if exists)
- Provide instructions for pipx uninstall

## WhisperCppClient Module

This service includes a reusable `WhisperCppClient` class that can be used independently:

```python
from whisper_cpp_client import WhisperCppClient

# Initialize (auto-starts server if needed)
client = WhisperCppClient(
    base_url="http://localhost:8080",
    auto_start=True,
    model_file="base",
    language="auto",
    vad_model="auto"  # Auto-discover VAD model, or use "silero-v5.1.2" or None
)

# Check health
health = client.health_check()
print(health)  # {'status': 'ok'}

# Transcribe audio
with open("audio.wav", "rb") as f:
    text = client.audio.transcriptions.create(file=f)
    print(text)

# Cleanup
client.stop_server()
```

## License

GPL-2.0-or-later (same as the original project)

## Credits

Based on the original `gnome-speech2text` project by Kaveh Tehrani.
