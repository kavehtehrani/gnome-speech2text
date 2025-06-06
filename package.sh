#!/bin/bash

# Create a temporary directory
TEMP_DIR=$(mktemp -d)
EXTENSION_DIR="$TEMP_DIR/whisper-typing@kaveh.page"

# Create the extension directory
mkdir -p "$EXTENSION_DIR"

# Copy necessary files
cp extension.js "$EXTENSION_DIR/"
cp metadata.json "$EXTENSION_DIR/"
cp whisper_typing.py "$EXTENSION_DIR/"
cp requirements.txt "$EXTENSION_DIR/"
cp setup_env.sh "$EXTENSION_DIR/"
cp -r schemas "$EXTENSION_DIR/"
cp -r icons "$EXTENSION_DIR/"

# Create the zip file
cd "$TEMP_DIR"
zip -r whisper-typing@kaveh.page.zip whisper-typing@kaveh.page

# Move the zip file to the current directory
mv whisper-typing@kaveh.page.zip "$OLDPWD/"

# Clean up
rm -rf "$TEMP_DIR"

echo "Extension packaged successfully as whisper-typing@kaveh.page.zip" 