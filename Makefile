# GNOME Speech2Text Extension - Makefile
# Automates common development and installation tasks

EXTENSION_UUID = gnome-speech2text@bcelary.github
EXTENSION_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)
SOURCE_DIR = src
SCHEMAS_DIR = $(EXTENSION_DIR)/schemas
SCHEMA_ID = org.gnome.shell.extensions.speech2text

.PHONY: help install uninstall clean package status verify-schema \
        copy-files compile-schemas remove-extension reset-settings \
        kill-service remove-service install-service

# Default target
help:
	@echo "GNOME Speech2Text Extension - Makefile"
	@echo "======================================="
	@echo ""
	@echo "Quick Start:"
	@echo "  make install-service install"
	@echo ""
	@echo "Atomic targets:"
	@echo "  copy-files       - Copy extension files to installation directory"
	@echo "  compile-schemas  - Compile GSettings schemas"
	@echo "  remove-extension - Remove extension directory"
	@echo "  reset-settings   - Reset GSettings to defaults"
	@echo "  kill-service     - Stop running service process"
	@echo "  remove-service   - Remove service files and directories"
	@echo "  install-service  - Install service from local source"
	@echo ""
	@echo "Convenience targets:"
	@echo "  install          - copy-files + compile-schemas"
	@echo "  uninstall        - remove-extension + kill-service + remove-service + reset-settings"
	@echo ""
	@echo "Utilities:"
	@echo "  status           - Show installation status"
	@echo "  verify-schema    - Verify schema installation"
	@echo "  package          - Create distribution package"
	@echo "  clean            - Remove build artifacts"
	@echo ""
	@echo "Combine atomic targets: make copy-files compile-schemas"

# Copy extension files to installation directory
copy-files:
	@echo "Copying extension files to $(EXTENSION_DIR)..."
	@mkdir -p $(EXTENSION_DIR)
	@cp -r $(SOURCE_DIR)/* $(EXTENSION_DIR)/
	@echo "Extension files copied"

# Compile GSettings schemas
compile-schemas:
	@echo "Compiling GSettings schemas..."
	@if [ ! -d "$(SCHEMAS_DIR)" ]; then \
		echo "ERROR: Schemas directory not found: $(SCHEMAS_DIR)"; \
		echo "Run 'make copy-files' first"; \
		exit 1; \
	fi
	@glib-compile-schemas $(SCHEMAS_DIR)
	@if [ -f "$(SCHEMAS_DIR)/gschemas.compiled" ]; then \
		echo "Schemas compiled"; \
	else \
		echo "ERROR: Schema compilation failed"; \
		exit 1; \
	fi

# Remove extension directory
remove-extension:
	@echo "Removing extension directory..."
	@if [ -d "$(EXTENSION_DIR)" ]; then \
		rm -rf $(EXTENSION_DIR); \
		echo "Extension removed"; \
	else \
		echo "Extension not installed"; \
	fi

# Reset GSettings to defaults
reset-settings:
	@echo "Resetting extension settings..."
	@gsettings reset $(SCHEMA_ID) first-run 2>/dev/null || echo "Settings already at defaults"

# Stop running service process
kill-service:
	@echo "Stopping service process..."
	@PID=$$(ps aux | grep -E "gnome-speech2text-service|speech2text_service.py" | grep -v grep | awk '{print $$2}' | head -1); \
	if [ ! -z "$$PID" ]; then \
		echo "Found process $$PID, terminating..."; \
		kill $$PID 2>/dev/null || true; \
		sleep 1; \
		echo "Process terminated"; \
	else \
		echo "No service process found"; \
	fi

# Remove service files and directories
remove-service:
	@echo "Removing service files..."
	@if [ -d "$(HOME)/.local/share/gnome-speech2text-service-whispercpp" ]; then \
		rm -rf $(HOME)/.local/share/gnome-speech2text-service-whispercpp; \
		echo "Service directory removed"; \
	fi
	@if [ -f "$(HOME)/.local/share/dbus-1/services/org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service" ]; then \
		rm $(HOME)/.local/share/dbus-1/services/org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service; \
		echo "D-Bus service file removed"; \
	fi
	@if [ -f "$(HOME)/.local/share/applications/gnome-speech2text-service-whispercpp.desktop" ]; then \
		rm $(HOME)/.local/share/applications/gnome-speech2text-service-whispercpp.desktop; \
		echo "Desktop entry removed"; \
	fi
	@echo "Note: To fully uninstall pipx service, run: pipx uninstall gnome-speech2text-service-whispercpp"

# Install service from local source directory
install-service:
	@echo "Installing service from source..."
	@if [ -f "./service-whispercpp/install.sh" ]; then \
		./service-whispercpp/install.sh --from-source; \
	else \
		echo "ERROR: install.sh not found in service-whispercpp/"; \
		exit 1; \
	fi
	@echo "Service installed from source"

# Convenience: Install extension (copy files + compile schemas)
install: copy-files compile-schemas
	@echo "Extension installation complete"

# Convenience: Complete uninstall (extension + service + settings)
uninstall: remove-extension kill-service remove-service reset-settings
	@echo "Complete uninstall finished"

# Create distribution package for GNOME Extensions store
package:
	@echo "Creating distribution package..."
	@mkdir -p dist && \
	PACKAGE_DIR="$(EXTENSION_UUID)" && \
	PACKAGE_FILE="dist/$(EXTENSION_UUID).zip" && \
	echo "Package directory: $$PACKAGE_DIR" && \
	rm -rf "$$PACKAGE_DIR" "$$PACKAGE_FILE" && \
	mkdir -p "$$PACKAGE_DIR" && \
	echo "Copying extension files..." && \
	cp -r $(SOURCE_DIR)/* "$$PACKAGE_DIR/" && \
	echo "Verifying no installation scripts in package..." && \
	if find "$$PACKAGE_DIR/" -name "*.sh" -type f | grep -q .; then \
		echo "ERROR: Installation scripts found in package!" && \
		find "$$PACKAGE_DIR/" -name "*.sh" -type f && \
		rm -rf "$$PACKAGE_DIR" && \
		exit 1; \
	fi && \
	echo "Clean package verified" && \
	echo "Compiling schemas..." && \
	glib-compile-schemas "$$PACKAGE_DIR/schemas/" && \
	echo "Creating ZIP..." && \
	cd "$$PACKAGE_DIR" && \
	zip -r "../$$PACKAGE_FILE" . && \
	cd .. && \
	rm -rf "$$PACKAGE_DIR" && \
	echo "Package created: $$PACKAGE_FILE" && \
	echo "Size: $$(du -h "$$PACKAGE_FILE" | cut -f1)" && \
	echo "Contents:" && \
	unzip -l "$$PACKAGE_FILE" | head -20 && \
	echo "..." && \
	echo "Package ready for GNOME Extensions store"

# Show installation status
status:
	@echo "Extension Status:"
	@echo "  Directory: $(EXTENSION_DIR)"
	@if [ -d "$(EXTENSION_DIR)" ]; then \
		echo "  Installed: yes"; \
	else \
		echo "  Installed: no"; \
	fi
	@if [ -f "$(SCHEMAS_DIR)/gschemas.compiled" ]; then \
		echo "  Schemas: compiled"; \
	else \
		echo "  Schemas: not compiled"; \
	fi
	@echo "  Session: $(XDG_SESSION_TYPE)"
	@echo ""
	@echo "Service Status:"
	@SERVICE_DIR="$(HOME)/.local/share/gnome-speech2text-service-whispercpp"; \
	DBUS_FILE="$(HOME)/.local/share/dbus-1/services/org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service"; \
	if [ -d "$$SERVICE_DIR" ]; then \
		echo "  Installed: yes (local)"; \
	elif command -v pipx >/dev/null 2>&1 && pipx list | grep -q "gnome-speech2text-service-whispercpp"; then \
		echo "  Installed: yes (pipx)"; \
	else \
		echo "  Installed: no"; \
	fi; \
	if [ -f "$$DBUS_FILE" ]; then \
		echo "  D-Bus: registered"; \
	else \
		echo "  D-Bus: not registered"; \
	fi; \
	PID=$$(ps aux | grep "gnome-speech2text-service-whispercpp" | grep -v grep | awk '{print $$2}' | head -1); \
	if [ ! -z "$$PID" ]; then \
		echo "  Running: yes (PID: $$PID)"; \
		if dbus-send --session --dest=org.gnome.Shell.Extensions.Speech2TextWhisperCpp --print-reply /org/gnome/Shell/Extensions/Speech2TextWhisperCpp org.gnome.Shell.Extensions.Speech2TextWhisperCpp.GetServiceStatus >/dev/null 2>&1; then \
			echo "  D-Bus responding: yes"; \
		else \
			echo "  D-Bus responding: no"; \
		fi; \
	else \
		echo "  Running: no"; \
	fi

# Verify schema installation
verify-schema:
	@echo "Verifying schema installation..."
	@if [ -f "$(SCHEMAS_DIR)/$(SCHEMA_ID).gschema.xml" ]; then \
		echo "Schema file: found"; \
	else \
		echo "Schema file: missing"; \
		echo "Available schemas:"; \
		ls -la $(SCHEMAS_DIR)/*.gschema.xml 2>/dev/null || echo "No schema files found"; \
	fi
	@if [ -f "$(SCHEMAS_DIR)/gschemas.compiled" ]; then \
		echo "Compiled: yes"; \
	else \
		echo "Compiled: no"; \
	fi

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	@if [ -d "dist" ]; then \
		rm -rf dist; \
		echo "Removed dist/"; \
	fi
	@if [ -d "service-whispercpp/build" ]; then \
		rm -rf service-whispercpp/build; \
		echo "Removed service-whispercpp/build/"; \
	fi
	@if [ -d "service-whispercpp/.mypy_cache" ]; then \
		rm -rf service-whispercpp/.mypy_cache; \
		echo "Removed .mypy_cache/"; \
	fi
	@if [ -d "service-whispercpp/.ruff_cache" ]; then \
		rm -rf service-whispercpp/.ruff_cache; \
		echo "Removed .ruff_cache/"; \
	fi
	@find service-whispercpp -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null && echo "Removed __pycache__/" || true
	@find service-whispercpp -type f -name "*.pyc" -delete 2>/dev/null || true
	@echo "Build artifacts cleaned"
