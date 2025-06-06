#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$PROJECT_ROOT/src"

echo -e "${YELLOW}Building .deb package for GNOME Speech2Text GNOME Extension...${NC}"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}Please don't run this script as root${NC}"
    exit 1
fi

# Create temporary build directory
BUILD_DIR=$(mktemp -d)
DEB_DIR="$BUILD_DIR/gnome-speech2text_1.0-1"
mkdir -p "$DEB_DIR/DEBIAN"
mkdir -p "$DEB_DIR/usr/share/gnome-shell/extensions/gnome-speech2text@kaveh.page"
mkdir -p "$DEB_DIR/usr/share/doc/gnome-speech2text"

# Create control file
cat > "$DEB_DIR/DEBIAN/control" << EOF
Package: gnome-speech2text
Version: 1.0-1
Section: gnome
Priority: optional
Architecture: all
Depends: gnome-shell (>= 45), python3 (>= 3.8), python3-pip, ffmpeg
Maintainer: Kaveh Tehrani <kaveh@kaveh.page>
Description: GNOME Shell extension for speech-to-text using Whisper
 GNOME Speech2Text is a GNOME Shell extension that adds speech-to-text
 functionality using OpenAI's Whisper model. Speak into your microphone
 and have your words automatically typed out.
EOF

# Create postinst script
cat > "$DEB_DIR/DEBIAN/postinst" << EOF
#!/bin/bash
set -e

# Set permissions
chmod 755 /usr/share/gnome-shell/extensions/gnome-speech2text@kaveh.page
chmod 755 /usr/share/gnome-shell/extensions/gnome-speech2text@kaveh.page/setup_env.sh

# Create virtual environment and install dependencies
cd /usr/share/gnome-shell/extensions/gnome-speech2text@kaveh.page
python3 -m venv venv
./venv/bin/pip install -r requirements.txt

# Compile schemas
glib-compile-schemas schemas/

# Enable the extension
gnome-extensions enable gnome-speech2text@kaveh.page

exit 0
EOF

# Create prerm script
cat > "$DEB_DIR/DEBIAN/prerm" << EOF
#!/bin/bash
set -e

# Disable the extension
gnome-extensions disable gnome-speech2text@kaveh.page

exit 0
EOF

# Create postrm script
cat > "$DEB_DIR/DEBIAN/postrm" << EOF
#!/bin/bash
set -e

# Remove the extension directory
rm -rf /usr/share/gnome-shell/extensions/gnome-speech2text@kaveh.page

exit 0
EOF

# Make scripts executable
chmod 755 "$DEB_DIR/DEBIAN/postinst"
chmod 755 "$DEB_DIR/DEBIAN/prerm"
chmod 755 "$DEB_DIR/DEBIAN/postrm"

# Copy extension files
cp -r "$SRC_DIR/extension.js" "$DEB_DIR/usr/share/gnome-shell/extensions/gnome-speech2text@kaveh.page/"
cp -r "$SRC_DIR/metadata.json" "$DEB_DIR/usr/share/gnome-shell/extensions/gnome-speech2text@kaveh.page/"
cp -r "$SRC_DIR/whisper_typing.py" "$DEB_DIR/usr/share/gnome-shell/extensions/gnome-speech2text@kaveh.page/"
cp -r "$PROJECT_ROOT/requirements.txt" "$DEB_DIR/usr/share/gnome-shell/extensions/gnome-speech2text@kaveh.page/"
cp -r "$SCRIPT_DIR/setup_env.sh" "$DEB_DIR/usr/share/gnome-shell/extensions/gnome-speech2text@kaveh.page/"
cp -r "$SRC_DIR/schemas" "$DEB_DIR/usr/share/gnome-shell/extensions/gnome-speech2text@kaveh.page/"
cp -r "$SRC_DIR/icons" "$DEB_DIR/usr/share/gnome-shell/extensions/gnome-speech2text@kaveh.page/"

# Copy documentation
cp "$PROJECT_ROOT/README.md" "$DEB_DIR/usr/share/doc/gnome-speech2text/"

# Build the package
echo -e "${YELLOW}Building .deb package...${NC}"
dpkg-deb --build "$DEB_DIR" "$PROJECT_ROOT/dist/gnome-speech2text_1.0-1_all.deb"

# Clean up
rm -rf "$BUILD_DIR"

echo -e "${GREEN}.deb package built successfully: dist/gnome-speech2text_1.0-1_all.deb${NC}"
echo -e "${YELLOW}You can install it using:${NC}"
echo -e "  sudo dpkg -i dist/gnome-speech2text_1.0-1_all.deb"
echo -e "  sudo apt-get install -f  # Install any missing dependencies" 