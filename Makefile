# GNOME Speech2Text Extension - Makefile
# Automates common development and installation tasks

EXTENSION_UUID = gnome-speech2text@kaveh.page
EXTENSION_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)
SOURCE_DIR = src
SCHEMAS_DIR = $(EXTENSION_DIR)/schemas
SCHEMA_ID = org.gnome.shell.extensions.speech2text

.PHONY: help install compile-schemas clean uninstall uninstall-service package status verify-schema install-service-dev install-service-prod

# Default target
help:
	@echo "GNOME Speech2Text Extension - Development Automation"
	@echo "=================================================="
	@echo ""
	@echo "🚀 Quick Start:"
	@echo "  Production: ./service-whispercpp/install.sh && make install"
	@echo "  Development: make install-service-dev && make install"
	@echo ""
	@echo "Available targets:"
	@echo "  install              - Install extension + compile schemas"
	@echo "  install-service-dev  - Install service in editable mode (for development)"
	@echo "  install-service-prod - Install service from PyPI (stable version)"
	@echo "  compile-schemas      - Compile GSettings schemas only"
	@echo "  uninstall            - Remove installed extension AND D-Bus service"
	@echo "  uninstall-service    - Remove only D-Bus service"
	@echo "  clean                - Remove build artifacts (dist/, temp files)"
	@echo "  status               - Check extension and service installation status"
	@echo "  verify-schema        - Verify schema is properly installed"
	@echo "  package              - Create distribution package for GNOME Extensions store"
	@echo ""
	@echo "Usage: make <target>"

# Install extension files and compile schemas
install:
	@echo "📦 Installing extension to $(EXTENSION_DIR)..."
	@mkdir -p $(EXTENSION_DIR)
	@cp -r $(SOURCE_DIR)/* $(EXTENSION_DIR)/
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

# Uninstall extension and D-Bus service
uninstall:
	@echo "🧹 Removing installed extension..."
	@if [ -d "$(EXTENSION_DIR)" ]; then \
		rm -rf $(EXTENSION_DIR); \
		echo "✅ Extension removed from $(EXTENSION_DIR)"; \
	else \
		echo "ℹ️  Extension not found at $(EXTENSION_DIR)"; \
	fi
	@echo "🧹 Removing D-Bus service..."
	@PID=$$(ps aux | grep -E "gnome-speech2text-service|speech2text_service.py" | grep -v grep | awk '{print $$2}' | head -1); \
	if [ ! -z "$$PID" ]; then \
		echo "   Found process $$PID, terminating..."; \
		kill $$PID 2>/dev/null || true; \
		sleep 1; \
		echo "   Process terminated"; \
	else \
		echo "   No speech2text processes found"; \
	fi
	@if [ -d "$(HOME)/.local/share/gnome-speech2text-service-whispercpp" ]; then \
		rm -rf $(HOME)/.local/share/gnome-speech2text-service-whispercpp; \
		echo "✅ WhisperCpp service directory removed"; \
	else \
		echo "ℹ️  WhisperCpp service directory not found"; \
	fi
	@if [ -f "$(HOME)/.local/share/dbus-1/services/org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service" ]; then \
		rm $(HOME)/.local/share/dbus-1/services/org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service; \
		echo "✅ WhisperCpp D-Bus service file removed"; \
	else \
		echo "ℹ️  WhisperCpp D-Bus service file not found"; \
	fi
	@if [ -f "$(HOME)/.local/share/applications/gnome-speech2text-service-whispercpp.desktop" ]; then \
		rm $(HOME)/.local/share/applications/gnome-speech2text-service-whispercpp.desktop; \
		echo "✅ WhisperCpp desktop entry removed"; \
	else \
		echo "ℹ️  WhisperCpp desktop entry not found"; \
	fi
	@echo "ℹ️  Note: To fully uninstall the pipx service, run:"
	@echo "   pipx uninstall gnome-speech2text-service-whispercpp"
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
	echo "   Verifying no installation scripts in package..." && \
	if find "$$PACKAGE_DIR/" -name "*.sh" -type f | grep -q .; then \
		echo "❌ ERROR: Installation scripts found in package!" && \
		find "$$PACKAGE_DIR/" -name "*.sh" -type f && \
		rm -rf "$$PACKAGE_DIR" && \
		exit 1; \
	fi && \
	echo "   ✅ No installation scripts found (clean package)" && \
	echo "   Recompiling schemas for package..." && \
	glib-compile-schemas "$$PACKAGE_DIR/schemas/" && \
	echo "   Service is separate (not included in extension package)" && \
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

# Uninstall only D-Bus service (for testing)
uninstall-service:
	@echo "🧹 Removing D-Bus service only..."
	@PID=$$(ps aux | grep -E "gnome-speech2text-service|speech2text_service.py" | grep -v grep | awk '{print $$2}' | head -1); \
	if [ ! -z "$$PID" ]; then \
		echo "   Found process $$PID, terminating..."; \
		kill $$PID 2>/dev/null || true; \
		sleep 1; \
		echo "   Process terminated"; \
	else \
		echo "   No speech2text processes found"; \
	fi
	@if [ -d "$(HOME)/.local/share/gnome-speech2text-service-whispercpp" ]; then \
		rm -rf $(HOME)/.local/share/gnome-speech2text-service-whispercpp; \
		echo "✅ WhisperCpp service directory removed"; \
	else \
		echo "ℹ️  WhisperCpp service directory not found"; \
	fi
	@if [ -f "$(HOME)/.local/share/dbus-1/services/org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service" ]; then \
		rm $(HOME)/.local/share/dbus-1/services/org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service; \
		echo "✅ WhisperCpp D-Bus service file removed"; \
	else \
		echo "ℹ️  WhisperCpp D-Bus service file not found"; \
	fi
	@if [ -f "$(HOME)/.local/share/applications/gnome-speech2text-service-whispercpp.desktop" ]; then \
		rm $(HOME)/.local/share/applications/gnome-speech2text-service-whispercpp.desktop; \
		echo "✅ WhisperCpp desktop entry removed"; \
	else \
		echo "ℹ️  WhisperCpp desktop entry not found"; \
	fi
	@echo "ℹ️  Note: To fully uninstall pipx service: pipx uninstall gnome-speech2text-service-whispercpp"
	@echo "🎯 D-Bus service cleanup finished!"

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
	@echo ""
	@echo "🔧 D-Bus Service Status:"
	@SERVICE_DIR="$(HOME)/.local/share/gnome-speech2text-service-whispercpp" && \
	echo "   Directory: $$SERVICE_DIR" && \
	if [ -d "$$SERVICE_DIR" ]; then \
		echo "   ✅ WhisperCpp service installed"; \
		if [ -f "$$SERVICE_DIR/gnome-speech2text-service-whispercpp" ]; then \
			echo "   ✅ Service executable found"; \
		else \
			echo "   ❌ Service executable missing"; \
		fi; \
		if [ -d "$$SERVICE_DIR/venv" ]; then \
			echo "   ✅ Virtual environment found"; \
		else \
			echo "   ❌ Virtual environment missing"; \
		fi; \
	else \
		echo "   ℹ️  Old-style service not installed (check pipx)"; \
		if command -v pipx >/dev/null 2>&1; then \
			if pipx list | grep -q "gnome-speech2text-service-whispercpp"; then \
				echo "   ✅ Service installed via pipx"; \
			else \
				echo "   ❌ Service not installed via pipx"; \
			fi; \
		fi; \
	fi
	@DBUS_SERVICE_FILE="$(HOME)/.local/share/dbus-1/services/org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service" && \
	echo "   D-Bus service file: $$DBUS_SERVICE_FILE" && \
	if [ -f "$$DBUS_SERVICE_FILE" ]; then \
		echo "   ✅ D-Bus service file registered"; \
		echo "   📋 Service file contents:" && \
		cat "$$DBUS_SERVICE_FILE" | sed 's/^/      /'; \
	else \
		echo "   ❌ D-Bus service file not registered"; \
	fi
	@echo "   Process status:" && \
	PID=$$(ps aux | grep "gnome-speech2text-service-whispercpp" | grep -v grep | awk '{print $$2}' | head -1); \
	if [ ! -z "$$PID" ]; then \
		echo "   ✅ Service running (PID: $$PID)"; \
		echo "   📋 Process details:" && \
		ps -p $$PID -o pid,ppid,cmd,etime | sed 's/^/      /'; \
		echo "   🔍 D-Bus service test:" && \
		if dbus-send --session --dest=org.gnome.Shell.Extensions.Speech2TextWhisperCpp --print-reply /org/gnome/Shell/Extensions/Speech2TextWhisperCpp org.gnome.Shell.Extensions.Speech2TextWhisperCpp.GetServiceStatus >/dev/null 2>&1; then \
			echo "   ✅ D-Bus service responding correctly"; \
		else \
			echo "   ❌ D-Bus service not responding"; \
		fi; \
	else \
		echo "   ❌ Service not running"; \
	fi

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
		echo "   ℹ️  Schema will be loaded by GNOME Shell when extension is enabled"; \
	else \
		echo "   ❌ Schema not compiled"; \
	fi

# Install service in development mode using uv
install-service-dev:
	@echo "🔧 Installing WhisperCpp service in development mode (uv)..."
	@if ! command -v uv >/dev/null 2>&1; then \
		echo "❌ Error: uv not found"; \
		echo "   Install with: pip install uv"; \
		exit 1; \
	fi
	@echo "📦 Setting up development environment in service-whispercpp/..."
	@cd service-whispercpp && \
	uv venv --system-site-packages && \
	uv sync --group dev || { \
		echo "❌ Failed to setup service"; \
		exit 1; \
	}
	@echo "🔧 Running setup (D-Bus registration)..."
	@./service-whispercpp/.venv/bin/gnome-speech2text-whispercpp-setup || { \
		echo "⚠️  Setup completed with warnings"; \
	}
	@echo "✅ Development service installation completed!"
	@echo ""
	@echo "📝 Development workflow:"
	@echo "   • Edit code in: service-whispercpp/src/"
	@echo "   • Changes are live - restart service to test"
	@echo "   • Kill service: pkill -f gnome-speech2text-service-whispercpp"
	@echo "   • Test manually: ./service-whispercpp/.venv/bin/gnome-speech2text-service-whispercpp"
	@echo "   • View logs: journalctl -f | grep -E 'gnome-speech2text|whispercpp'"
	@echo "   • Code quality: cd service-whispercpp && uv run black/ruff/mypy"

# Install service from PyPI (stable/production version)
install-service-prod:
	@echo "🔧 Installing WhisperCpp service (production)..."
	@if [ -f "./service-whispercpp/install.sh" ]; then \
		echo "📦 Running service installer script..."; \
		./service-whispercpp/install.sh; \
	else \
		echo "❌ Error: install.sh not found in service-whispercpp/"; \
		echo "   Install manually with: pipx install --system-site-packages gnome-speech2text-service-whispercpp"; \
		exit 1; \
	fi
	@echo "✅ Production service installation completed!"

# Clean build artifacts (safe for development)
clean:
	@echo "🧹 Cleaning build artifacts..."
	@# Remove package distribution directory
	@if [ -d "dist" ]; then \
		rm -rf dist; \
		echo "✅ Removed dist/"; \
	fi
	@# Remove Python build artifacts from service
	@if [ -d "service-whispercpp/build" ]; then \
		rm -rf service-whispercpp/build; \
		echo "✅ Removed service-whispercpp/build/"; \
	fi
	@# Remove Python cache directories (safe to remove)
	@if [ -d "service-whispercpp/.mypy_cache" ]; then \
		rm -rf service-whispercpp/.mypy_cache; \
		echo "✅ Removed .mypy_cache/"; \
	fi
	@if [ -d "service-whispercpp/.ruff_cache" ]; then \
		rm -rf service-whispercpp/.ruff_cache; \
		echo "✅ Removed .ruff_cache/"; \
	fi
	@# Remove Python bytecode (safe to remove - regenerated on import)
	@find service-whispercpp -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null && echo "✅ Removed __pycache__/ directories" || true
	@find service-whispercpp -type f -name "*.pyc" -delete 2>/dev/null || true
	@echo "✅ Build artifacts cleaned!"
	@echo "ℹ️  Note: .venv and .egg-info preserved (required for editable installs)"
	@echo "ℹ️  To fully clean: 'make uninstall && rm -rf service-whispercpp/.venv service-whispercpp/src/*.egg-info'"
