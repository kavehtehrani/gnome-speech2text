#!/usr/bin/env python3
"""
Command-line interface for the Speech2Text Service.

This is the entry point that gets called when users run 'speech2text-extension-service'.
"""

import sys
import argparse
from .service import main as service_main


def main():
    """Main entry point for the CLI."""
    parser = argparse.ArgumentParser(
        description="Speech2Text D-Bus Service",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
        """
    )
    
    parser.add_argument(
        "--version",
        action="version",
        version="%(prog)s 1.2.0"
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
