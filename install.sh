#!/bin/bash

# GNOME Speech2Text Extension - Unified Installation Script
# This script handles complete installation of both the D-Bus service and GNOME extension

set -e

# Script info
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_NAME="GNOME Speech2Text Installer"

# Check if running interactively
INTERACTIVE=true
if [ ! -t 0 ] || [ ! -t 1 ]; then
    INTERACTIVE=false
    echo "Running in non-interactive mode"
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
        echo -e "${CYAN}❓ ${prompt}${default} (non-interactive default)${NC}"
        response="$default"
    fi
    
    echo "$response"
}

# Check if we're in the correct directory
check_project_structure() {
    print_section "Verifying Project Structure"
    
    if [ ! -f "$SCRIPT_DIR/Makefile" ]; then
        error_exit "Makefile not found. Are you running this from the project root?"
    fi
    
    if [ ! -d "$SCRIPT_DIR/speech2text-service" ]; then
        error_exit "speech2text-service directory not found. Are you running this from the project root?"
    fi
    
    if [ ! -d "$SCRIPT_DIR/src" ]; then
        error_exit "src directory not found. Are you running this from the project root?"
    fi
    
    if [ ! -f "$SCRIPT_DIR/speech2text-service/install.sh" ]; then
        error_exit "D-Bus service installer not found."
    fi
    
    print_status "Project structure verified"
}

# Detect the Linux distribution
detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO="$ID"
        DISTRO_VERSION="$VERSION_ID"
    elif command_exists lsb_release; then
        DISTRO=$(lsb_release -si | tr '[:upper:]' '[:lower:]')
        DISTRO_VERSION=$(lsb_release -sr)
    else
        DISTRO="unknown"
        DISTRO_VERSION="unknown"
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

# Install D-Bus service
install_dbus_service() {
    print_section "Installing D-Bus Service"
    
    print_info "The D-Bus service handles speech recognition and runs in the background"
    
    cd "$SCRIPT_DIR/speech2text-service"
    
    # Check if service installer exists and is executable
    if [ ! -x "install.sh" ]; then
        chmod +x install.sh
    fi
    
    print_info "Running D-Bus service installer..."
    
    # Run the service installer
    if [ "$INTERACTIVE" = true ]; then
        ./install.sh
    else
        echo "y" | ./install.sh
    fi
    
    cd "$SCRIPT_DIR"
    print_status "D-Bus service installation completed"
}

# Install GNOME extension
install_gnome_extension() {
    print_section "Installing GNOME Extension"
    
    print_info "Installing extension files and compiling schemas..."
    
    # Use the Makefile for extension installation
    if ! make clean-install; then
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
    echo -e "   - Press Ctrl+Shift+Alt+C (default shortcut)"
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