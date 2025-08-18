#!/bin/bash

# GNOME Speech2Text Extension - Unified Installation Script
# This script handles complete installation of both the D-Bus service and GNOME extension

set -e

# Script info
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_NAME="GNOME Speech2Text Installer"

# Check if running interactively
INTERACTIVE=true
NON_INTERACTIVE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --non-interactive)
            NON_INTERACTIVE=true
            shift
            ;;
        --help|-h)
            echo "GNOME Speech2Text Extension Installer"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --non-interactive Run without user prompts (auto-accept defaults)"
            echo "  --help            Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

if [ ! -t 0 ] || [ ! -t 1 ] || [ "$NON_INTERACTIVE" = true ]; then
    INTERACTIVE=false
    if [ "$NON_INTERACTIVE" = true ]; then
        echo "Running in non-interactive mode (--non-interactive flag)"
    else
        echo "Running in non-interactive mode"
    fi
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Emoji for better UX (fallback to text if not supported)
CHECK="✅"
CROSS="❌"
WARNING="⚠️"
INFO="ℹ️"
ROCKET="🚀"
MIC="🎤"

print_header() {
    echo -e "\n${BOLD}${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${BLUE}║                    ${SCRIPT_NAME}                     ║${NC}"
    echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}\n"
}

print_section() {
    echo -e "\n${BOLD}${CYAN}📋 $1${NC}"
    echo -e "${CYAN}$(printf '%.60s' "──────────────────────────────────────────────────────────────")${NC}"
}

print_status() {
    echo -e "${GREEN}${CHECK}${NC} $1"
}

print_info() {
    echo -e "${BLUE}${INFO}${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}${WARNING}${NC} $1"
}

print_error() {
    echo -e "${RED}${CROSS}${NC} $1"
}

error_exit() {
    print_error "$1"
    echo -e "\n${RED}Installation failed. Check the error above and try again.${NC}"
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
        # Ensure the prompt is visible by using both printf and ensuring it flushes
        printf "\n${CYAN}❓ %s${NC}" "$prompt" >&2
        read -r response
        if [ -z "$response" ]; then
            response="$default"
        fi
    else
        echo -e "${CYAN}❓ ${prompt}${default} (non-interactive default)${NC}" >&2
        response="$default"
    fi
    
    echo "$response"
}

# Check if we're in the correct directory and detect installation mode
check_project_structure() {
    print_section "Verifying Project Structure"
    
    # Check for extension files
    if [ ! -d "$SCRIPT_DIR/src" ]; then
        error_exit "src directory not found. Are you running this from the project root?"
    fi
    
    if [ ! -f "$SCRIPT_DIR/Makefile" ]; then
        error_exit "Makefile not found. Are you running this from the project root?"
    fi
    
    # Check if service directory exists (full repo) or not (GNOME store download)
    if [ -d "$SCRIPT_DIR/service" ] && [ -f "$SCRIPT_DIR/service/pyproject.toml" ]; then
        INSTALL_MODE="full_repo"
        print_status "Full repository detected - will install service from local source"
    else
        INSTALL_MODE="extension_only"
        print_status "Extension-only installation - service will be installed from PyPI"
        print_info "This appears to be a GNOME Extensions store download"
    fi
    
    print_status "Project structure verified (mode: $INSTALL_MODE)"
}

# Detect the Linux distribution
detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO="$ID"
    elif command_exists lsb_release; then
        DISTRO=$(lsb_release -si | tr '[:upper:]' '[:lower:]')
    else
        DISTRO="unknown"
    fi
}

# Check system dependencies
check_system_deps() {
    print_section "Checking System Dependencies"
    
    local missing_deps=()
    local missing_python_version=false
    
    # Check GNOME Shell
    if command_exists gnome-shell; then
        local gnome_version
        gnome_version=$(gnome-shell --version | grep -oE '[0-9]+' | head -1)
        if [ "$gnome_version" -ge 46 ]; then
            print_status "GNOME Shell $gnome_version (compatible)"
        else
            print_warning "GNOME Shell $gnome_version detected. This extension requires GNOME 46+"
        fi
    else
        print_error "GNOME Shell not found. This extension requires GNOME Shell 46+"
        missing_deps+=("gnome-shell")
    fi
    
    # Check Python
    if command_exists python3; then
        local python_version
        python_version=$(python3 --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
        if version_ge "$python_version" "3.8"; then
            print_status "Python $python_version (compatible)"
        else
            print_warning "Python $python_version detected. Python 3.8+ recommended"
            missing_python_version=true
        fi
    else
        print_error "Python 3 not found"
        missing_deps+=("python3")
    fi
    
    # Check pip
    if command_exists pip3 || command_exists pip; then
        print_status "Python pip found"
    else
        print_warning "Python pip not found"
        missing_deps+=("python3-pip")
    fi
    
    # Check FFmpeg
    if command_exists ffmpeg; then
        print_status "FFmpeg found"
    else
        print_error "FFmpeg not found (required for audio recording)"
        missing_deps+=("ffmpeg")
    fi
    
    # Check xdotool (for text insertion on X11 only)
    if [ "${XDG_SESSION_TYPE:-}" != "wayland" ]; then
        if command_exists xdotool; then
            print_status "xdotool found (text insertion support)"
        else
            print_warning "xdotool not found (text insertion on X11 will not work)"
            missing_deps+=("xdotool")
        fi
    else
        print_status "Skipping xdotool check (not needed for Wayland sessions)"
    fi
    
    # Check clipboard tools (session-type specific)
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
    
    # Check make
    if command_exists make; then
        print_status "make found"
    else
        print_error "make not found (required for extension installation)"
        missing_deps+=("make")
    fi
    
    # If there are missing dependencies, offer to install them
    if [ ${#missing_deps[@]} -gt 0 ] || [ "$missing_python_version" = true ]; then
        echo
        print_warning "Some dependencies are missing or outdated"
        echo
        
        detect_distro
        
        case "$DISTRO" in
            ubuntu|debian)
                echo -e "${CYAN}To install missing dependencies, run:${NC}"
                echo -e "${BOLD}sudo apt update && sudo apt install ${missing_deps[*]}${NC}"
                ;;
            *)
                echo -e "${CYAN}This extension has only been tested on Ubuntu/Debian.${NC}"
                echo -e "${CYAN}Missing dependencies:${NC}"
                printf '%s\n' "${missing_deps[@]}"
                echo -e "${CYAN}Please install these using your distribution's package manager.${NC}"
                ;;
        esac
        
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

# Create a standalone service installer for GNOME Extensions store downloads
create_standalone_service_installer() {
    TEMP_INSTALLER=$(mktemp)
    
    cat > "$TEMP_INSTALLER" << 'EOF'
#!/bin/bash

set -e

# Parse command line arguments
INSTALL_MODE=""
FORCE_MODE=false

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
        --help|-h)
            echo "GNOME Speech2Text Service Installer"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --local    Force installation from local source (requires pyproject.toml)"
            echo "  --pypi     Force installation from PyPI"
            echo "  --help     Show this help message"
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
if [ ! -t 0 ]; then
    INTERACTIVE=false
    echo "Running in non-interactive mode (piped execution)"
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

# Since this is PyPI mode, force it
INSTALL_MODE="pypi"

print_status "Installing GNOME Speech2Text D-Bus Service from PyPI"

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

# Install from PyPI
print_status "Installing gnome-speech2text-service from PyPI..."

if "$VENV_DIR/bin/pip" install --upgrade gnome-speech2text-service; then
    echo "✅ Installed from PyPI: https://pypi.org/project/gnome-speech2text-service/"
else
    error_exit "PyPI installation failed. Please check your internet connection and try again."
fi

print_status "Creating service wrapper script..."
# Create a wrapper script that activates the venv and runs the service
cat > "$SERVICE_DIR/gnome-speech2text-service" << 'WRAPPER_EOF'
#!/bin/bash
# GNOME Speech2Text Service Wrapper
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"
exec "$VENV_DIR/bin/gnome-speech2text-service" "$@"
WRAPPER_EOF
chmod +x "$SERVICE_DIR/gnome-speech2text-service"

print_status "Installing D-Bus service..."
# Install D-Bus service file
DBUS_SERVICE_DIR="$HOME/.local/share/dbus-1/services"
mkdir -p "$DBUS_SERVICE_DIR"

# Create D-Bus service file directly (PyPI mode)
cat > "$DBUS_SERVICE_DIR/org.gnome.Speech2Text.service" << SERVICE_EOF
[D-BUS Service]
Name=org.gnome.Speech2Text
Exec=$SERVICE_DIR/gnome-speech2text-service
User=session
SERVICE_EOF
echo "✅ D-Bus service file created for PyPI installation"

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
echo -e "${YELLOW}Installation mode: pypi${NC}"
echo -e "${YELLOW}Package source: https://pypi.org/project/gnome-speech2text-service/${NC}"
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
EOF

    chmod +x "$TEMP_INSTALLER"
}

# Install D-Bus service
install_dbus_service() {
    print_section "Installing D-Bus Service"
    
    print_info "The D-Bus service handles speech recognition and runs in the background"
    
    case "$INSTALL_MODE" in
        "full_repo")
            print_info "Installing service from local repository..."
            # Use bundled installer; it auto-detects ../service/ for local source
            local bundled_script="$SCRIPT_DIR/src/install-service.sh"
            if [ ! -f "$bundled_script" ]; then
                error_exit "Bundled installer not found: $bundled_script"
            fi
            if [ ! -x "$bundled_script" ]; then
                chmod +x "$bundled_script"
            fi

            if [ "$INTERACTIVE" = true ]; then
                bash "$bundled_script" --local
            else
                bash "$bundled_script" --local --non-interactive
            fi
            ;;
            
        "extension_only")
            print_info "Installing service from PyPI (GNOME Extensions store mode)..."

            # Use the bundled installer script included with the extension package
            local bundled_script="$SCRIPT_DIR/src/install-service.sh"
            if [ ! -f "$bundled_script" ]; then
                error_exit "Bundled installer not found: $bundled_script"
            fi
            if [ ! -x "$bundled_script" ]; then
                chmod +x "$bundled_script"
            fi

            if [ "$INTERACTIVE" = true ]; then
                bash "$bundled_script" --pypi
            else
                bash "$bundled_script" --pypi --non-interactive
            fi
            ;;
    esac
    
    print_status "D-Bus service installation completed"
}

# Install GNOME extension
install_gnome_extension() {
    print_section "Installing GNOME Extension"
    
    print_info "Installing extension files and compiling schemas..."
    
    # Use the Makefile for extension installation
    if ! make setup; then
        error_exit "Failed to install extension files"
    fi
    
    print_info "Compiling GSettings schemas..."
    if ! make compile-schemas; then
        error_exit "Failed to compile GSettings schemas"
    fi
    
    print_status "GNOME extension installation completed"
}

# Provide GNOME Shell restart instructions
restart_gnome_shell() {
    print_section "GNOME Shell Restart Required"
    
    print_info "To complete the installation, you need to restart GNOME Shell:"
    echo
    
    if [ "${XDG_SESSION_TYPE:-}" = "x11" ]; then
        print_status "X11 session detected"
        echo -e "${CYAN}To restart GNOME Shell:${NC}"
        echo -e "  1. Press ${BOLD}Alt+F2${NC}"
        echo -e "  2. Type ${BOLD}r${NC}"
        echo -e "  3. Press ${BOLD}Enter${NC}"
    elif [ "${XDG_SESSION_TYPE:-}" = "wayland" ]; then
        print_status "Wayland session detected"
        echo -e "${CYAN}To restart GNOME Shell:${NC}"
        echo -e "  1. ${BOLD}Log out${NC} of your current session"
        echo -e "  2. ${BOLD}Log back in${NC}"
    else
        print_warning "Unknown session type"
        echo -e "${CYAN}To restart GNOME Shell:${NC}"
        echo -e "  ${BOLD}X11:${NC} Alt+F2 → type 'r' → Enter"
        echo -e "  ${BOLD}Wayland:${NC} Log out and log back in"
    fi
    
    echo
    print_info "After restarting, the extension will be ready to enable"
}

# Show post-installation instructions
show_post_install() {
    print_section "Installation Complete"
    
    echo -e "${GREEN}${ROCKET} Installation completed successfully!${NC}\n"
    
    echo -e "${BOLD}Next Steps:${NC}"
    echo -e "${CYAN}1.${NC} ${BOLD}Restart GNOME Shell first${NC} (see instructions above)"
    echo
    
    echo -e "${CYAN}2.${NC} Enable the extension:"
    echo -e "   - Open GNOME Extensions app (or GNOME Tweaks)"
    echo -e "   - Enable 'GNOME Speech2Text'"
    echo
    
    echo -e "${CYAN}3.${NC} Look for the ${MIC} microphone icon in your top panel"
    echo
    
    echo -e "${CYAN}4.${NC} Start using speech-to-text:"
    echo -e "   - Click the microphone icon, or"
    echo -e "   - Press Alt+Super+R (default shortcut)"
    echo
    
    echo -e "${CYAN}5.${NC} Configure settings:"
    echo -e "   - Right-click the microphone icon → Settings"
    echo
    
    if [ "${XDG_SESSION_TYPE:-}" = "wayland" ]; then
        echo -e "${YELLOW}${WARNING} Wayland Note:${NC}"
        echo -e "   Text insertion has limitations on Wayland due to security restrictions."
        echo -e "   Copy to clipboard will always work as an alternative."
        echo
    fi
    
    print_info "For troubleshooting, check the README.md file"
    print_info "To uninstall: run 'make clean' from this directory"
    
    echo -e "\n${GREEN}${MIC} Happy speech-to-texting! ${MIC}${NC}"
}

# Check if already installed
check_existing_installation() {
    local extension_dir="$HOME/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page"
    local service_dir="$HOME/.local/share/gnome-speech2text-service"
    
    if [ -d "$extension_dir" ] || [ -d "$service_dir" ]; then
        print_section "Existing Installation Detected"
        
        if [ -d "$extension_dir" ]; then
            print_info "GNOME extension is already installed"
        fi
        
        if [ -d "$service_dir" ]; then
            print_info "D-Bus service is already installed"
        fi
        
        echo
        local reinstall
        reinstall=$(ask_user "Reinstall/update the extension? (Y/n): " "y")
        
        if [[ ! "$reinstall" =~ ^[Yy]$ ]] && [ -n "$reinstall" ]; then
            print_info "Installation cancelled by user"
            exit 0
        fi
        
        print_info "Proceeding with reinstallation..."
    fi
}

# Main installation function
main() {
    print_header
    
    print_info "This script will install GNOME Speech2Text extension and its D-Bus service"
    print_info "Installation location: ~/.local/share/"
    print_info "You may need sudo to install missing system dependencies"
    echo
    
    local proceed
    proceed=$(ask_user "Continue with installation? (Y/n): " "y")
    if [[ ! "$proceed" =~ ^[Yy]$ ]] && [ -n "$proceed" ]; then
        print_info "Installation cancelled by user"
        exit 0
    fi
    
    check_project_structure
    check_existing_installation
    check_system_deps
    install_dbus_service
    install_gnome_extension
    restart_gnome_shell
    show_post_install
}

# Handle script interruption
trap 'echo -e "\n${RED}Installation interrupted by user${NC}"; exit 1' INT TERM

# Run main function
main "$@"