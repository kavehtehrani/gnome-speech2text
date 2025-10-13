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
            echo "GNOME Speech2Text Service (Whisper.cpp) Installer"
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
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}==>${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}Warning:${NC} $1"
}

print_error() {
    echo -e "${RED}Error:${NC} $1"
}

error_exit() {
    print_error "$1"
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
        read -r -p "$prompt" response
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
    SERVICE_SRC_DIR="$REPO_ROOT/service-whispercpp"                # .../gnome-speech2text/service-whispercpp

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

print_status "Installing GNOME Speech2Text D-Bus Service (Whisper.cpp)"

# Detect installation mode early
detect_install_mode

# Check for required system dependencies
check_system_dependencies() {
    local missing_deps=()
    local missing_python_version=false

    # Check for Python 3.9+ (whisper.cpp service requires 3.9+)
    if ! command_exists python3; then
        print_error "Python 3 is not installed."
        missing_deps+=("python3")
    else
        local python_version
        python_version=$(python3 --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
        if ! version_ge "$python_version" "3.9"; then
            print_warning "Python $python_version detected. Python 3.9+ required for whisper.cpp service"
            missing_python_version=true
        else
            print_status "Python $python_version (compatible)"
        fi
    fi

    # Check for pip
    if ! command_exists pip3 && ! command_exists pip; then
        print_error "Python pip not found"
        missing_deps+=("python3-pip")
    else
        print_status "Python pip found"
    fi

    # Check for FFmpeg
    if ! command_exists ffmpeg; then
        print_error "FFmpeg not found (required for audio recording)"
        missing_deps+=("ffmpeg")
    else
        print_status "FFmpeg found"
    fi

    # Check for xdotool (for text insertion on X11 only)
    if [ "${XDG_SESSION_TYPE:-}" != "wayland" ]; then
        if ! command_exists xdotool; then
            print_warning "xdotool not found (text insertion on X11 will not work)"
            missing_deps+=("xdotool")
        else
            print_status "xdotool found (text insertion support)"
        fi
    else
        print_status "Skipping xdotool check (not needed for Wayland sessions)"
    fi

    # Check for clipboard tools (session-type specific)
    local clipboard_found=false
    if [ "${XDG_SESSION_TYPE:-}" = "wayland" ]; then
        if command_exists wl-copy; then
            print_status "wl-copy found (clipboard support for Wayland)"
            clipboard_found=true
        else
            print_warning "wl-copy not found (required for Wayland clipboard)"
            missing_deps+=("wl-clipboard")
        fi
    else
        # X11 or unknown - check for xclip/xsel
        for cmd in xclip xsel; do
            if command_exists "$cmd"; then
                print_status "$cmd found (clipboard support for X11)"
                clipboard_found=true
                break
            fi
        done

        if [ "$clipboard_found" = false ]; then
            print_warning "No clipboard tool found (xclip recommended for X11)"
            missing_deps+=("xclip")
        fi
    fi

    # Check for D-Bus development files
    if ! python3 -c "import dbus" 2>/dev/null; then
        print_error "python3-dbus is not installed"
        missing_deps+=("python3-dbus")
    else
        print_status "python3-dbus found"
    fi

    if ! python3 -c "import gi; gi.require_version('GLib', '2.0')" 2>/dev/null; then
        print_error "PyGObject is not installed"
        missing_deps+=("python3-gi")
    else
        print_status "PyGObject found"
    fi

    # If there are missing dependencies, provide guidance
    if [ ${#missing_deps[@]} -gt 0 ] || [ "$missing_python_version" = true ]; then
        echo
        print_warning "Some dependencies are missing or outdated"
        echo

        echo -e "${CYAN}Required dependencies:${NC}"
        printf '%s\n' "${missing_deps[@]}"
        echo

        echo -e "${CYAN}Please install these packages using your distribution's package manager.${NC}"
        echo

        local install_anyway
        install_anyway=$(ask_user "Continue installation anyway? (y/N): " "n")
        if [[ ! "$install_anyway" =~ ^[Yy]$ ]]; then
            error_exit "Please install the required dependencies first"
        fi
    else
        print_status "All system dependencies found"
    fi
}

print_status "Checking system dependencies..."
check_system_dependencies

# Create virtual environment for the service
SERVICE_DIR="$HOME/.local/share/gnome-speech2text-service-whispercpp"
VENV_DIR="$SERVICE_DIR/venv"

print_status "Creating service directory: $SERVICE_DIR"
mkdir -p "$SERVICE_DIR"

print_status "Creating Python virtual environment..."
if ! python3 -m venv "$VENV_DIR" --system-site-packages 2>/dev/null; then
    print_error "Failed to create virtual environment. python3-venv may not be installed."
    echo ""
    echo "Please install python3-venv using your distribution's package manager."
    error_exit "python3-venv is required. Please install it and run this script again."
fi

print_status "Upgrading pip..."
"$VENV_DIR/bin/pip" install --upgrade pip

print_status "Installing Python dependencies..."

# Install the service package based on detected mode
install_service_package() {
    case "$INSTALL_MODE" in
        "local")
            print_status "Installing gnome-speech2text-service-whispercpp from local source..."
            SRC_DIR="$LOCAL_SOURCE_DIR"
            if [ -z "$SRC_DIR" ] || [ ! -f "$SRC_DIR/pyproject.toml" ]; then
                error_exit "Local installation requested but pyproject.toml not found in $SRC_DIR. Run from repo root or use --pypi."
            fi

            "$VENV_DIR/bin/pip" install "$SRC_DIR" || error_exit "Failed to install local gnome-speech2text-service-whispercpp package"
            echo "✅ Installed from local source: $SRC_DIR"
            ;;

        "pypi")
            print_status "Installing gnome-speech2text-service-whispercpp from PyPI..."

            # Try PyPI installation with fallback
            if "$VENV_DIR/bin/pip" install --upgrade gnome-speech2text-service-whispercpp; then
                echo "✅ Installed from PyPI: https://pypi.org/project/gnome-speech2text-service-whispercpp/"
            else
                echo ""
                print_warning "PyPI installation failed!"

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
cat > "$SERVICE_DIR/gnome-speech2text-service-whispercpp" << 'EOF'
#!/bin/bash
# GNOME Speech2Text Service (Whisper.cpp) Wrapper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"
exec "$VENV_DIR/bin/gnome-speech2text-service-whispercpp" "$@"
EOF
chmod +x "$SERVICE_DIR/gnome-speech2text-service-whispercpp"

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
            if [ -f "$SRC_DIR/data/org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service" ]; then
                sed "s|/usr/bin/gnome-speech2text-service-whispercpp|$SERVICE_DIR/gnome-speech2text-service-whispercpp|g" \
                    "$SRC_DIR/data/org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service" > "$DBUS_SERVICE_DIR/org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service"
                echo "✅ D-Bus service file installed from local data"
            else
                # Fallback: create directly if data file isn't present
                cat > "$DBUS_SERVICE_DIR/org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service" << EOF
[D-BUS Service]
Name=org.gnome.Shell.Extensions.Speech2TextWhisperCpp
Exec=$SERVICE_DIR/gnome-speech2text-service-whispercpp
EOF
                echo "✅ D-Bus service file created (fallback)"
            fi
            ;;

        "pypi")
            # Create D-Bus service file directly (since data files aren't included in PyPI package for GNOME compliance)
            cat > "$DBUS_SERVICE_DIR/org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service" << EOF
[D-BUS Service]
Name=org.gnome.Shell.Extensions.Speech2TextWhisperCpp
Exec=$SERVICE_DIR/gnome-speech2text-service-whispercpp
EOF
            echo "✅ D-Bus service file created for PyPI installation"
            ;;
    esac
}

install_dbus_service_file

print_status "Creating desktop entry..."
DESKTOP_DIR="$HOME/.local/share/applications"
mkdir -p "$DESKTOP_DIR"

echo "[Desktop Entry]" > "$DESKTOP_DIR/gnome-speech2text-service-whispercpp.desktop"
echo "Type=Application" >> "$DESKTOP_DIR/gnome-speech2text-service-whispercpp.desktop"
echo "Name=GNOME Speech2Text Service (Whisper.cpp)" >> "$DESKTOP_DIR/gnome-speech2text-service-whispercpp.desktop"
echo "Comment=D-Bus service for speech-to-text functionality using whisper.cpp" >> "$DESKTOP_DIR/gnome-speech2text-service-whispercpp.desktop"
echo "Exec=$SERVICE_DIR/gnome-speech2text-service-whispercpp" >> "$DESKTOP_DIR/gnome-speech2text-service-whispercpp.desktop"
echo "Icon=audio-input-microphone" >> "$DESKTOP_DIR/gnome-speech2text-service-whispercpp.desktop"
echo "StartupNotify=false" >> "$DESKTOP_DIR/gnome-speech2text-service-whispercpp.desktop"
echo "NoDisplay=true" >> "$DESKTOP_DIR/gnome-speech2text-service-whispercpp.desktop"
echo "Categories=Utility;" >> "$DESKTOP_DIR/gnome-speech2text-service-whispercpp.desktop"

print_status "Installation complete!"
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Whisper.cpp Service Installed        ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Installation mode: $INSTALL_MODE${NC}"
if [ "$INSTALL_MODE" = "pypi" ]; then
    echo -e "${YELLOW}Package source: https://pypi.org/project/gnome-speech2text-service-whispercpp/${NC}"
else
    echo -e "${YELLOW}Package source: Local repository${NC}"
fi
echo ""
echo -e "${YELLOW}The D-Bus service has been installed and registered.${NC}"
echo -e "${YELLOW}It will start automatically when the GNOME extension requests it.${NC}"
echo ""
echo -e "${YELLOW}To manually test the service:${NC}"
echo "  $SERVICE_DIR/gnome-speech2text-service-whispercpp"
echo ""
echo -e "${YELLOW}To verify D-Bus registration:${NC}"
echo "  dbus-send --session --dest=org.gnome.Shell.Extensions.Speech2TextWhisperCpp --print-reply /org/gnome/Shell/Extensions/Speech2TextWhisperCpp org.gnome.Shell.Extensions.Speech2TextWhisperCpp.GetServiceStatus"
echo ""
echo -e "${YELLOW}To uninstall the service:${NC}"
echo "  rm -rf $SERVICE_DIR"
echo "  rm $DBUS_SERVICE_DIR/org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service"
echo "  rm $DESKTOP_DIR/gnome-speech2text-service-whispercpp.desktop"
echo ""
echo -e "${GREEN}🎉 Service installation completed successfully!${NC}"
echo -e "${GREEN}The service is ready to be used by the GNOME Shell extension.${NC}"


