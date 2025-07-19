# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2024-12-XX - GNOME Extensions Store Compliance

### 🏗️ **BREAKING CHANGES**

This version represents a complete architectural overhaul in response to GNOME Extensions Store review feedback. The extension now follows GNOME's architectural guidelines and best practices.

#### **New D-Bus Architecture**

- **Split into two components**: Lightweight GNOME extension + separate D-Bus service
- **Removed all spawn commands** from the extension itself
- **Background service** handles all speech processing, audio recording, and system interaction
- **D-Bus communication** between extension and service for proper isolation

### ✅ **GNOME Extensions Store Compliance Fixes**

#### **1. Schema ID Changes**

- **Removed "GNOME" from schema ID**: Changed from `org.gnome.shell.extensions.gnome-speech2text` to `org.shell.extensions.gnome-speech2text`
- **Complies with naming guidelines** to avoid GNOME trademark issues

#### **2. File Structure Cleanup**

- **Removed unnecessary files**: Eliminated all scripts from main extension directory
- **Moved installation scripts** to separate `speech2text-service/` directory
- **Cleaner extension structure** with only required files

#### **3. Logging Standards**

- **Replaced all `log()` calls** with `console.*` methods
- **Consistent logging pattern** throughout the codebase
- **Better debugging information** with structured console output

#### **4. Resource Management**

- **Proper timeout cleanup**: All `GLib.timeout_add` calls now have proper cleanup
- **Signal disconnection**: D-Bus signals properly disconnected on disable
- **Memory management**: All objects properly nulled and destroyed in disable method
- **No resource leaks**: Complete cleanup of all extension resources

#### **5. Process Management**

- **Eliminated sync spawn**: No more `GLib.spawn_sync` usage that could freeze shell
- **Async D-Bus operations**: All operations now use proper async patterns
- **Cancellable operations**: D-Bus calls can be properly cancelled
- **No blocking operations**: Extension remains responsive at all times

#### **6. System Integration**

- **Removed xdotool dependencies** from extension code
- **D-Bus service handles** all system interaction
- **Better error handling** with graceful degradation
- **Service status checking** before operations

#### **7. Object Lifecycle**

- **Proper instance management**: All instance variables nulled in disable
- **No retained references**: Clean separation between enable/disable cycles
- **Memory leak prevention**: Proper cleanup of all allocated resources
- **Extension unload safety**: Safe to disable and re-enable without issues

### 🚀 **New Features**

#### **Service Management**

- **Automatic service detection**: Extension checks if D-Bus service is available
- **Service status monitoring**: Real-time status updates and error reporting
- **Dependency checking**: Service validates all required dependencies
- **Graceful degradation**: Clear error messages when service unavailable

#### **Improved User Experience**

- **Service Setup Assistant**: Beautiful dialog with step-by-step installation guide when service is missing
- **One-click copy commands**: Copy terminal commands directly from the setup dialog
- **No more cryptic errors**: Replaced confusing D-Bus error messages with helpful guidance
- **GNOME Store ready**: Seamless experience for users installing from Extensions website
- **Status indicators**: Visual feedback about service and recording state
- **Keyboard shortcut management**: Improved shortcut capture and validation

#### **Enhanced Settings**

- **Recording duration control**: Configurable recording time limits
- **Clipboard integration**: Option to copy transcribed text to clipboard
- **X11/Wayland detection**: Automatic adaptation to display server capabilities
- **Preview mode options**: Skip preview for faster workflow on X11

### 🔧 **Technical Improvements**

#### **Code Organization**

- **Modular architecture**: Split functionality into focused modules
- **Utility libraries**: Reusable components for UI, D-Bus, and resource management
- **Better separation of concerns**: Clear boundaries between UI and logic
- **Type safety**: Improved error handling and validation

#### **D-Bus Interface**

- **Well-defined API**: Clean interface between extension and service
- **Signal-based communication**: Event-driven architecture
- **Error propagation**: Proper error handling across D-Bus boundary
- **Service lifecycle management**: Proper startup and shutdown procedures

#### **Testing & Debugging**

- **Service testing tools**: Included test scripts for D-Bus interface
- **Better logging**: Structured logging for easier debugging
- **Service diagnostics**: Built-in dependency and status checking
- **Development mode**: Support for development installation

### 📦 **Installation Changes**

#### **Two-Step Installation**

1. **Install D-Bus service**: Separate installation process for background service
2. **Install extension**: Traditional extension installation

#### **Service Installation**

- **Dedicated installer**: `speech2text-service/install.sh` handles service setup
- **System integration**: Proper systemd service installation
- **Dependency management**: Automatic Python environment setup
- **User service**: Runs as user service, no root privileges needed

#### **Extension Installation**

- **Clean extension package**: Only contains UI and D-Bus client code
- **Standard installation**: Works with GNOME Extensions store guidelines
- **Automatic service detection**: Validates service availability on enable

### 🐛 **Bug Fixes**

- **Fixed resource leaks**: Proper cleanup prevents memory and resource leaks
- **Fixed timeout issues**: All timeouts properly managed and cleaned up
- **Fixed signal handling**: D-Bus signals properly connected and disconnected
- **Fixed keyboard shortcuts**: Better shortcut capture and conflict resolution
- **Fixed modal dialogs**: Proper focus management and cleanup
- **Fixed service communication**: Robust error handling for D-Bus operations
- **Fixed installation permissions**: Removed incorrect sudo requirement from service installer

### 🗑️ **Removed Features**

- **Inline scripts**: All processing scripts moved to separate service
- **Direct system calls**: No more direct interaction with system tools
- **Embedded dependencies**: Python environment now managed by service
- **Sync operations**: All operations now properly asynchronous

### ⚠️ **Migration Guide**

#### **For Existing Users**

1. **Uninstall old version**: Remove previous extension installation
2. **Install service**: Follow new service installation instructions
3. **Install new extension**: Use updated extension package
4. **Restart GNOME Shell**: Complete the migration

#### **Configuration Changes**

- **Settings preserved**: Extension settings will be migrated automatically
- **New service settings**: Additional configuration options available
- **Keyboard shortcuts**: May need to be reconfigured

### 📋 **GNOME Extensions Store Submission**

This version addresses all feedback from the GNOME Extensions Store review:

- ✅ **Schema ID compliance**: Removed GNOME from schema naming
- ✅ **File structure**: Eliminated unnecessary files
- ✅ **Logging standards**: Using console.\* instead of log()
- ✅ **Resource management**: Proper timeout and signal cleanup
- ✅ **No sync spawn**: Eliminated blocking operations
- ✅ **No xdotool in extension**: Moved to service layer
- ✅ **Process cancellation**: Proper async operation management
- ✅ **Object lifecycle**: Complete cleanup in disable method
- ✅ **Scripts separation**: Moved to external service
- ✅ **Watch removal**: Proper signal disconnection
- ✅ **Clean code**: Removed unnecessary lines
- ✅ **Instance management**: No retained objects in default class
- ✅ **D-Bus architecture**: Proper service separation

---

## [1.0.0] - 2024-XX-XX - Initial Release

### Features

- Basic speech-to-text functionality using OpenAI Whisper
- Panel button integration
- Keyboard shortcut support
- Settings dialog
- X11 and Wayland support
- Local processing for privacy

### Known Issues

- Multiple spawn commands causing shell performance issues
- Resource cleanup problems
- Non-standard architecture for GNOME extensions
- Schema naming conflicts
- Missing proper error handling
