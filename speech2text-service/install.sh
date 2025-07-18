#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}==>${NC} $1"
}

error_exit() {
    echo -e "${RED}Error:${NC} $1"
    exit 1
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

version_ge() {
    printf '%s\n%s\n' "$2" "$1" | sort -V -C
}

print_status "Installing GNOME Speech2Text D-Bus Service"

# Check for required system dependencies
print_status "Checking system dependencies..."

# Check for Python 3.8+
if ! command_exists python3; then
    error_exit "Python 3 is not installed. Please install Python 3.8 or higher."
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
if ! version_ge "$PYTHON_VERSION" "3.8"; then
    error_exit "Python 3.8 or higher is required. Found version $PYTHON_VERSION"
fi

print_status "Python version $PYTHON_VERSION detected ✓"

# Check for pip
if ! command_exists pip3; then
    error_exit "pip3 is not installed. Please install pip3."
fi

# Check for required system packages
print_status "Checking system packages..."

# Check for ffmpeg
if ! command_exists ffmpeg; then
    error_exit "ffmpeg is not installed. Please install ffmpeg:
  Ubuntu/Debian: sudo apt-get install ffmpeg
  Fedora: sudo dnf install ffmpeg
  Arch Linux: sudo pacman -S ffmpeg"
fi

# Check for xdotool
if ! command_exists xdotool; then
    error_exit "xdotool is not installed. Please install xdotool:
  Ubuntu/Debian: sudo apt-get install xdotool
  Fedora: sudo dnf install xdotool
  Arch Linux: sudo pacman -S xdotool"
fi

# Check for clipboard tools
CLIPBOARD_AVAILABLE=false
for tool in xclip xsel wl-copy; do
    if command_exists "$tool"; then
        CLIPBOARD_AVAILABLE=true
        break
    fi
done

if [ "$CLIPBOARD_AVAILABLE" = false ]; then
    echo -e "${YELLOW}Warning:${NC} No clipboard tools found. Install one of: xclip, xsel, or wl-copy"
    echo "  Ubuntu/Debian: sudo apt-get install xclip"
    echo "  Fedora: sudo dnf install xclip"
    echo "  Arch Linux: sudo pacman -S xclip"
    echo ""
    read -p "Continue without clipboard support? [y/N]: " continue_without_clipboard
    case $continue_without_clipboard in
        [Yy]* ) ;;
        * ) error_exit "Installation cancelled";;
    esac
fi

# Check for D-Bus development files
print_status "Checking D-Bus development packages..."
python3 -c "import dbus" 2>/dev/null || {
    error_exit "python3-dbus is not installed. Please install it:
  Ubuntu/Debian: sudo apt-get install python3-dbus
  Fedora: sudo dnf install python3-dbus
  Arch Linux: sudo pacman -S python-dbus"
}

python3 -c "import gi; gi.require_version('GLib', '2.0')" 2>/dev/null || {
    error_exit "PyGObject is not installed. Please install it:
  Ubuntu/Debian: sudo apt-get install python3-gi
  Fedora: sudo dnf install python3-gobject
  Arch Linux: sudo pacman -S python-gobject"
}

print_status "All system dependencies found ✓"

# Create virtual environment for the service
SERVICE_DIR="$HOME/.local/share/gnome-speech2text-service"
VENV_DIR="$SERVICE_DIR/venv"

print_status "Creating service directory: $SERVICE_DIR"
mkdir -p "$SERVICE_DIR"

print_status "Creating Python virtual environment..."
python3 -m venv "$VENV_DIR" --system-site-packages

print_status "Upgrading pip..."
"$VENV_DIR/bin/pip" install --upgrade pip

print_status "Installing Python dependencies..."
"$VENV_DIR/bin/pip" install -r requirements.txt

print_status "Installing service files..."

# Copy service files
cp speech2text_service.py "$SERVICE_DIR/"
cp speech2text-service "$SERVICE_DIR/"
chmod +x "$SERVICE_DIR/speech2text-service"

# Install D-Bus service file
DBUS_SERVICE_DIR="$HOME/.local/share/dbus-1/services"
mkdir -p "$DBUS_SERVICE_DIR"

# Update the service file with correct path
sed "s|/usr/bin/speech2text-service|$SERVICE_DIR/speech2text-service|g" \
    org.gnome.Speech2Text.service > "$DBUS_SERVICE_DIR/org.gnome.Speech2Text.service"

print_status "Creating desktop entry..."
DESKTOP_DIR="$HOME/.local/share/applications"
mkdir -p "$DESKTOP_DIR"

cat > "$DESKTOP_DIR/gnome-speech2text-service.desktop" << EOF
[Desktop Entry]
Type=Application
Name=GNOME Speech2Text Service
Comment=D-Bus service for speech-to-text functionality
Exec=$SERVICE_DIR/speech2text-service
Icon=audio-input-microphone
StartupNotify=false
NoDisplay=true
Categories=Utility;
EOF

print_status "Installation complete!"
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  GNOME Speech2Text Service Installed  ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. The service will start automatically when needed by the extension"
echo "2. Install the GNOME extension from the extensions store or manually"
echo "3. Enable the extension using GNOME Extensions app"
echo ""
echo -e "${YELLOW}To manually start the service:${NC}"
echo "  $SERVICE_DIR/speech2text-service"
echo ""
echo -e "${YELLOW}To uninstall:${NC}"
echo "  rm -rf $SERVICE_DIR"
echo "  rm $DBUS_SERVICE_DIR/org.gnome.Speech2Text.service"
echo "  rm $DESKTOP_DIR/gnome-speech2text-service.desktop" 