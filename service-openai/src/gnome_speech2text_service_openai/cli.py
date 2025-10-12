#!/usr/bin/env python3
"""
Command-line interface for the GNOME Speech2Text Service (OpenAI Backend).

This is the entry point that gets called when users run
'gnome-speech2text-service-openai'.
"""

import sys
import argparse
from .service import main as service_main


def main() -> int:
    """Main entry point for the CLI."""
    parser = argparse.ArgumentParser(
        description="GNOME Speech2Text D-Bus Service - OpenAI Backend",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  gnome-speech2text-service-openai          # Start the D-Bus service
  gnome-speech2text-service-openai --help   # Show this help message

This service provides speech-to-text functionality via D-Bus for the
GNOME Shell Speech2Text extension, using OpenAI API or whisper.cpp server.

Configuration:
  WHISPER_SERVER_URL - API endpoint (default: http://localhost:8080/v1)
  WHISPER_MODEL      - Model name (default: base)
  OPENAI_API_KEY     - API key for OpenAI cloud service (optional)
        """,
    )

    parser.add_argument(
        "--version", action="version", version="%(prog)s 1.0.0"
    )

    parser.add_argument(
        "--debug", action="store_true", help="Enable debug logging"
    )

    args = parser.parse_args()

    # Pass debug flag to the service if needed
    if args.debug:
        sys.argv.append("--debug")

    # Start the service
    return service_main()


if __name__ == "__main__":
    sys.exit(main())
