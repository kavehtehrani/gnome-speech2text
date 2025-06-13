#!/bin/bash

# Exit on error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check for interactive mode flag
INTERACTIVE=false
if [ "$1" = "--interactive" ] || [ "$1" = "-i" ]; then
    INTERACTIVE=true
fi

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
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page"
VENV_DIR="$EXTENSION_DIR/venv"

# Interactive mode prompt
if [ "$INTERACTIVE" = true ]; then
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  GNOME Speech2Text Extension Setup    ${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "${YELLOW}This setup will:${NC}"
    echo "• If this is your first time using the extension, it will:"
    echo "   - Create a Python virtual environment"
    echo "   - Install OpenAI Whisper and dependencies"
    echo "   - Set up the extension for speech-to-text functionality"
    echo "• If this is not your first time using the extension, it will:"
    echo "   - Update the Python virtual environment"
    echo "   - Update OpenAI Whisper and dependencies"
    echo ""
    echo -e "${YELLOW}Dependencies required:${NC}"
    echo "• Python 3.8+ ✓ (found $PYTHON_VERSION)"
    echo "• pip3 ✓"
    echo "• ffmpeg ✓"
    echo "• xdotool ✓"
    echo ""
    echo -e "${YELLOW}Installation size:${NC} ~200-500MB (includes Whisper models)"
    echo -e "${YELLOW}Estimated time:${NC} 2-5 minutes (depending on internet speed)"
    echo ""
    while true; do
        read -p "Do you want to proceed with the installation? [Y/n]: " yn
        case $yn in
            [Yy]* | "" ) 
                echo ""
                print_status "Starting installation..."
                break
                ;;
            [Nn]* ) 
                echo ""
                echo -e "${YELLOW}Installation cancelled.${NC}"
                echo "You can run this setup later by reloading the extension."
                exit 0
                ;;
            * ) echo "Please answer yes or no.";;
        esac
    done
fi

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

print_status "✅ GNOME Speech2Text environment setup complete!"
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Restart GNOME Shell (Alt+F2, type 'r' and press Enter)"
echo "2. Enable the extension using GNOME Extensions app or:"
echo "   gnome-extensions enable gnome-speech2text@kaveh.page"
