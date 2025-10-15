#!/bin/bash

# GNOME Speech2Text WhisperCpp Service - Production Installer
# This script installs the service for end users using pipx
# For development, see README.md for uv-based workflow

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_header() {
    echo -e "\n${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   GNOME Speech2Text WhisperCpp Service Installer (pipx)     ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}\n"
}

print_status() {
    echo -e "${GREEN}✅${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ️${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

error_exit() {
    print_error "$1"
    echo -e "\n${RED}Installation failed. Check the error above and try again.${NC}"
    exit 1
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

print_header

print_info "This script will install the WhisperCpp service using pipx"
print_info "pipx is the recommended way to install Python applications"
echo

# Step 1: Check/Install pipx
echo -e "${CYAN}Step 1/3: Checking pipx...${NC}"
if command_exists pipx; then
    print_status "pipx is already installed"
else
    print_warning "pipx is not installed"
    echo
    echo "Installing pipx..."

    # Detect package manager
    if command_exists apt; then
        sudo apt update && sudo apt install -y pipx || error_exit "Failed to install pipx"
    elif command_exists dnf; then
        sudo dnf install -y pipx || error_exit "Failed to install pipx"
    elif command_exists pacman; then
        sudo pacman -S --noconfirm python-pipx || error_exit "Failed to install pipx"
    else
        print_error "Could not detect package manager"
        echo
        echo "Please install pipx manually:"
        echo "  https://pipx.pypa.io/stable/installation/"
        exit 1
    fi

    # Ensure pipx PATH is configured
    pipx ensurepath || true

    print_status "pipx installed successfully"
fi

echo

# Step 2: Install the service with pipx
echo -e "${CYAN}Step 2/3: Installing service with pipx...${NC}"

# Check if already installed
if pipx list | grep -q "gnome-speech2text-service-whispercpp"; then
    print_warning "Service is already installed. Upgrading..."
    pipx upgrade --system-site-packages gnome-speech2text-service-whispercpp || error_exit "Failed to upgrade service"
    print_status "Service upgraded successfully"
else
    print_info "Installing gnome-speech2text-service-whispercpp..."
    # Use --system-site-packages to allow access to python3-dbus and python3-gi
    pipx install --system-site-packages gnome-speech2text-service-whispercpp || error_exit "Failed to install service"
    print_status "Service installed successfully"
fi

echo

# Step 3: Run setup (D-Bus registration)
echo -e "${CYAN}Step 3/3: Configuring D-Bus integration...${NC}"

# Make sure pipx bin directory is in PATH for this session
export PATH="$HOME/.local/bin:$PATH"

# Run the setup command
if command_exists gnome-speech2text-whispercpp-setup; then
    gnome-speech2text-whispercpp-setup || print_warning "Setup completed with warnings"
else
    error_exit "Setup command not found. Please check pipx installation"
fi

echo
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Installation completed successfully!${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo
echo -e "${YELLOW}What's next?${NC}"
echo
echo "1. Install the GNOME Shell extension from:"
echo "   https://extensions.gnome.org/extension/8238/gnome-speech2text/"
echo
echo "2. The service will start automatically when the extension needs it"
echo
echo "3. To manually test the service:"
echo "   gnome-speech2text-service-whispercpp"
echo
echo -e "${YELLOW}Optional: Install system dependencies if not done yet${NC}"
echo
echo "For Ubuntu/Debian:"
echo "  sudo apt install ffmpeg python3-dbus python3-gi wl-clipboard xdotool xclip"
echo
echo "For Fedora:"
echo "  sudo dnf install ffmpeg python3-dbus python3-gobject wl-clipboard xdotool xclip"
echo
echo -e "${YELLOW}To uninstall:${NC}"
echo "  gnome-speech2text-whispercpp-uninstall  # Clean up service files"
echo "  pipx uninstall gnome-speech2text-service-whispercpp  # Remove package"
echo
print_status "Happy speech-to-texting! 🎤"
