#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$PROJECT_ROOT/src"
DIST_DIR="$PROJECT_ROOT/dist"

echo -e "${BLUE}Packaging GNOME Speech2Text Extension...${NC}"

# Create dist directory if it doesn't exist
mkdir -p "$DIST_DIR"

# Create temporary directory
TEMP_DIR=$(mktemp -d)
EXTENSION_DIR="$TEMP_DIR/gnome-speech2text@klocal"

echo -e "${YELLOW}Creating extension directory...${NC}"
# Create extension directory
mkdir -p "$EXTENSION_DIR"

echo -e "${YELLOW}Copying extension files...${NC}"
# Copy core extension files
cp -r "$SRC_DIR/extension.js" "$EXTENSION_DIR/"
cp -r "$SRC_DIR/lib" "$EXTENSION_DIR/"
cp -r "$SRC_DIR/metadata.json" "$EXTENSION_DIR/"
cp -r "$SRC_DIR/whisper_typing.py" "$EXTENSION_DIR/"
cp -r "$SRC_DIR/schemas" "$EXTENSION_DIR/"
cp -r "$SRC_DIR/icons" "$EXTENSION_DIR/"

echo -e "${YELLOW}Copying project files...${NC}"
# Copy project files
cp -r "$PROJECT_ROOT/requirements.txt" "$EXTENSION_DIR/"
cp -r "$PROJECT_ROOT/README.md" "$EXTENSION_DIR/"

echo -e "${YELLOW}Copying scripts directory...${NC}"
# Copy entire scripts directory
cp -r "$SCRIPT_DIR" "$EXTENSION_DIR/scripts"

echo -e "${YELLOW}Copying documentation...${NC}"
# Copy any documentation files if they exist
if [ -f "$PROJECT_ROOT/LICENSE" ]; then
    cp "$PROJECT_ROOT/LICENSE" "$EXTENSION_DIR/"
fi

if [ -f "$PROJECT_ROOT/CHANGELOG.md" ]; then
    cp "$PROJECT_ROOT/CHANGELOG.md" "$EXTENSION_DIR/"
fi

# Create zip file
echo -e "${YELLOW}Creating zip package...${NC}"
cd "$EXTENSION_DIR" || exit
zip -r "$DIST_DIR/gnome-speech2text@kaveh.page.zip" . >/dev/null

# Get zip file size
ZIP_SIZE=$(du -h "$DIST_DIR/gnome-speech2text@kaveh.page.zip" | cut -f1)

# Clean up
echo -e "${YELLOW}Cleaning up temporary files...${NC}"
rm -rf "$TEMP_DIR"

echo ""
echo -e "${GREEN}✅ Extension packaged successfully!${NC}"
echo -e "${GREEN}   📦 Package: dist/gnome-speech2text@kaveh.page.zip${NC}"
echo -e "${GREEN}   📏 Size: ${ZIP_SIZE}${NC}"
echo ""
echo -e "${BLUE}📋 Package contents:${NC}"
echo "   • Extension core files (extension.js, metadata.json, etc.)"
echo "   • Modular library files (lib/ directory with utility modules)"
echo "   • Python scripts (whisper_typing.py)"
echo "   • All installation scripts (install.sh, uninstall.sh, setup_env.sh, etc.)"
echo "   • GSettings schemas"
echo "   • Icons and assets"
echo "   • Documentation (README.md, LICENSE, etc.)"
echo ""
echo -e "${YELLOW}💡 To install: Run ./scripts/install.sh from the extracted package${NC}"
