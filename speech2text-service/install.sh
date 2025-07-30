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

echo ""
echo -e "${BLUE}This script will install all required dependencies for Ubuntu.${NC}"
echo ""
echo "Required packages: python3, python3-pip, python3-venv, python3-dbus, python3-gi, ffmpeg, xdotool, xclip"
echo "We need to run the following command to install all dependencies:"
echo "sudo apt update && sudo apt install -y python3 python3-pip python3-venv python3-dbus python3-gi ffmpeg xdotool xclip"
echo ""
read -p "Would you like to install all dependencies at once? [Y/n]: " install_all
case "$install_all" in
    [Nn]* ) 
        echo "Checking dependencies individually..."
        ;;
    * ) 
        print_status "Installing all dependencies..."
        sudo apt update && sudo apt install -y python3 python3-pip python3-venv python3-dbus python3-gi ffmpeg xdotool xclip
        if [ $? -eq 0 ]; then
            print_status "All dependencies installed successfully!"
        else
            echo -e "${YELLOW}Warning:${NC} Some packages may have failed to install. Checking individually..."
        fi
        ;;
esac

echo ""

# Check for required system dependencies
print_status "Checking system dependencies..."

# Check for Python 3.8+
if ! command_exists python3; then
    echo -e "${RED}Error:${NC} Python 3 is not installed."
    echo ""
    echo "Please run the following command to install Python 3:"
    echo -e "${YELLOW}sudo apt update && sudo apt install -y python3${NC}"
    echo ""
    read -p "Would you like to run this command now? [y/N]: " install_python
    case "$install_python" in
        [Yy]* ) 
            sudo apt update && sudo apt install -y python3 || error_exit "Failed to install Python 3"
            ;;
        * ) 
            error_exit "Python 3 is required. Please install it and run this script again."
            ;;
    esac
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
if ! version_ge "$PYTHON_VERSION" "3.8"; then
    echo -e "${RED}Error:${NC} Python 3.8 or higher is required. Found version $PYTHON_VERSION"
    echo ""
    echo "Please run the following command to install a newer Python version:"
    echo -e "${YELLOW}sudo apt update && sudo apt install -y python3.8${NC}"
    error_exit "Python version too old"
fi

print_status "Python version $PYTHON_VERSION detected ✓"

# Check for pip
if ! command_exists pip3; then
    echo -e "${RED}Error:${NC} pip3 is not installed."
    echo ""
    echo "Please run the following command to install pip3:"
    echo -e "${YELLOW}sudo apt update && sudo apt install -y python3-pip${NC}"
    echo ""
    read -p "Would you like to run this command now? [y/N]: " install_pip
    case "$install_pip" in
        [Yy]* ) 
            sudo apt update && sudo apt install -y python3-pip || error_exit "Failed to install pip3"
            ;;
        * ) 
            error_exit "pip3 is required. Please install it and run this script again."
            ;;
    esac
fi

# Check for required system packages
print_status "Checking system packages..."

# Check for ffmpeg
if ! command_exists ffmpeg; then
    echo -e "${RED}Error:${NC} ffmpeg is not installed."
    echo ""
    echo "Please run the following command to install it:"
    echo -e "${YELLOW}sudo apt update && sudo apt install -y ffmpeg${NC}"
    echo ""
    read -p "Would you like to run this command now? [y/N]: " install_ffmpeg
    case "$install_ffmpeg" in
        [Yy]* ) 
            sudo apt update && sudo apt install -y ffmpeg || error_exit "Failed to install ffmpeg"
            ;;
        * ) 
            error_exit "ffmpeg is required. Please install it and run this script again."
            ;;
    esac
fi

# Check for xdotool
if ! command_exists xdotool; then
    echo -e "${RED}Error:${NC} xdotool is not installed."
    echo ""
    echo "Please run the following command to install it:"
    echo -e "${YELLOW}sudo apt update && sudo apt install -y xdotool${NC}"
    echo ""
    read -p "Would you like to run this command now? [y/N]: " install_xdotool
    case "$install_xdotool" in
        [Yy]* ) 
            sudo apt update && sudo apt install -y xdotool || error_exit "Failed to install xdotool"
            ;;
        * ) 
            error_exit "xdotool is required. Please install it and run this script again."
            ;;
    esac
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
    echo -e "${YELLOW}Warning:${NC} No clipboard tools found."
    echo ""
    echo "Please run the following command to install xclip:"
    echo -e "${YELLOW}sudo apt update && sudo apt install -y xclip${NC}"
    echo ""
    read -p "Would you like to run this command now? [y/N]: " install_xclip
    case "$install_xclip" in
        [Yy]* ) 
            sudo apt update && sudo apt install -y xclip || echo -e "${YELLOW}Warning:${NC} Failed to install xclip, continuing without clipboard support"
            ;;
        * ) 
            echo -e "${YELLOW}Warning:${NC} Continuing without clipboard support"
            ;;
    esac
fi

# Check for D-Bus development files
print_status "Checking D-Bus development packages..."

if ! python3 -c "import dbus" 2>/dev/null; then
    echo -e "${RED}Error:${NC} python3-dbus is not installed."
    echo ""
    echo "Please run the following command to install it:"
    echo -e "${YELLOW}sudo apt update && sudo apt install -y python3-dbus${NC}"
    echo ""
    read -p "Would you like to run this command now? [y/N]: " install_dbus
    case "$install_dbus" in
        [Yy]* ) 
            sudo apt update && sudo apt install -y python3-dbus || error_exit "Failed to install python3-dbus"
            ;;
        * ) 
            error_exit "python3-dbus is required. Please install it and run this script again."
            ;;
    esac
fi

if ! python3 -c "import gi; gi.require_version('GLib', '2.0')" 2>/dev/null; then
    echo -e "${RED}Error:${NC} PyGObject is not installed."
    echo ""
    echo "Please run the following command to install it:"
    echo -e "${YELLOW}sudo apt update && sudo apt install -y python3-gi${NC}"
    echo ""
    read -p "Would you like to run this command now? [y/N]: " install_gi
    case "$install_gi" in
        [Yy]* ) 
            sudo apt update && sudo apt install -y python3-gi || error_exit "Failed to install python3-gi"
            ;;
        * ) 
            error_exit "PyGObject is required. Please install it and run this script again."
            ;;
    esac
fi

print_status "All system dependencies found ✓"

# Create virtual environment for the service
SERVICE_DIR="$HOME/.local/share/gnome-speech2text-service"
VENV_DIR="$SERVICE_DIR/venv"

print_status "Creating service directory: $SERVICE_DIR"
mkdir -p "$SERVICE_DIR"

print_status "Creating Python virtual environment..."
if ! python3 -m venv "$VENV_DIR" --system-site-packages 2>/dev/null; then
    echo -e "${RED}Error:${NC} Failed to create virtual environment. python3-venv may not be installed."
    echo ""
    echo "Please run the following command to install python3-venv:"
    echo -e "${YELLOW}sudo apt update && sudo apt install -y python3-venv${NC}"
    echo ""
    read -p "Would you like to run this command now? [y/N]: " install_venv
    case "$install_venv" in
        [Yy]* ) 
            sudo apt update && sudo apt install -y python3-venv || error_exit "Failed to install python3-venv"
            python3 -m venv "$VENV_DIR" --system-site-packages || error_exit "Failed to create virtual environment"
            ;;
        * ) 
            error_exit "python3-venv is required. Please install it and run this script again."
            ;;
    esac
fi

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

echo "[Desktop Entry]" > "$DESKTOP_DIR/gnome-speech2text-service.desktop"
echo "Type=Application" >> "$DESKTOP_DIR/gnome-speech2text-service.desktop"
echo "Name=GNOME Speech2Text Service" >> "$DESKTOP_DIR/gnome-speech2text-service.desktop"
echo "Comment=D-Bus service for speech-to-text functionality" >> "$DESKTOP_DIR/gnome-speech2text-service.desktop"
echo "Exec=$SERVICE_DIR/speech2text-service" >> "$DESKTOP_DIR/gnome-speech2text-service.desktop"
echo "Icon=audio-input-microphone" >> "$DESKTOP_DIR/gnome-speech2text-service.desktop"
echo "StartupNotify=false" >> "$DESKTOP_DIR/gnome-speech2text-service.desktop"
echo "NoDisplay=true" >> "$DESKTOP_DIR/gnome-speech2text-service.desktop"
echo "Categories=Utility;" >> "$DESKTOP_DIR/gnome-speech2text-service.desktop"

print_status "Installation complete!"
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  GNOME Speech2Text Service Installed  ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo -e "${YELLOW}To manually start the service:${NC}"
echo "  $SERVICE_DIR/speech2text-service"
echo ""
echo -e "${YELLOW}To uninstall:${NC}"
echo "  rm -rf $SERVICE_DIR"
echo "  rm $DBUS_SERVICE_DIR/org.gnome.Speech2Text.service"
echo "  rm $DESKTOP_DIR/gnome-speech2text-service.desktop"
echo ""
echo -e "${GREEN}🎉 Installation completed successfully!${NC}"
echo -e "${GREEN} You need to restart GNOME"
echo -e "${GREEN} On X11: Alt+F2, type 'r', press Enter."
echo -e "${GREEN} On Wayland: Log out and log back in."
