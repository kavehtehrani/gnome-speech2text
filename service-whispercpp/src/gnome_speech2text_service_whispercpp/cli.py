#!/usr/bin/env python3
"""
Command-line interface for the GNOME Speech2Text Service (whisper.cpp Backend).

This is the entry point that gets called when users run
'gnome-speech2text-service-whispercpp'.
"""

import argparse
import sys

from . import __version__
from .service import main as service_main


def main() -> int:
    """Main entry point for the CLI."""
    parser = argparse.ArgumentParser(
        description="GNOME Speech2Text D-Bus Service - whisper.cpp Backend",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  gnome-speech2text-service-whispercpp          # Start the D-Bus service
  gnome-speech2text-service-whispercpp --help   # Show this help message

This service provides speech-to-text functionality via D-Bus for the
GNOME Shell Speech2Text extension, using a local whisper.cpp server.

Configuration:
  WHISPER_SERVER_URL - Server endpoint (default: http://localhost:8080)
  WHISPER_MODEL      - Model name for auto-start (default: small)
  WHISPER_LANGUAGE   - Language for auto-start (default: auto)
  WHISPER_VAD_MODEL  - VAD model to filter silence (default: auto)
                       - 'auto': Auto-discover VAD models in cache
                       - 'none': Disable VAD
                       - Specific name: e.g., 'silero-v5.1.2'
  WHISPER_AUTO_START - Auto-start server if not running (default: true)
        """,
    )

    parser.add_argument(
        "--version", action="version", version=f"%(prog)s {__version__}"
    )

    parser.add_argument("--debug", action="store_true", help="Enable debug logging")

    args = parser.parse_args()

    # Pass debug flag to the service if needed
    if args.debug:
        sys.argv.append("--debug")

    # Start the service
    return service_main()


if __name__ == "__main__":
    sys.exit(main())
