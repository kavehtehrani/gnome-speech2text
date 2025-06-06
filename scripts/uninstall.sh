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

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

echo -e "${YELLOW}Uninstalling Whisper Typing GNOME Extension...${NC}"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    error_exit "Please don't run this script as root"
fi

# Check if GNOME Shell is installed
if ! command_exists gnome-shell; then
    error_exit "GNOME Shell is not installed"
fi

# Extension directory
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page"

# Check if extension is installed
if [ ! -d "$EXTENSION_DIR" ]; then
    error_exit "Extension is not installed"
fi

# Disable the extension
print_status "Disabling extension..."
if gnome-extensions list | grep -q "gnome-speech2text@kaveh.page"; then
    if ! gnome-extensions disable gnome-speech2text@kaveh.page; then
        error_exit "Failed to disable extension. Please disable it manually using GNOME Extensions app"
    fi
fi

# Remove the extension directory
print_status "Removing extension files..."
if ! rm -rf "$EXTENSION_DIR"; then
    error_exit "Failed to remove extension directory"
fi

# Remove compiled schemas
print_status "Removing compiled schemas..."
if command_exists glib-compile-schemas; then
    if [ -d "$HOME/.local/share/glib-2.0/schemas" ]; then
        rm -f "$HOME/.local/share/glib-2.0/schemas/org.gnome.shell.extensions.gnome-speech2text.gschema.xml"
        glib-compile-schemas "$HOME/.local/share/glib-2.0/schemas"
    fi
fi

echo -e "${GREEN}Uninstallation complete!${NC}"
echo -e "${YELLOW}Please restart GNOME Shell:${NC}"
echo -e "  - On X11: Press Alt+F2, type 'r' and press Enter"
echo -e "  - On Wayland: Log out and log back in" 