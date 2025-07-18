# GNOME Speech2Text - D-Bus Architecture

This document describes the new D-Bus-based architecture for the GNOME Speech2Text extension, designed to meet GNOME Extensions store requirements.

## Overview

The extension has been split into two separate components:

### 1. GNOME Shell Extension (Lightweight UI)

- **Location**: `src/` directory
- **Purpose**: Provides user interface, keyboard shortcuts, and settings
- **Functionality**:
  - Panel button with microphone icon
  - Keyboard shortcut registration
  - Settings dialog
  - D-Bus client for service communication

### 2. D-Bus Service (Core Functionality)

- **Location**: `speech2text-service/` directory
- **Purpose**: Handles all speech-to-text processing
- **Functionality**:
  - Audio recording with ffmpeg
  - Speech transcription with OpenAI Whisper
  - Text insertion with xdotool
  - Clipboard integration
  - D-Bus interface implementation

## Architecture Benefits

### ✅ GNOME Store Compliance

- **No setup scripts in extension**: All Python/Whisper setup moved to service
- **No large dependencies**: Extension is now <100KB vs ~500MB
- **Proper separation of concerns**: UI vs processing logic
- **Standard D-Bus patterns**: Follows GNOME architectural guidelines

### ✅ Better User Experience

- **Faster extension loading**: No Python environment checks on startup
- **More reliable**: Service runs independently of extension
- **Better error handling**: Clear separation between UI and processing errors
- **Easier updates**: Service and extension can be updated independently

### ✅ Security & Stability

- **Process isolation**: Whisper runs in separate process
- **Proper cleanup**: D-Bus handles service lifecycle
- **No sync calls**: All operations are asynchronous
- **Resource management**: Service manages its own resources

## Installation Process

### Old (Monolithic) Process

1. Install extension
2. Extension checks for Python environment
3. Extension runs setup script automatically
4. Extension manages Python dependencies
5. Extension spawns Python processes directly

### New (D-Bus) Process

1. Install service package separately:
   ```bash
   cd speech2text-service
   ./install.sh
   ```
2. Install lightweight extension from GNOME store
3. Extension connects to service via D-Bus
4. Service starts automatically when needed

## Communication Flow

```
User Action (Click/Shortcut)
         ↓
GNOME Extension (D-Bus Client)
         ↓ StartRecording(duration, clipboard, preview)
D-Bus Session Bus
         ↓
Speech2Text Service
         ↓ RecordingStarted signal
Extension shows dialog
         ↓
Service records audio → transcribes → emits TranscriptionReady
         ↓
Extension receives signal → shows preview or types text
```

## D-Bus Interface

### Service Name

`org.gnome.Speech2Text`

### Object Path

`/org/gnome/Speech2Text`

### Methods

- `StartRecording(int duration, bool copy_to_clipboard, bool preview_mode) → string recording_id`
- `StopRecording(string recording_id) → bool success`
- `TypeText(string text, bool copy_to_clipboard) → bool success`
- `GetServiceStatus() → string status`
- `CheckDependencies() → (bool all_available, array<string> missing)`

### Signals

- `RecordingStarted(string recording_id)`
- `RecordingStopped(string recording_id, string reason)`
- `TranscriptionReady(string recording_id, string text)`
- `RecordingError(string recording_id, string error_message)`
- `TextTyped(string text, bool success)`

## File Structure

### Extension Package (GNOME Store)

```
src/
├── extension.js                    # Main extension (D-Bus client)
├── metadata.json                   # Extension metadata
├── schemas/
│   └── org.shell.extensions.gnome-speech2text.gschema.xml
├── icons/
│   └── microphone-symbolic.svg
└── lib/
    ├── constants.js                # UI constants
    ├── uiUtils.js                  # UI helper functions
    └── resourceUtils.js            # Resource cleanup utilities
```

### Service Package (Separate Installation)

```
speech2text-service/
├── speech2text_service.py          # Main D-Bus service implementation
├── speech2text-service             # Executable wrapper
├── org.gnome.Speech2Text.service    # D-Bus service definition
├── org.gnome.Speech2Text.xml        # D-Bus interface specification
├── requirements.txt                # Python dependencies
├── setup.py                        # Python package setup
├── install.sh                      # Installation script
└── README.md                       # Service documentation
```

## Removed Components

The following were removed from the extension (now in service):

### ❌ Scripts (Per GNOME Review)

- `scripts/setup_env.sh` → Moved to service install.sh
- `scripts/install.sh` → No longer needed
- `scripts/package_zip.sh` → No longer needed
- `scripts/uninstall.sh` → No longer needed

### ❌ Python Dependencies

- `src/whisper_typing.py` → Functionality in speech2text_service.py
- `requirements.txt` → Moved to service package
- Python environment management → Handled by service installer

### ❌ Setup Logic

- `src/lib/setupUtils.js` → No longer needed
- Setup check in enable() → Service availability check instead
- Terminal setup launching → Users install service manually

### ❌ Process Management

- Direct subprocess spawning → D-Bus method calls
- Process cleanup → Service handles internally
- Signal handling → D-Bus signals

### ❌ Complex Focus Handling

- `src/lib/focusUtils.js` → Simplified for D-Bus
- xdotool focus management → Service responsibility
- X11/Wayland detection → Service handles display server

## Migration Benefits

### For Users

- **Easier installation**: Clear separation between service and extension
- **Better reliability**: Service runs independently
- **GNOME Store availability**: Extension can be published officially
- **Easier troubleshooting**: Clear error messages and separation of concerns

### For Developers

- **Cleaner codebase**: Extension focuses on UI, service on processing
- **Easier testing**: Can test service and extension independently
- **Better maintenance**: Changes to Whisper/ML don't affect extension
- **Standards compliance**: Follows GNOME architectural patterns

### For GNOME Review

- **No prohibited patterns**: No scripts, no large dependencies, no sync calls
- **Proper D-Bus usage**: Standard inter-process communication
- **Resource management**: Service handles its own lifecycle
- **Security**: Process isolation and proper permissions

## Testing

### Service Testing

```bash
# Test D-Bus service directly
cd speech2text-service
python3 speech2text_service.py

# Test D-Bus interface
python3 ../test-dbus.py
```

### Extension Testing

```bash
# Install extension manually
cp -r src/ ~/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page/

# Reload GNOME Shell
Alt+F2, type 'r', press Enter

# Enable extension
gnome-extensions enable gnome-speech2text@kaveh.page
```

## Future Improvements

### Service Enhancements

- systemd user service integration
- Better dependency management
- Multiple Whisper model support
- Service configuration API

### Extension Enhancements

- Real-time transcription status
- Service health monitoring
- Advanced settings UI
- Multiple service support

## Conclusion

The D-Bus architecture addresses all GNOME review feedback while providing a more robust, maintainable, and user-friendly system. The extension is now suitable for GNOME Extensions store submission, while users get better functionality through the separation of concerns.
