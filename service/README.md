# Speech2Text Service

A D-Bus service that provides speech-to-text functionality for the GNOME Shell Speech2Text extension.

## Overview

This service handles the actual speech recognition processing using OpenAI's Whisper model locally. It runs as a D-Bus service and communicates with the GNOME Shell extension to provide seamless speech-to-text functionality.

## Features

- **Real-time speech recognition** using OpenAI Whisper
- **D-Bus integration** for seamless desktop integration
- **Audio recording** with configurable duration
- **Multiple output modes** (clipboard, text insertion, preview)
- **Error handling** and recovery
- **Session management** for multiple concurrent recordings

## Installation

### System Dependencies

This service requires several system packages to be installed (e.g. ffmpeg, clipboard tools). See the main [README.md](../README.md) for the complete list of system dependencies.

### Service Installation

The service is available on PyPI and is typically installed into a per-user virtual environment by the extension’s installer.

```bash
pip install speech2text-extension-service
```

**PyPI Package**: [speech2text-extension-service](https://pypi.org/project/speech2text-extension-service/)

Or from the source repository:

```bash
cd service/
pip install .
```

### D-Bus Registration

After installation, you need to register the D-Bus service and desktop entry. The installer script (`install-service.sh`) handles this automatically.

#### Basic Installation

1. **Using the repository (local source install)**

```bash
# From the repo root
./service/install-service.sh --local
```

2. **Using the bundled installer (PyPI install)**

```bash
# From the repo root
./service/install-service.sh --pypi
```

#### Configuration Options

The installer supports several options to configure the Whisper model and processing device:

**Whisper Model Selection**

Use `--whisper-model <name>` to specify which Whisper model to use. Available models:
- `tiny` - Fastest, least accurate 
- `base` - Good balance (default)
- `small` - Better accuracy 
- `medium` - High accuracy 
- `large` - Best accuracy
- Variants: `tiny.en`, `base.en`, `small.en`, `medium.en` (English-only, faster)

The model name is recorded for UI display purposes. The actual model files are downloaded automatically by Whisper when first used.

**Device Selection (CPU/GPU)**

- **CPU mode (default)**: Recommended for most users. Easier installation and better compatibility across systems.
- **GPU mode**: Use `--gpu` flag to install GPU-enabled ML dependencies. On Linux, this typically requires NVIDIA CUDA support.

**Example Installations**

```bash
# Default: base model, CPU mode
./service/install-service.sh --pypi

# Medium model with GPU support
./service/install-service.sh --pypi --gpu --whisper-model medium

# Small English-only model, CPU mode
./service/install-service.sh --pypi --whisper-model small.en

# Large model with GPU (requires significant VRAM)
./service/install-service.sh --pypi --gpu --whisper-model large
```

**Other Options**

- `--python <cmd>`: Use a specific Python interpreter (e.g., `--python python3.12`)
- `--non-interactive`: Run without user prompts (auto-accept defaults)
- `--service-version <version>`: Install a specific service package version from PyPI
- `--help`: Show all available options

**What the Installer Does**

The installer will:

- Create a per-user virtual environment under `~/.local/share/speech2text-extension-service/venv`
- Install the `speech2text-extension-service` package with appropriate ML dependencies
- Register the D-Bus service at `~/.local/share/dbus-1/services/org.gnome.Shell.Extensions.Speech2Text.service`
- Create a desktop entry at `~/.local/share/applications/speech2text-extension-service.desktop`
- Record installation metadata in `~/.local/share/speech2text-extension-service/install-state.conf` (model, device, timestamp)

**Note**: To change the model or device after installation, you must re-run the installer with the new options. The installer rebuilds the virtual environment from scratch, ensuring clean dependency management.

## Usage

### Starting the Service

The service is D-Bus activated and starts automatically when requested by the extension. You can also start it manually:

```bash
# If the entry point is on PATH (pip install)
speech2text-extension-service

# Or via the per-user wrapper created by the installer
~/.local/share/speech2text-extension-service/speech2text-extension-service
```

### Configuration

The service uses OpenAI's Whisper model locally for speech recognition. No API key is required. All processing happens on your local machine for complete privacy.

**Model and Device Configuration**

The Whisper model and processing device (CPU/GPU) are configured during service installation using the installer flags (see [D-Bus Registration](#d-bus-registration) above). The extension reads this configuration from `~/.local/share/speech2text-extension-service/install-state.conf` to display the current settings in the setup dialog.

To change the model or device, reinstall the service with the desired options. The installer will rebuild the virtual environment with the appropriate dependencies.

### D-Bus Interface

The service provides the following D-Bus interface (stable; used by the GNOME extension):

Methods:

- `StartRecording(duration, copy_to_clipboard, preview_mode)` → `recording_id`
- `StopRecording(recording_id)` → `success`
- `CancelRecording(recording_id)` → `success`
- `TypeText(text, copy_to_clipboard)` → `success`
- `GetServiceStatus()` → `status`
- `CheckDependencies()` → `all_available, missing_dependencies[]`

Signals:

- `RecordingStarted(recording_id)`
- `RecordingStopped(recording_id, reason)`
- `TranscriptionReady(recording_id, text)`
- `RecordingError(recording_id, error_message)`
- `TextTyped(text, success)`

## Requirements

- **Python**: 3.8–3.13 (Python 3.14+ not supported yet)
- **System**: Linux with D-Bus support
- **Desktop**: GNOME Shell (tested on GNOME 46+)

## License

This project is licensed under the GPL-3.0-or-later license. See the LICENSE file for details.

## Contributing

Contributions are welcome! Please see the main repository for contribution guidelines:
https://github.com/kavehtehrani/speech2text-extension
