#!/bin/bash

set -e

# Parse command line arguments
INSTALL_MODE=""
FORCE_MODE=false
NON_INTERACTIVE=false
LOCAL_SOURCE_DIR=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --local)
            INSTALL_MODE="local"
            FORCE_MODE=true
            shift
            ;;
        --pypi)
            INSTALL_MODE="pypi"
            FORCE_MODE=true
            shift
            ;;
        --non-interactive)
            NON_INTERACTIVE=true
            shift
            ;;
        --help|-h)
            echo "GNOME Speech2Text Service Installer"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --local           Force installation from local source (requires pyproject.toml)"
            echo "  --pypi            Force installation from PyPI"
            echo "  --non-interactive Run without user prompts (auto-accept defaults)"
            echo "  --help            Show this help message"
            echo ""
            echo "Without options, installation mode is auto-detected:"
            echo "  - Local mode: when pyproject.toml is found in script directory"
            echo "  - PyPI mode: when no local source is available"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Check if running interactively
INTERACTIVE=true
if [ ! -t 0 ] || [ "$NON_INTERACTIVE" = true ]; then
    INTERACTIVE=false
    if [ "$NON_INTERACTIVE" = true ]; then
        echo "Running in non-interactive mode (--non-interactive flag)"
    else
        echo "Running in non-interactive mode (piped execution)"
    fi
fi

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

# Helper function for interactive prompts
ask_user() {
    local prompt="$1"
    local default="$2"
    local response=""
    
    if [ "$INTERACTIVE" = true ]; then
        read -p "$prompt" response
    else
        echo "$prompt$default (non-interactive default)"
        response="$default"
    fi
    
    echo "$response"
}

# Detect installation mode
detect_install_mode() {
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # .../gnome-speech2text/src
    REPO_ROOT="$(dirname "$SCRIPT_DIR")"                           # .../gnome-speech2text
    SERVICE_SRC_DIR="$REPO_ROOT/service"                            # .../gnome-speech2text/service

    if [ "$FORCE_MODE" = true ]; then
        echo "🔧 Installation mode forced: $INSTALL_MODE"
        if [ "$INSTALL_MODE" = "local" ]; then
            if [ -f "$SERVICE_SRC_DIR/pyproject.toml" ]; then
                LOCAL_SOURCE_DIR="$SERVICE_SRC_DIR"
                echo "📦 Using local service source: $LOCAL_SOURCE_DIR"
            else
                echo "❌ Local source not found at $SERVICE_SRC_DIR"
                echo "   Tip: Run this from the repository root or omit --local to install from PyPI."
                exit 1
            fi
        fi
        return
    fi

    # Prefer local service source when present in repo root
    if [ -f "$SERVICE_SRC_DIR/pyproject.toml" ]; then
        INSTALL_MODE="local"
        LOCAL_SOURCE_DIR="$SERVICE_SRC_DIR"
        echo "📦 Local service source detected: $LOCAL_SOURCE_DIR"
        return
    fi

    INSTALL_MODE="pypi"
    echo "📦 PyPI installation mode - no local source found"
}

print_status "Installing GNOME Speech2Text D-Bus Service"

# Detect installation mode early
detect_install_mode

echo ""
echo -e "${BLUE}This script will install all required dependencies for Ubuntu.${NC}"
echo ""
if [ "${XDG_SESSION_TYPE:-}" = "wayland" ]; then
    echo "Required packages: python3, python3-pip, python3-venv, python3-dbus, python3-gi, ffmpeg, wl-clipboard"
    echo "We need to run the following command to install all dependencies:"
    echo "sudo apt update && sudo apt install -y python3 python3-pip python3-venv python3-dbus python3-gi ffmpeg wl-clipboard"
else
    echo "Required packages: python3, python3-pip, python3-venv, python3-dbus, python3-gi, ffmpeg, xdotool, xclip"
    echo "We need to run the following command to install all dependencies:"
    echo "sudo apt update && sudo apt install -y python3 python3-pip python3-venv python3-dbus python3-gi ffmpeg xdotool xclip"
fi
echo ""
install_all=$(ask_user "Would you like to install all dependencies at once? [Y/n]: " "Y")
case "$install_all" in
    [Nn]* ) 
        echo "Checking dependencies individually..."
        ;;
    * ) 
        print_status "Installing all dependencies..."
        if [ "${XDG_SESSION_TYPE:-}" = "wayland" ]; then
            sudo apt update && sudo apt install -y python3 python3-pip python3-venv python3-dbus python3-gi ffmpeg wl-clipboard
        else
            sudo apt update && sudo apt install -y python3 python3-pip python3-venv python3-dbus python3-gi ffmpeg xdotool xclip
        fi
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
    install_python=$(ask_user "Would you like to run this command now? [y/N]: " "y")
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
    install_pip=$(ask_user "Would you like to run this command now? [y/N]: " "y")
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
    install_ffmpeg=$(ask_user "Would you like to run this command now? [y/N]: " "y")
    case "$install_ffmpeg" in
        [Yy]* ) 
            sudo apt update && sudo apt install -y ffmpeg || error_exit "Failed to install ffmpeg"
            ;;
        * ) 
            error_exit "ffmpeg is required. Please install it and run this script again."
            ;;
    esac
fi

# Check for xdotool (only required for X11 sessions)
if [ "${XDG_SESSION_TYPE:-}" != "wayland" ]; then
    if ! command_exists xdotool; then
        echo -e "${RED}Error:${NC} xdotool is not installed."
        echo ""
        echo "Please run the following command to install it:"
        echo -e "${YELLOW}sudo apt update && sudo apt install -y xdotool${NC}"
        echo ""
        install_xdotool=$(ask_user "Would you like to run this command now? [y/N]: " "y")
        case "$install_xdotool" in
            [Yy]* ) 
                sudo apt update && sudo apt install -y xdotool || error_exit "Failed to install xdotool"
                ;;
            * ) 
                error_exit "xdotool is required for X11 sessions. Please install it and run this script again."
                ;;
        esac
    fi
else
    print_status "Skipping xdotool check (not needed for Wayland sessions)"
fi

# Check for clipboard tools (session-type specific)
CLIPBOARD_AVAILABLE=false
if [ "${XDG_SESSION_TYPE:-}" = "wayland" ]; then
    if command_exists wl-copy; then
        CLIPBOARD_AVAILABLE=true
    fi
else
    # X11 or unknown - check for xclip/xsel
    for tool in xclip xsel; do
        if command_exists "$tool"; then
            CLIPBOARD_AVAILABLE=true
            break
        fi
    done
fi

if [ "$CLIPBOARD_AVAILABLE" = false ]; then
    echo -e "${YELLOW}Warning:${NC} No clipboard tools found."
    echo ""
    
    if [ "${XDG_SESSION_TYPE:-}" = "wayland" ]; then
        echo "Please run the following command to install wl-clipboard (for Wayland):"
        echo -e "${YELLOW}sudo apt update && sudo apt install -y wl-clipboard${NC}"
        echo ""
        install_clipboard=$(ask_user "Would you like to run this command now? [y/N]: " "y")
        case "$install_clipboard" in
            [Yy]* ) 
                sudo apt update && sudo apt install -y wl-clipboard || echo -e "${YELLOW}Warning:${NC} Failed to install wl-clipboard, continuing without clipboard support"
                ;;
            * ) 
                echo -e "${YELLOW}Warning:${NC} Continuing without clipboard support on Wayland"
                ;;
        esac
    else
        echo "Please run the following command to install xclip (for X11):"
        echo -e "${YELLOW}sudo apt update && sudo apt install -y xclip${NC}"
        echo ""
        install_clipboard=$(ask_user "Would you like to run this command now? [y/N]: " "y")
        case "$install_clipboard" in
            [Yy]* ) 
                sudo apt update && sudo apt install -y xclip || echo -e "${YELLOW}Warning:${NC} Failed to install xclip, continuing without clipboard support"
                ;;
            * ) 
                echo -e "${YELLOW}Warning:${NC} Continuing without clipboard support on X11"
                ;;
        esac
    fi
fi

# Check for D-Bus development files
print_status "Checking D-Bus development packages..."

if ! python3 -c "import dbus" 2>/dev/null; then
    echo -e "${RED}Error:${NC} python3-dbus is not installed."
    echo ""
    echo "Please run the following command to install it:"
    echo -e "${YELLOW}sudo apt update && sudo apt install -y python3-dbus${NC}"
    echo ""
    install_dbus=$(ask_user "Would you like to run this command now? [y/N]: " "y")
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
    install_gi=$(ask_user "Would you like to run this command now? [y/N]: " "y")
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
    install_venv=$(ask_user "Would you like to run this command now? [y/N]: " "y")
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

# Install the service package based on detected mode
install_service_package() {
    case "$INSTALL_MODE" in
        "local")
            print_status "Installing gnome-speech2text-service from local source..."
            SRC_DIR="$LOCAL_SOURCE_DIR"
            if [ -z "$SRC_DIR" ] || [ ! -f "$SRC_DIR/pyproject.toml" ]; then
                error_exit "Local installation requested but pyproject.toml not found in $SRC_DIR. Run from repo root or use --pypi."
            fi
            
            "$VENV_DIR/bin/pip" install "$SRC_DIR" || error_exit "Failed to install local gnome-speech2text-service package"
            echo "✅ Installed from local source: $SRC_DIR"
            ;;
            
        "pypi")
            print_status "Installing gnome-speech2text-service from PyPI..."
            
            # Try PyPI installation with fallback
            if "$VENV_DIR/bin/pip" install --upgrade gnome-speech2text-service; then
                echo "✅ Installed from PyPI: https://pypi.org/project/gnome-speech2text-service/"
            else
                echo ""
                echo -e "${YELLOW}⚠️  PyPI installation failed!${NC}"
                
                # Offer local fallback if available
                FALLBACK_DIR="$LOCAL_SOURCE_DIR"
                if [ -n "$FALLBACK_DIR" ] && [ -f "$FALLBACK_DIR/pyproject.toml" ]; then
                    echo "Local source code is available as fallback."
                    local fallback
                    fallback=$(ask_user "Try installing from local source instead? [Y/n]: " "Y")
                    
                    if [[ "$fallback" =~ ^[Yy]$ ]] || [ -z "$fallback" ]; then
                        print_status "Attempting local installation as fallback..."
                        "$VENV_DIR/bin/pip" install "$FALLBACK_DIR" || error_exit "Both PyPI and local installation failed"
                        echo "✅ Installed from local source (fallback)"
                    else
                        error_exit "PyPI installation failed and local fallback declined"
                    fi
                else
                    echo "No local source available for fallback."
                    error_exit "PyPI installation failed. Please check your internet connection and try again."
                fi
            fi
            ;;
            
        *)
            error_exit "Unknown installation mode: $INSTALL_MODE"
            ;;
    esac
}

install_service_package

print_status "Creating service wrapper script..."
# Create a wrapper script that activates the venv and runs the service
cat > "$SERVICE_DIR/gnome-speech2text-service" << 'EOF'
#!/bin/bash
# GNOME Speech2Text Service Wrapper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"
exec "$VENV_DIR/bin/gnome-speech2text-service" "$@"
EOF
chmod +x "$SERVICE_DIR/gnome-speech2text-service"

print_status "Installing D-Bus service..."
# Install D-Bus service file
DBUS_SERVICE_DIR="$HOME/.local/share/dbus-1/services"
mkdir -p "$DBUS_SERVICE_DIR"

# Create D-Bus service file based on installation mode
install_dbus_service_file() {
    case "$INSTALL_MODE" in
        "local")
            # Use local data directory
            SRC_DIR="$LOCAL_SOURCE_DIR"
            if [ -z "$SRC_DIR" ]; then
                SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
            fi
            if [ -f "$SRC_DIR/data/org.gnome.Speech2Text.service" ]; then
                sed "s|/usr/bin/speech2text-service|$SERVICE_DIR/gnome-speech2text-service|g" \
                    "$SRC_DIR/data/org.gnome.Speech2Text.service" > "$DBUS_SERVICE_DIR/org.gnome.Speech2Text.service"
                echo "✅ D-Bus service file installed from local data"
            else
                # Fallback: create directly if data file isn't present
                cat > "$DBUS_SERVICE_DIR/org.gnome.Speech2Text.service" << EOF
[D-BUS Service]
Name=org.gnome.Speech2Text
Exec=$SERVICE_DIR/gnome-speech2text-service
User=session
EOF
                echo "✅ D-Bus service file created (fallback)"
            fi
            ;;
            
        "pypi")
            # Create D-Bus service file directly (since data files aren't included in PyPI package for GNOME compliance)
            cat > "$DBUS_SERVICE_DIR/org.gnome.Speech2Text.service" << EOF
[D-BUS Service]
Name=org.gnome.Speech2Text
Exec=$SERVICE_DIR/gnome-speech2text-service
User=session
EOF
            echo "✅ D-Bus service file created for PyPI installation"
            ;;
    esac
}

install_dbus_service_file

print_status "Creating desktop entry..."
DESKTOP_DIR="$HOME/.local/share/applications"
mkdir -p "$DESKTOP_DIR"

echo "[Desktop Entry]" > "$DESKTOP_DIR/gnome-speech2text-service.desktop"
echo "Type=Application" >> "$DESKTOP_DIR/gnome-speech2text-service.desktop"
echo "Name=GNOME Speech2Text Service" >> "$DESKTOP_DIR/gnome-speech2text-service.desktop"
echo "Comment=D-Bus service for speech-to-text functionality" >> "$DESKTOP_DIR/gnome-speech2text-service.desktop"
echo "Exec=$SERVICE_DIR/gnome-speech2text-service" >> "$DESKTOP_DIR/gnome-speech2text-service.desktop"
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
echo -e "${YELLOW}Installation mode: $INSTALL_MODE${NC}"
if [ "$INSTALL_MODE" = "pypi" ]; then
    echo -e "${YELLOW}Package source: https://pypi.org/project/gnome-speech2text-service/${NC}"
else
    echo -e "${YELLOW}Package source: Local repository${NC}"
fi
echo ""
echo -e "${YELLOW}The D-Bus service has been installed and registered.${NC}"
echo -e "${YELLOW}It will start automatically when the GNOME extension requests it.${NC}"
echo ""
echo -e "${YELLOW}To manually test the service:${NC}"
echo "  $SERVICE_DIR/gnome-speech2text-service"
echo ""
echo -e "${YELLOW}To verify D-Bus registration:${NC}"
echo "  dbus-send --session --dest=org.gnome.Speech2Text --print-reply /org/gnome/Speech2Text org.gnome.Speech2Text.GetServiceStatus"
echo ""
echo -e "${YELLOW}To uninstall the service:${NC}"
echo "  rm -rf $SERVICE_DIR"
echo "  rm $DBUS_SERVICE_DIR/org.gnome.Speech2Text.service"
echo "  rm $DESKTOP_DIR/gnome-speech2text-service.desktop"
echo ""
echo -e "${GREEN}🎉 Service installation completed successfully!${NC}"
echo -e "${GREEN}The service is ready to be used by the GNOME Shell extension.${NC}"


