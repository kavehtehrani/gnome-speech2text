#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$PROJECT_ROOT/src"

# Create a temporary directory
TEMP_DIR=$(mktemp -d)
EXTENSION_DIR="$TEMP_DIR/whisper-typing@kaveh.page"

# Create the extension directory
mkdir -p "$EXTENSION_DIR"

# Copy necessary files
cp "$SRC_DIR/extension.js" "$EXTENSION_DIR/"
cp "$SRC_DIR/metadata.json" "$EXTENSION_DIR/"
cp "$SRC_DIR/whisper_typing.py" "$EXTENSION_DIR/"
cp "$PROJECT_ROOT/requirements.txt" "$EXTENSION_DIR/"
cp "$SCRIPT_DIR/setup_env.sh" "$EXTENSION_DIR/"
cp -r "$SRC_DIR/schemas" "$EXTENSION_DIR/"
cp -r "$SRC_DIR/icons" "$EXTENSION_DIR/"

# Create the zip file
cd "$TEMP_DIR"
zip -r whisper-typing@kaveh.page.zip whisper-typing@kaveh.page

# Move the zip file to the dist directory
mkdir -p "$PROJECT_ROOT/dist"
mv whisper-typing@kaveh.page.zip "$PROJECT_ROOT/dist/"

# Clean up
rm -rf "$TEMP_DIR"

echo "Extension packaged successfully as dist/whisper-typing@kaveh.page.zip" 