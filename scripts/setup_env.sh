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

# Function to print error messages
print_error() {
    echo -e "${RED}Error:${NC} $1"
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
    print_error "Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
if ! version_ge "$PYTHON_VERSION" "3.8"; then
    print_error "Python 3.8 or higher is required. Found version $PYTHON_VERSION"
    exit 1
fi

print_status "Python version $PYTHON_VERSION detected ✓"

# Check for pip
if ! command_exists pip3; then
    print_error "pip3 is not installed. Please install pip3."
    exit 1
fi

# Check for ffmpeg
if ! command_exists ffmpeg; then
    print_error "ffmpeg is not installed. Please install ffmpeg."
    echo "You can install it using:"
    echo "  Ubuntu/Debian: sudo apt-get install ffmpeg"
    echo "  Fedora: sudo dnf install ffmpeg"
    echo "  Arch Linux: sudo pacman -S ffmpeg"
    exit 1
fi

# Check for xdotool
if ! command_exists xdotool; then
    print_error "xdotool is not installed. Please install xdotool."
    echo "You can install it using:"
    echo "  Ubuntu/Debian: sudo apt-get install xdotool"
    echo "  Fedora: sudo dnf install xdotool"
    echo "  Arch Linux: sudo pacman -S xdotool"
    exit 1
fi

# Extension directory
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/whisper-typing@kaveh.page"
VENV_DIR="$EXTENSION_DIR/venv"

# Create extension directory if it doesn't exist
if [ ! -d "$EXTENSION_DIR" ]; then
    print_status "Creating extension directory..."
    mkdir -p "$EXTENSION_DIR"
fi

# Create and activate virtual environment
print_status "Setting up Python virtual environment..."
python3 -m venv "$VENV_DIR"

# Upgrade pip
print_status "Upgrading pip..."
"$VENV_DIR/bin/pip" install --upgrade pip

# Install requirements
print_status "Installing Python requirements..."
"$VENV_DIR/bin/pip" install -r "$EXTENSION_DIR/requirements.txt"

# Make the extension executable
print_status "Setting up extension permissions..."
chmod +x "$EXTENSION_DIR/extension.js"

# Compile and install the schema
print_status "Compiling and installing GSettings schema..."
if command_exists glib-compile-schemas; then
    glib-compile-schemas "$EXTENSION_DIR/schemas"
    print_status "GSettings schema compiled successfully ✓"
else
    print_error "glib-compile-schemas not found. Schema compilation skipped."
    echo "You may need to install libglib2.0-dev package."
fi

print_status "✅ Whisper environment setup complete!"
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Restart GNOME Shell (Alt+F2, type 'r' and press Enter)"
echo "2. Enable the extension using GNOME Extensions app or:"
echo "   gnome-extensions enable whisper-typing@kaveh.page"
