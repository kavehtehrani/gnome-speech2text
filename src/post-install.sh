#!/bin/bash

# GNOME Speech2Text Extension - Post-Install Schema Compilation
# This script automatically compiles GSettings schemas after installation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 GNOME Speech2Text - Post-Install Setup${NC}"
echo "================================================"

# Determine extension directory
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/gnome-speech2text@kaveh.page"
SCHEMAS_DIR="$EXTENSION_DIR/schemas"

# Check if extension is installed
if [ ! -d "$EXTENSION_DIR" ]; then
    echo -e "${RED}❌ Extension not found at: $EXTENSION_DIR${NC}"
    echo "Please install the extension first."
    exit 1
fi

echo -e "${YELLOW}📁 Extension directory: $EXTENSION_DIR${NC}"

# Check if schemas directory exists
if [ ! -d "$SCHEMAS_DIR" ]; then
    echo -e "${RED}❌ Schemas directory not found: $SCHEMAS_DIR${NC}"
    exit 1
fi

# Check if schema XML file exists
SCHEMA_FILE="$SCHEMAS_DIR/org.gnome.shell.extensions.gnome-speech2text.gschema.xml"
if [ ! -f "$SCHEMA_FILE" ]; then
    echo -e "${RED}❌ Schema file not found: $SCHEMA_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}🔧 Compiling GSettings schemas...${NC}"

# Compile schemas
if glib-compile-schemas "$SCHEMAS_DIR"; then
    echo -e "${GREEN}✅ Schemas compiled successfully!${NC}"
else
    echo -e "${RED}❌ Failed to compile schemas${NC}"
    exit 1
fi

# Check if compiled schema was created
COMPILED_SCHEMA="$SCHEMAS_DIR/gschemas.compiled"
if [ -f "$COMPILED_SCHEMA" ]; then
    echo -e "${GREEN}✅ Compiled schema found: $COMPILED_SCHEMA${NC}"
else
    echo -e "${RED}❌ Compiled schema not created${NC}"
    exit 1
fi

# Detect session type for restart instructions
SESSION_TYPE=$(echo $XDG_SESSION_TYPE)
echo -e "${YELLOW}🔄 Session type detected: $SESSION_TYPE${NC}"

echo -e "${GREEN}🎉 Schema compilation completed successfully!${NC}"
echo ""
echo "Next steps:"
if [ "$SESSION_TYPE" = "x11" ]; then
    echo "  1. Press Alt+F2, type 'r', and press Enter to restart GNOME Shell"
    echo "  2. Or run: busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s 'Meta.restart(\"Restarting\")'"
elif [ "$SESSION_TYPE" = "wayland" ]; then
    echo "  1. Log out and log back in to restart GNOME Shell"
    echo "  2. Or restart your session"
else
    echo "  1. Restart GNOME Shell (method depends on your session type)"
fi

echo "  3. Enable the extension if not already enabled"
echo ""
echo -e "${BLUE}Extension should now work without schema errors!${NC}" 