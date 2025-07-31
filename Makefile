# GNOME Speech2Text Extension - Makefile
# Automates common development and installation tasks

EXTENSION_UUID = gnome-speech2text@kaveh.page
EXTENSION_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)
SOURCE_DIR = src
SCHEMAS_DIR = $(EXTENSION_DIR)/schemas
SCHEMA_ID = org.shell.extensions.speech2text

.PHONY: help install compile-schemas restart-shell clean clean-service package dev-package dev-install clean-install status verify-schema clean-dist test-install

# Default target
help:
	@echo "GNOME Speech2Text Extension - Development Automation"
	@echo "=================================================="
	@echo ""
	@echo "🚀 For easy installation, run: ./install.sh"
	@echo ""
	@echo "Available targets:"
	@echo "  install          - Install extension + compile schemas"
	@echo "  clean-install    - Clean old files + install (recommended)"
	@echo "  compile-schemas  - Compile GSettings schemas only"
	@echo "  restart-shell    - Restart GNOME Shell (X11 only)"
	@echo "  setup           - Clean install + restart shell"
	@echo "  clean           - Remove installed extension AND D-Bus service"
	@echo "  clean-service   - Remove only D-Bus service (for testing)"
	@echo "  package         - Create distribution package for GNOME Extensions store"
	@echo "  dev-package     - Create development package (includes service files)"
	@echo "  clean-dist      - Clean distribution packages"
	@echo "  test-install    - Create package and test installation locally"
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

# Create distribution package for GNOME Extensions store
package:
	@echo "📦 Creating distribution package for GNOME Extensions store..."
	@mkdir -p dist && \
	PACKAGE_DIR="$(EXTENSION_UUID)" && \
	PACKAGE_FILE="dist/$(EXTENSION_UUID).zip" && \
	echo "   Creating package directory: $$PACKAGE_DIR" && \
	rm -rf "$$PACKAGE_DIR" "$$PACKAGE_FILE" && \
	mkdir -p "$$PACKAGE_DIR" && \
	echo "   Copying extension files..." && \
	cp -r $(SOURCE_DIR)/* "$$PACKAGE_DIR/" && \
	echo "   Recompiling schemas for package..." && \
	glib-compile-schemas "$$PACKAGE_DIR/schemas/" && \
	echo "   Copying service files..." && \
	cp -r speech2text-service "$$PACKAGE_DIR/" && \
	echo "   Creating ZIP package..." && \
	cd "$$PACKAGE_DIR" && \
	zip -r "../$$PACKAGE_FILE" . && \
	cd .. && \
	rm -rf "$$PACKAGE_DIR" && \
	echo "✅ Package created: $$PACKAGE_FILE" && \
	echo "   Size: $$(du -h "$$PACKAGE_FILE" | cut -f1)" && \
	echo "   Contents:" && \
	unzip -l "$$PACKAGE_FILE" | head -20 && \
	echo "   ..." && \
	echo "" && \
	echo "🎯 Package ready for submission to GNOME Extensions store!"

# Create development package (includes service files for local testing)
dev-package:
	@echo "📦 Creating development package (includes service files)..."
	@mkdir -p dist && \
	PACKAGE_DIR="$(EXTENSION_UUID)-dev" && \
	PACKAGE_FILE="dist/$(EXTENSION_UUID)-dev.zip" && \
	echo "   Creating package directory: $$PACKAGE_DIR" && \
	rm -rf "$$PACKAGE_DIR" "$$PACKAGE_FILE" && \
	mkdir -p "$$PACKAGE_DIR" && \
	echo "   Copying extension files..." && \
	cp -r $(SOURCE_DIR)/* "$$PACKAGE_DIR/" && \
	echo "   Recompiling schemas for package..." && \
	glib-compile-schemas "$$PACKAGE_DIR/schemas/" && \
	echo "   Copying service files..." && \
	cp -r speech2text-service "$$PACKAGE_DIR/" && \
	echo "   Creating ZIP package..." && \
	cd "$$PACKAGE_DIR" && \
	zip -r "../$$PACKAGE_FILE" . && \
	cd .. && \
	rm -rf "$$PACKAGE_DIR" && \
	echo "✅ Development package created: $$PACKAGE_FILE" && \
	echo "   Size: $$(du -h "$$PACKAGE_FILE" | cut -f1)" && \
	echo "   Note: This package includes service files for local development"

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

# Test installation using created package (simulates GNOME Extensions store)
test-install:
	@echo "🧪 Testing GNOME Extensions store installation process..."
	@echo "   Creating package first..."
	@mkdir -p dist && \
	PACKAGE_DIR="$(EXTENSION_UUID)-test" && \
	PACKAGE_FILE="dist/$(EXTENSION_UUID).zip" && \
	rm -rf "$$PACKAGE_DIR" "$$PACKAGE_FILE" && \
	mkdir -p "$$PACKAGE_DIR" && \
	echo "   Copying extension files..." && \
	cp -r $(SOURCE_DIR)/* "$$PACKAGE_DIR/" && \
	echo "   Recompiling schemas for package..." && \
	glib-compile-schemas "$$PACKAGE_DIR/schemas/" && \
	echo "   Copying service files..." && \
	cp -r speech2text-service "$$PACKAGE_DIR/" && \
	echo "   Creating ZIP package..." && \
	cd "$$PACKAGE_DIR" && \
	zip -r "../$$PACKAGE_FILE" . && \
	cd .. && \
	rm -rf "$$PACKAGE_DIR" && \
	echo "✅ Package created: $$PACKAGE_FILE" && \
	echo "" && \
	echo "🔧 Simulating GNOME Extensions store installation..." && \
	echo "   This replicates what happens when a user downloads from extensions.gnome.org" && \
	echo "" && \
	echo "   Step 1: Extract ZIP to extension directory..." && \
	GNOME_EXTENSION_DIR="$(HOME)/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)" && \
	echo "   Target directory: $$GNOME_EXTENSION_DIR" && \
	rm -rf "$$GNOME_EXTENSION_DIR" && \
	mkdir -p "$$GNOME_EXTENSION_DIR" && \
	cd "$$GNOME_EXTENSION_DIR" && \
	unzip -q "$(CURDIR)/$$PACKAGE_FILE" && \
	echo "   ✅ Extension extracted to GNOME extension directory" && \
	echo "" && \
	echo "   Step 2: Verify extension structure..." && \
	echo "   📋 Installed files:" && \
	ls -la && \
	echo "" && \
	echo "   Step 3: Check if extension is recognized by GNOME Shell..." && \
	if [ -f "metadata.json" ] && [ -f "extension.js" ]; then \
		echo "   ✅ Extension files present"; \
		echo "   📋 Extension metadata:" && \
		cat metadata.json | head -10; \
	else \
		echo "   ❌ Missing required extension files"; \
		exit 1; \
	fi && \
	echo "" && \
	echo "   Step 4: Check service installation files..." && \
	if [ -d "speech2text-service" ] && [ -f "speech2text-service/install.sh" ]; then \
		echo "   ✅ Service installation files present"; \
		echo "   📋 Service files:" && \
		ls -la speech2text-service/; \
	else \
		echo "   ❌ Missing service installation files"; \
		exit 1; \
	fi && \
	echo "" && \
	echo "   Step 5: Verify schemas..." && \
	if [ -f "schemas/org.shell.extensions.speech2text.gschema.xml" ] && [ -f "schemas/gschemas.compiled" ]; then \
		echo "   ✅ Schema files present (including compiled schema)"; \
	else \
		echo "   ❌ Missing schema files"; \
		exit 1; \
	fi && \
	echo "" && \
	echo "   Step 6: Test service installation..." && \
	echo "   🔍 Checking if install.sh is executable..." && \
	if [ -x "speech2text-service/install.sh" ]; then \
		echo "   ✅ install.sh is executable"; \
	else \
		echo "   ⚠️  install.sh is not executable, making it executable..."; \
		chmod +x speech2text-service/install.sh; \
	fi && \
	echo "" && \
	echo "   📝 GNOME Extensions store installation test completed!" && \
	echo "   The extension is now installed exactly as it would be from extensions.gnome.org" && \
	echo "" && \
	echo "   Next steps for full testing:" && \
	echo "   1. Run: ./speech2text-service/install.sh (to install D-Bus service)" && \
	echo "   2. Restart GNOME Shell (Alt+F2 → r → Enter)" && \
	echo "   3. Enable the extension in GNOME Extensions app" && \
	echo "" && \
	echo "   To clean up test installation:" && \
	echo "   make clean"

# Clean distribution packages
clean-dist:
	@echo "🧹 Cleaning distribution packages..."
	@if [ -d "dist" ]; then \
		rm -rf dist; \
		echo "✅ Distribution packages removed"; \
	else \
		echo "ℹ️  No distribution packages found"; \
	fi

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