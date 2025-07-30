# GNOME Speech2Text Extension - Makefile
# Automates common development and installation tasks

EXTENSION_UUID = gnome-speech2text@kaveh.page
EXTENSION_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)
SOURCE_DIR = src
SCHEMAS_DIR = $(EXTENSION_DIR)/schemas
SCHEMA_ID = org.shell.extensions.speech2text

.PHONY: help install compile-schemas restart-shell clean clean-service package dev-install clean-install status verify-schema

# Default target
help:
	@echo "GNOME Speech2Text Extension - Development Automation"
	@echo "=================================================="
	@echo ""
	@echo "Available targets:"
	@echo "  install          - Install extension + compile schemas"
	@echo "  clean-install    - Clean old files + install (recommended)"
	@echo "  compile-schemas  - Compile GSettings schemas only"
	@echo "  restart-shell    - Restart GNOME Shell (X11 only)"
	@echo "  setup           - Clean install + restart shell"
	@echo "  clean           - Remove installed extension AND D-Bus service"
	@echo "  clean-service   - Remove only D-Bus service (for testing)"
	@echo "  package         - Create distribution package"
	@echo "  dev-install     - Development install (same as install)"
	@echo "  status          - Check extension installation status"
	@echo "  verify-schema   - Verify schema is properly installed"
	@echo ""
	@echo "Usage: make <target>"

# Install extension files and compile schemas
install:
	@echo "📦 Installing extension to $(EXTENSION_DIR)..."
	@mkdir -p $(EXTENSION_DIR)
	@cp -r $(SOURCE_DIR)/* $(EXTENSION_DIR)/
	@cp -r speech2text-service $(EXTENSION_DIR)/
	@echo "✅ Extension files installed successfully!"
	@echo "🔧 Compiling GSettings schemas..."
	@glib-compile-schemas $(SCHEMAS_DIR)
	@if [ -f "$(SCHEMAS_DIR)/gschemas.compiled" ]; then \
		echo "✅ Schemas compiled successfully!"; \
	else \
		echo "❌ Schema compilation failed"; \
		exit 1; \
	fi
	@echo "✅ Extension installation completed!"

# Compile GSettings schemas
compile-schemas:
	@echo "🔧 Compiling GSettings schemas..."
	@if [ ! -d "$(SCHEMAS_DIR)" ]; then \
		echo "❌ Schemas directory not found: $(SCHEMAS_DIR)"; \
		echo "   Run 'make install' first"; \
		exit 1; \
	fi
	@glib-compile-schemas $(SCHEMAS_DIR)
	@if [ -f "$(SCHEMAS_DIR)/gschemas.compiled" ]; then \
		echo "✅ Schemas compiled successfully!"; \
	else \
		echo "❌ Schema compilation failed"; \
		exit 1; \
	fi

# Restart GNOME Shell (X11 only)
restart-shell:
	@echo "🔄 Restarting GNOME Shell..."
	@if [ "$(XDG_SESSION_TYPE)" = "x11" ]; then \
		busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s 'Meta.restart("Restarting GNOME Shell")' > /dev/null 2>&1; \
		echo "✅ GNOME Shell restarted (X11)"; \
	elif [ "$(XDG_SESSION_TYPE)" = "wayland" ]; then \
		echo "⚠️  Wayland detected - please log out and log back in"; \
	else \
		echo "⚠️  Unknown session type - manual restart required"; \
	fi

# Complete setup process
setup: clean-install compile-schemas restart-shell
	@echo ""
	@echo "🎉 Extension setup completed!"
	@echo "   The extension should now be available in GNOME Extensions."

# Clean install (ensures old schema files are removed)
clean-install:
	@echo "🧹 Cleaning old installation..."
	@if [ -d "$(EXTENSION_DIR)" ]; then \
		rm -rf $(EXTENSION_DIR); \
		echo "✅ Removed old extension files"; \
	fi
	@echo "📦 Installing extension to $(EXTENSION_DIR)..."
	@mkdir -p $(EXTENSION_DIR)
	@cp -r $(SOURCE_DIR)/* $(EXTENSION_DIR)/
	@cp -r speech2text-service $(EXTENSION_DIR)/
	@echo "✅ Extension installed successfully!"

# Development install (quick iteration)
dev-install: install
	@echo ""
	@echo "🔧 Development install completed!"
	@echo "   Remember to restart GNOME Shell if needed."

# Clean installation (extension + D-Bus service)
clean:
	@echo "🧹 Removing installed extension..."
	@if [ -d "$(EXTENSION_DIR)" ]; then \
		rm -rf $(EXTENSION_DIR); \
		echo "✅ Extension removed from $(EXTENSION_DIR)"; \
	else \
		echo "ℹ️  Extension not found at $(EXTENSION_DIR)"; \
	fi
	@echo "🧹 Removing D-Bus service..."
	@PID=$$(ps aux | grep "speech2text_service.py" | grep -v grep | awk '{print $$2}' | head -1); \
	if [ ! -z "$$PID" ]; then \
		echo "   Found process $$PID, terminating..."; \
		kill $$PID 2>/dev/null || true; \
		sleep 1; \
		echo "   Process terminated"; \
	else \
		echo "   No speech2text processes found"; \
	fi
	@if [ -d "$(HOME)/.local/share/gnome-speech2text-service" ]; then \
		rm -rf $(HOME)/.local/share/gnome-speech2text-service; \
		echo "✅ Service directory removed"; \
	else \
		echo "ℹ️  Service directory not found"; \
	fi
	@if [ -f "$(HOME)/.local/share/dbus-1/services/org.gnome.Speech2Text.service" ]; then \
		rm $(HOME)/.local/share/dbus-1/services/org.gnome.Speech2Text.service; \
		echo "✅ D-Bus service file removed"; \
	else \
		echo "ℹ️  D-Bus service file not found"; \
	fi
	@if [ -f "$(HOME)/.local/share/applications/gnome-speech2text-service.desktop" ]; then \
		rm $(HOME)/.local/share/applications/gnome-speech2text-service.desktop; \
		echo "✅ Desktop entry removed"; \
	else \
		echo "ℹ️  Desktop entry not found"; \
	fi
	@echo "🧹 Resetting extension settings..."
	@gsettings reset $(SCHEMA_ID) first-run 2>/dev/null || echo "ℹ️  Settings already at defaults"
	@echo "🎯 Complete cleanup finished!"

# Clean only D-Bus service (for testing)
clean-service:
	@echo "🧹 Removing D-Bus service only..."
	@PID=$$(ps aux | grep "speech2text_service.py" | grep -v grep | awk '{print $$2}' | head -1); \
	if [ ! -z "$$PID" ]; then \
		echo "   Found process $$PID, terminating..."; \
		kill $$PID 2>/dev/null || true; \
		sleep 1; \
		echo "   Process terminated"; \
	else \
		echo "   No speech2text processes found"; \
	fi
	@if [ -d "$(HOME)/.local/share/gnome-speech2text-service" ]; then \
		rm -rf $(HOME)/.local/share/gnome-speech2text-service; \
		echo "✅ Service directory removed"; \
	else \
		echo "ℹ️  Service directory not found"; \
	fi
	@if [ -f "$(HOME)/.local/share/dbus-1/services/org.gnome.Speech2Text.service" ]; then \
		rm $(HOME)/.local/share/dbus-1/services/org.gnome.Speech2Text.service; \
		echo "✅ D-Bus service file removed"; \
	else \
		echo "ℹ️  D-Bus service file not found"; \
	fi
	@if [ -f "$(HOME)/.local/share/applications/gnome-speech2text-service.desktop" ]; then \
		rm $(HOME)/.local/share/applications/gnome-speech2text-service.desktop; \
		echo "✅ Desktop entry removed"; \
	else \
		echo "ℹ️  Desktop entry not found"; \
	fi
	@echo "🎯 D-Bus service cleanup finished!"

# Create distribution package
package:
	@echo "📦 Creating distribution package..."
	@mkdir -p dist
	@cd $(SOURCE_DIR) && zip -r ../dist/$(EXTENSION_UUID).zip *
	@echo "✅ Package created: dist/$(EXTENSION_UUID).zip"

# Check if extension is enabled
status:
	@echo "📊 Extension Status:"
	@echo "   Directory: $(EXTENSION_DIR)"
	@if [ -d "$(EXTENSION_DIR)" ]; then \
		echo "   ✅ Installed"; \
	else \
		echo "   ❌ Not installed"; \
	fi
	@if [ -f "$(SCHEMAS_DIR)/gschemas.compiled" ]; then \
		echo "   ✅ Schemas compiled"; \
	else \
		echo "   ❌ Schemas not compiled"; \
	fi
	@echo "   Session: $(XDG_SESSION_TYPE)"

# Verify schema installation
verify-schema:
	@echo "🔍 Verifying schema installation..."
	@if [ -f "$(SCHEMAS_DIR)/$(SCHEMA_ID).gschema.xml" ]; then \
		echo "   ✅ Schema file found: $(SCHEMA_ID).gschema.xml"; \
	else \
		echo "   ❌ Schema file missing: $(SCHEMA_ID).gschema.xml"; \
		echo "   Available schemas:"; \
		ls -la $(SCHEMAS_DIR)/*.gschema.xml 2>/dev/null || echo "   No schema files found"; \
	fi
	@if [ -f "$(SCHEMAS_DIR)/gschemas.compiled" ]; then \
		echo "   ✅ Schema compiled successfully"; \
		gsettings list-schemas | grep "$(SCHEMA_ID)" > /dev/null && \
		echo "   ✅ Schema registered with GSettings" || \
		echo "   ❌ Schema not registered with GSettings"; \
	else \
		echo "   ❌ Schema not compiled"; \
	fi 