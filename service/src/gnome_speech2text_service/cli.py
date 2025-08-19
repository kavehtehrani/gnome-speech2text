#!/usr/bin/env python3
"""
Command-line interface for the GNOME Speech2Text Service.

This is the entry point that gets called when users run 'gnome-speech2text-service'.
"""

import sys
import argparse
from .service import main as service_main


def main():
    """Main entry point for the CLI."""
    parser = argparse.ArgumentParser(
        description="GNOME Speech2Text D-Bus Service",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  gnome-speech2text-service          # Start the D-Bus service
  gnome-speech2text-service --help   # Show this help message

This service provides speech-to-text functionality via D-Bus for the
GNOME Shell Speech2Text extension.
        """
    )
    
    parser.add_argument(
        "--version",
        action="version",
        version="%(prog)s 1.0.4"
    )
    
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging"
    )
    
    args = parser.parse_args()
    
    # Pass debug flag to the service if needed
    if args.debug:
        sys.argv.append("--debug")
    
    # Start the service
    return service_main()


if __name__ == "__main__":
    sys.exit(main())
