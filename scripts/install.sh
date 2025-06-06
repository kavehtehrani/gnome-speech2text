#!/bin/bash

# Exit on error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print error messages and exit
error_exit() {
    echo -e "${RED}Error:${NC} $1"
    exit 1
}

# Function to print status messages
print_status() {
    echo -e "${GREEN}==>${NC} $1"
}

echo -e "${YELLOW}Installing Whisper Typing GNOME Extension...${NC}"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    error_exit "Please don't run this script as root"
fi

# Check if GNOME Shell is installed
if ! command -v gnome-shell &> /dev/null; then
    error_exit "GNOME Shell is not installed"
fi

# Create extensions directory if it doesn't exist
EXTENSIONS_DIR="$HOME/.local/share/gnome-shell/extensions"
mkdir -p "$EXTENSIONS_DIR" || error_exit "Failed to create extensions directory"

# Check if extension is already installed
if [ -d "$EXTENSIONS_DIR/whisper-typing@kaveh.page" ]; then
    echo -e "${YELLOW}Extension already installed. Updating...${NC}"
    rm -rf "$EXTENSIONS_DIR/whisper-typing@kaveh.page" || error_exit "Failed to remove existing extension"
fi

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Check if we're running from a downloaded script
if [ "$SCRIPT_DIR" = "/tmp" ]; then
    # We're running from a downloaded script, need to download the zip
    print_status "Downloading extension..."
    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR" || error_exit "Failed to create temporary directory"
    
    if ! wget -q https://github.com/kavehtehrani/gnome-speech2text/releases/latest/download/whisper-typing@kaveh.page.zip; then
        rm -rf "$TEMP_DIR"
        error_exit "Failed to download extension"
    fi
    
    # Extract the extension
    print_status "Extracting extension..."
    if ! unzip -q whisper-typing@kaveh.page.zip -d "$EXTENSIONS_DIR"; then
        rm -rf "$TEMP_DIR"
        error_exit "Failed to extract extension"
    fi
    
    # Clean up
    cd - > /dev/null || true
    rm -rf "$TEMP_DIR"
else
    # We're running from the repository
    if [ ! -f "$PROJECT_ROOT/dist/whisper-typing@kaveh.page.zip" ]; then
        error_exit "Extension zip file not found. Please run package_zip.sh first"
    fi
    
    # Extract the extension
    print_status "Extracting extension..."
    if ! unzip -q "$PROJECT_ROOT/dist/whisper-typing@kaveh.page.zip" -d "$EXTENSIONS_DIR"; then
        error_exit "Failed to extract extension"
    fi
fi

# Verify the extension was extracted correctly
if [ ! -d "$EXTENSIONS_DIR/whisper-typing@kaveh.page" ]; then
    error_exit "Extension was not extracted correctly"
fi

# Run the setup script
print_status "Setting up environment..."
if [ ! -f "$EXTENSIONS_DIR/whisper-typing@kaveh.page/setup_env.sh" ]; then
    error_exit "Setup script not found in extension directory"
fi

cd "$EXTENSIONS_DIR/whisper-typing@kaveh.page" || error_exit "Failed to change to extension directory"
if ! bash setup_env.sh; then
    error_exit "Setup script failed"
fi

# Enable the extension
print_status "Enabling extension..."
if ! gnome-extensions enable whisper-typing@kaveh.page; then
    error_exit "Failed to enable extension. Please enable it manually using GNOME Extensions app"
fi

echo -e "${GREEN}Installation complete!${NC}"
echo -e "${YELLOW}Please restart GNOME Shell:${NC}"
echo -e "  - On X11: Press Alt+F2, type 'r' and press Enter"
echo -e "  - On Wayland: Log out and log back in"
echo -e "\n${GREEN}The extension should now be active in your top panel!${NC}" 