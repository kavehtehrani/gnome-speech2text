#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Installing Whisper Typing GNOME Extension...${NC}"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}Please don't run this script as root${NC}"
    exit 1
fi

# Check if GNOME Shell is installed
if ! command -v gnome-shell &> /dev/null; then
    echo -e "${RED}GNOME Shell is not installed${NC}"
    exit 1
fi

# Create extensions directory if it doesn't exist
EXTENSIONS_DIR="$HOME/.local/share/gnome-shell/extensions"
mkdir -p "$EXTENSIONS_DIR"

# Check if extension is already installed
if [ -d "$EXTENSIONS_DIR/whisper-typing@kaveh.page" ]; then
    echo -e "${YELLOW}Extension already installed. Updating...${NC}"
    rm -rf "$EXTENSIONS_DIR/whisper-typing@kaveh.page"
fi

# Create temporary directory
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR" || exit

# Download the extension
echo -e "${YELLOW}Downloading extension...${NC}"
wget -q https://github.com/kavehtehrani/gnome-speech2text/releases/latest/download/whisper-typing@kaveh.page.zip

# Extract the extension
echo -e "${YELLOW}Extracting extension...${NC}"
unzip -q whisper-typing@kaveh.page.zip -d "$EXTENSIONS_DIR"

# Clean up
cd - > /dev/null || exit
rm -rf "$TEMP_DIR"

# Run the setup script
echo -e "${YELLOW}Setting up environment...${NC}"
cd "$EXTENSIONS_DIR/whisper-typing@kaveh.page" || exit
./setup_env.sh

# Enable the extension
echo -e "${YELLOW}Enabling extension...${NC}"
gnome-extensions enable whisper-typing@kaveh.page

echo -e "${GREEN}Installation complete!${NC}"
echo -e "${YELLOW}Please restart GNOME Shell:${NC}"
echo -e "  - On X11: Press Alt+F2, type 'r' and press Enter"
echo -e "  - On Wayland: Log out and log back in"
echo -e "\n${GREEN}The extension should now be active in your top panel!${NC}" 