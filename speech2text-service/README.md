# GNOME Speech2Text D-Bus Service

This is the D-Bus service component for the GNOME Speech2Text extension. It provides speech-to-text functionality using OpenAI's Whisper model through a D-Bus interface.

## Overview

The GNOME Speech2Text system is split into two components:

1. **GNOME Extension** (lightweight UI) - Provides the panel button, keyboard shortcuts, and settings
2. **D-Bus Service** (this package) - Handles audio recording, speech transcription, and text insertion

This separation follows GNOME's architectural guidelines and makes the extension suitable for submission to the GNOME Extensions store.

## D-Bus Interface

The service exposes the following D-Bus interface on `org.gnome.Speech2Text`:

### Methods

- `StartRecording(duration: int, copy_to_clipboard: bool, preview_mode: bool) -> recording_id: str`
- `StopRecording(recording_id: str) -> success: bool`
- `TypeText(text: str, copy_to_clipboard: bool) -> success: bool`
- `GetServiceStatus() -> status: str`
- `CheckDependencies() -> (all_available: bool, missing_dependencies: array<str>)`

### Signals

- `RecordingStarted(recording_id: str)`
- `RecordingStopped(recording_id: str, reason: str)`
- `TranscriptionReady(recording_id: str, text: text)`
- `RecordingError(recording_id: str, error_message: str)`
- `TextTyped(text: str, success: bool)`

## Manual Service Management

The service starts automatically when the GNOME extension needs it. You can also start it manually:

```bash
# Start the service manually
~/.local/share/gnome-speech2text-service/speech2text-service

# Check if service is running
dbus-send --session --print-reply --dest=org.gnome.Speech2Text /org/gnome/Speech2Text org.gnome.Speech2Text.GetServiceStatus
```

## Development

To modify the service:

1. Edit `speech2text_service.py`
2. Update the D-Bus interface in `org.gnome.Speech2Text.xml` if needed

## Troubleshooting

### Service won't start

1. Check that all system dependencies are installed
2. Verify Python environment: `python3 -c "import whisper, dbus, gi"`
3. Check D-Bus service file: `ls ~/.local/share/dbus-1/services/`

### Audio recording fails

1. Ensure ffmpeg is installed and working: `ffmpeg -version`
2. Test PulseAudio: `ffmpeg -f pulse -i default -t 5 test.wav`
3. Check microphone permissions

### Text insertion fails

1. Ensure xdotool is installed: `xdotool version`
2. Test manually: `xdotool type "test"`
3. Check if running on X11 or Wayland

### Dependencies missing

Run the installation script again or install missing packages manually.

## Uninstall

```bash
# Remove service files
rm -rf ~/.local/share/gnome-speech2text-service
rm ~/.local/share/dbus-1/services/org.gnome.Speech2Text.service
rm ~/.local/share/applications/gnome-speech2text-service.desktop
```

## License

MIT License - see the main project repository for details.

## Contributing

This is part of the larger GNOME Speech2Text project. Please see the main repository for contribution guidelines.
