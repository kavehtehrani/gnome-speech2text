#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$PROJECT_ROOT/src"

# Create temporary directory
TEMP_DIR=$(mktemp -d)
EXTENSION_DIR="$TEMP_DIR/gnome-speech2text@kaveh.page"

# Create extension directory
mkdir -p "$EXTENSION_DIR"

# Copy files
cp -r "$SRC_DIR/extension.js" "$EXTENSION_DIR/"
cp -r "$SRC_DIR/metadata.json" "$EXTENSION_DIR/"
cp -r "$SRC_DIR/whisper_typing.py" "$EXTENSION_DIR/"
cp -r "$PROJECT_ROOT/requirements.txt" "$EXTENSION_DIR/"
cp -r "$SCRIPT_DIR/setup_env.sh" "$EXTENSION_DIR/"
cp -r "$SRC_DIR/schemas" "$EXTENSION_DIR/"
cp -r "$SRC_DIR/icons" "$EXTENSION_DIR/"

# Create zip file
cd "$TEMP_DIR" || exit
zip -r "$PROJECT_ROOT/dist/gnome-speech2text@kaveh.page.zip" "gnome-speech2text@kaveh.page"

# Clean up
rm -rf "$TEMP_DIR"

echo -e "${GREEN}Extension packaged successfully: dist/gnome-speech2text@kaveh.page.zip${NC}" 