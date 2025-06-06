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
    # Clean up temporary directory if it exists
    if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
    fi
    exit 1
}

# Function to print status messages
print_status() {
    echo -e "${GREEN}==>${NC} $1"
}

# Function to download a file
download_file() {
    local url=$1
    local output=$2
    print_status "Downloading $output..."
    if ! wget -q "$url" -O "$output"; then
        error_exit "Failed to download $output"
    fi
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

echo -e "${YELLOW}Installing Whisper Typing GNOME Extension...${NC}"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    error_exit "Please don't run this script as root"
fi

# Check if GNOME Shell is installed
if ! command_exists gnome-shell; then
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

# Create temporary directory for downloads
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR" || error_exit "Failed to create temporary directory"

# Download all necessary files
REPO_URL="https://raw.githubusercontent.com/kavehtehrani/gnome-speech2text/main"
download_file "$REPO_URL/scripts/setup_env.sh" "setup_env.sh"
download_file "$REPO_URL/requirements.txt" "requirements.txt"
download_file "$REPO_URL/dist/whisper-typing@kaveh.page.zip" "whisper-typing@kaveh.page.zip"

# Extract the extension
print_status "Extracting extension..."
if ! unzip -q whisper-typing@kaveh.page.zip -d "$EXTENSIONS_DIR"; then
    error_exit "Failed to extract extension"
fi

# Verify the extension was extracted correctly
if [ ! -d "$EXTENSIONS_DIR/whisper-typing@kaveh.page" ]; then
    error_exit "Extension was not extracted correctly"
fi

# Copy setup files to extension directory
cp setup_env.sh "$EXTENSIONS_DIR/whisper-typing@kaveh.page/" || error_exit "Failed to copy setup script"
cp requirements.txt "$EXTENSIONS_DIR/whisper-typing@kaveh.page/" || error_exit "Failed to copy requirements file"

# Make setup script executable
chmod +x "$EXTENSIONS_DIR/whisper-typing@kaveh.page/setup_env.sh" || error_exit "Failed to make setup script executable"

# Run the setup script
print_status "Setting up environment..."
cd "$EXTENSIONS_DIR/whisper-typing@kaveh.page" || error_exit "Failed to change to extension directory"
if ! bash setup_env.sh; then
    error_exit "Setup script failed"
fi

# Enable the extension
print_status "Enabling extension..."
if ! gnome-extensions enable whisper-typing@kaveh.page; then
    error_exit "Failed to enable extension. Please enable it manually using GNOME Extensions app"
fi

# Clean up
cd - > /dev/null || true
rm -rf "$TEMP_DIR"

echo -e "${GREEN}Installation complete!${NC}"
echo -e "${YELLOW}Please restart GNOME Shell:${NC}"
echo -e "  - On X11: Press Alt+F2, type 'r' and press Enter"
echo -e "  - On Wayland: Log out and log back in"
echo -e "\n${GREEN}The extension should now be active in your top panel!${NC}" 