#!/bin/bash

set -e

# Parse command line arguments
INSTALL_MODE=""
FORCE_MODE=false
NON_INTERACTIVE=false
LOCAL_SOURCE_DIR=""
PYTHON_OVERRIDE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --python)
            if [[ -z "${2:-}" ]]; then
                echo "Error: --python requires a value (e.g. --python python3.12 or --python /usr/bin/python3.12)"
                exit 1
            fi
            PYTHON_OVERRIDE="$2"
            shift 2
            ;;
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
            echo "  --python <cmd>    Use a specific Python interpreter (also via SPEECH2TEXT_PYTHON)"
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

# Distro-agnostic Python selection
python_candidate_exists() {
    local candidate="$1"
    if [[ "$candidate" == */* ]]; then
        [ -x "$candidate" ]
    else
        command_exists "$candidate"
    fi
}

resolve_python_candidate() {
    local candidate="$1"
    if [[ "$candidate" == */* ]]; then
        echo "$candidate"
    else
        command -v "$candidate" 2>/dev/null || true
    fi
}

get_python_version_major_minor() {
    local python_bin="$1"
    "$python_bin" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1
}

select_python() {
    local override="${PYTHON_OVERRIDE:-${SPEECH2TEXT_PYTHON:-}}"
    local candidates=()

    if [ -n "$override" ]; then
        candidates+=("$override")
    fi

    # Prefer versions that are most likely to have compatible wheels (Torch/Whisper)
    # Prefer 3.12 first as it tends to have the most compatible ML wheels across distros.
    candidates+=("python3.12" "python3.13" "python3.11" "python3.10" "python3.9" "python3.8" "python3")

    local checked_any=false
    local last_problem=""

    for c in "${candidates[@]}"; do
        if ! python_candidate_exists "$c"; then
            continue
        fi

        local py
        py="$(resolve_python_candidate "$c")"
        if [ -z "$py" ]; then
            continue
        fi

        checked_any=true

        local v
        v="$(get_python_version_major_minor "$py")"
        if [ -z "$v" ]; then
            last_problem="Unable to determine Python version for: $py"
            if [ -n "$override" ] && [ "$c" = "$override" ]; then
                error_exit "$last_problem"
            fi
            continue
        fi

        # Minimum supported for this project
        if ! version_ge "$v" "3.8"; then
            last_problem="Python $v detected at $py. Python 3.8+ is required."
            if [ -n "$override" ] && [ "$c" = "$override" ]; then
                error_exit "$last_problem"
            fi
            continue
        fi

        # Fail-fast on 3.14+ due to likely Torch/Whisper incompatibilities
        if version_ge "$v" "3.14"; then
            last_problem="Python $v detected at $py, which is not supported yet."
            if [ -n "$override" ] && [ "$c" = "$override" ]; then
                error_exit "$last_problem"$'\n\n'"Please install a supported Python (recommended: 3.12 or 3.13) and re-run with:"$'\n'"  $0 --python python3.12"
            fi
            # If this is an auto candidate, skip and try older versions
            continue
        fi

        # Check that venv works for this interpreter
        if ! "$py" -c "import venv" >/dev/null 2>&1; then
            last_problem="Python venv support is not available for $py (Python $v)."
            if [ -n "$override" ] && [ "$c" = "$override" ]; then
                error_exit "$last_problem"$'\n\n'"Install the venv module for this Python interpreter (often a separate system package), then retry."
            fi
            continue
        fi

        PYTHON="$py"
        PYTHON_VERSION="$v"
        return 0
    done

    if [ "$checked_any" = false ]; then
        error_exit "No usable Python interpreter found on PATH."$'\n\n'"Please install Python 3.8–3.13 and re-run with:"$'\n'"  $0 --python python3.12"
    fi

    # If we checked at least one and none worked, provide a consolidated message
    error_exit "Could not find a compatible Python interpreter."$'\n'"Last problem: $last_problem"$'\n\n'"Please install Python 3.8–3.13 (recommended: 3.12/3.13) and re-run with:"$'\n'"  $0 --python python3.12"
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

# Select Python interpreter early (distro-agnostic)
print_status "Selecting Python interpreter..."
select_python
print_status "Using Python: $PYTHON (version $PYTHON_VERSION)"

# Check for required system dependencies
check_system_dependencies() {
    local missing_deps=()
    local missing_python_version=false

    # Check for Python 3.8+
    if [ -z "${PYTHON:-}" ]; then
        print_error "No Python interpreter selected."
        missing_deps+=("python (3.8–3.13)")
    elif ! version_ge "$PYTHON_VERSION" "3.8"; then
        print_warning "Python $PYTHON_VERSION detected. Python 3.8+ is required"
        missing_python_version=true
    else
        print_status "Python $PYTHON_VERSION (compatible)"
    fi

    # pip is installed inside the service virtualenv (via venv/ensurepip), so we do not
    # require pip to be available on the base interpreter here.

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

    # Note: D-Bus bindings are provided by the service venv via dbus-next (pure Python),
    # so we intentionally do NOT require system-provided dbus-python / PyGObject here.

    # If there are missing dependencies, provide guidance
    if [ ${#missing_deps[@]} -gt 0 ] || [ "$missing_python_version" = true ]; then
        echo
        print_warning "Some dependencies are missing or outdated"
        echo
        
        echo -e "${CYAN}Required dependencies:${NC}"
        printf '%s\n' "${missing_deps[@]}"
        echo
        
        echo -e "${CYAN}Please install these dependencies using your distribution's package manager (for the selected Python interpreter).${NC}"
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
SERVICE_DIR="$HOME/.local/share/gnome-speech2text-service"
VENV_DIR="$SERVICE_DIR/venv"

print_status "Creating service directory: $SERVICE_DIR"
mkdir -p "$SERVICE_DIR"

print_status "Creating Python virtual environment..."
if ! "$PYTHON" -m venv "$VENV_DIR" 2>/dev/null; then
    print_error "Failed to create virtual environment. python3-venv may not be installed."
    echo ""
    echo "Please install venv support for the selected Python interpreter using your distribution's package manager."
    error_exit "Python venv support is required. Please install it and run this script again."
fi

print_status "Upgrading pip..."
if [ ! -x "$VENV_DIR/bin/pip" ]; then
    print_warning "pip was not created in the venv; attempting to bootstrap with ensurepip..."
    "$VENV_DIR/bin/python" -m ensurepip --upgrade || true
fi
"$VENV_DIR/bin/python" -m pip install --upgrade pip

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
            REQUIRED_SERVICE_VERSION="1.0.8"
            
            # Try PyPI installation with fallback
            # Require the service version that includes dbus-next (no dbus-python/PyGObject build deps).
            if "$VENV_DIR/bin/pip" install --upgrade "gnome-speech2text-service>=$REQUIRED_SERVICE_VERSION"; then
                echo "✅ Installed from PyPI: https://pypi.org/project/gnome-speech2text-service/"
            else
                echo ""
                print_warning "PyPI installation failed!"
                echo "This installer requires gnome-speech2text-service >= $REQUIRED_SERVICE_VERSION."
                echo "If you are developing locally, re-run with --local to install from this repository."
                
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
                    error_exit "PyPI installation failed. If you installed the extension from GNOME Extensions, please update the service package on PyPI and try again."
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
            if [ -f "$SRC_DIR/data/org.gnome.Shell.Extensions.Speech2Text.service" ]; then
                sed "s|/usr/bin/speech2text-service|$SERVICE_DIR/gnome-speech2text-service|g" \
                    "$SRC_DIR/data/org.gnome.Shell.Extensions.Speech2Text.service" | \
                    grep -vE '^User=' > "$DBUS_SERVICE_DIR/org.gnome.Shell.Extensions.Speech2Text.service"
                echo "✅ D-Bus service file installed from local data"
            else
                # Fallback: create directly if data file isn't present
                cat > "$DBUS_SERVICE_DIR/org.gnome.Shell.Extensions.Speech2Text.service" << EOF
[D-BUS Service]
Name=org.gnome.Shell.Extensions.Speech2Text
Exec=$SERVICE_DIR/gnome-speech2text-service
EOF
                echo "✅ D-Bus service file created (fallback)"
            fi
            ;;
            
        "pypi")
            # Create D-Bus service file directly (since data files aren't included in PyPI package for GNOME compliance)
            cat > "$DBUS_SERVICE_DIR/org.gnome.Shell.Extensions.Speech2Text.service" << EOF
[D-BUS Service]
Name=org.gnome.Shell.Extensions.Speech2Text
Exec=$SERVICE_DIR/gnome-speech2text-service
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
echo "  dbus-send --session --dest=org.gnome.Shell.Extensions.Speech2Text --print-reply /org/gnome/Shell/Extensions/Speech2Text org.gnome.Shell.Extensions.Speech2Text.GetServiceStatus"
echo ""
echo -e "${YELLOW}To uninstall the service:${NC}"
echo "  rm -rf $SERVICE_DIR"
echo "  rm $DBUS_SERVICE_DIR/org.gnome.Shell.Extensions.Speech2Text.service"
echo "  rm $DESKTOP_DIR/gnome-speech2text-service.desktop"
echo ""
echo -e "${GREEN}🎉 Service installation completed successfully!${NC}"
echo -e "${GREEN}The service is ready to be used by the GNOME Shell extension.${NC}"


