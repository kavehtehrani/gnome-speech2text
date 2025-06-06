#!/bin/bash

# Exit on error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to print status messages
print_status() {
    echo -e "${GREEN}==>${NC} $1"
}

# Function to print error messages and exit
error_exit() {
    echo -e "${RED}Error:${NC} $1"
    exit 1
}

# Function to compare version numbers
version_ge() {
    # Compare two version numbers (greater than or equal)
    # Returns 0 if $1 >= $2, 1 otherwise
    printf '%s\n%s\n' "$2" "$1" | sort -V -C
}

# Check for required system dependencies
print_status "Checking system dependencies..."

# Check for Python 3.8+
if ! command_exists python3; then
    error_exit "Python 3 is not installed. Please install Python 3.8 or higher."
fi

# Check Python version
PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
if ! version_ge "$PYTHON_VERSION" "3.8"; then
    error_exit "Python 3.8 or higher is required. Found version $PYTHON_VERSION"
fi

print_status "Python version $PYTHON_VERSION detected ✓"

# Check for pip
if ! command_exists pip3; then
    error_exit "pip3 is not installed. Please install pip3."
fi

# Check for ffmpeg
if ! command_exists ffmpeg; then
    error_exit "ffmpeg is not installed. Please install ffmpeg.
You can install it using:
  Ubuntu/Debian: sudo apt-get install ffmpeg
  Fedora: sudo dnf install ffmpeg
  Arch Linux: sudo pacman -S ffmpeg"
fi

# Check for xdotool
if ! command_exists xdotool; then
    error_exit "xdotool is not installed. Please install xdotool.
You can install it using:
  Ubuntu/Debian: sudo apt-get install xdotool
  Fedora: sudo dnf install xdotool
  Arch Linux: sudo pacman -S xdotool"
fi

# Extension directory
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/gnome-tts@kaveh.page"
VENV_DIR="$EXTENSION_DIR/venv"

# Create extension directory if it doesn't exist
if [ ! -d "$EXTENSION_DIR" ]; then
    print_status "Creating extension directory..."
    mkdir -p "$EXTENSION_DIR" || error_exit "Failed to create extension directory"
fi

# Create and activate virtual environment
print_status "Setting up Python virtual environment..."
python3 -m venv "$VENV_DIR" || error_exit "Failed to create virtual environment"

# Upgrade pip
print_status "Upgrading pip..."
"$VENV_DIR/bin/pip" install --upgrade pip || error_exit "Failed to upgrade pip"

# Install requirements
print_status "Installing Python requirements..."
if [ ! -f "$EXTENSION_DIR/requirements.txt" ]; then
    error_exit "requirements.txt not found in extension directory"
fi
"$VENV_DIR/bin/pip" install -r "$EXTENSION_DIR/requirements.txt" || error_exit "Failed to install Python requirements"

# Make the extension executable
print_status "Setting up extension permissions..."
if [ ! -f "$EXTENSION_DIR/extension.js" ]; then
    error_exit "extension.js not found in extension directory"
fi
chmod +x "$EXTENSION_DIR/extension.js" || error_exit "Failed to set extension permissions"

# Compile and install the schema
print_status "Compiling and installing GSettings schema..."
if [ ! -d "$EXTENSION_DIR/schemas" ]; then
    error_exit "schemas directory not found in extension directory"
fi
if command_exists glib-compile-schemas; then
    glib-compile-schemas "$EXTENSION_DIR/schemas" || error_exit "Failed to compile GSettings schema"
    print_status "GSettings schema compiled successfully ✓"
else
    error_exit "glib-compile-schemas not found. Please install libglib2.0-dev package."
fi

print_status "✅ GNOME TTS environment setup complete!"
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Restart GNOME Shell (Alt+F2, type 'r' and press Enter)"
echo "2. Enable the extension using GNOME Extensions app or:"
echo "   gnome-extensions enable gnome-tts@kaveh.page"
