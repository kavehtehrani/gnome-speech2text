"""GNOME Speech2Text Service - OpenAI Backend

A D-Bus service that provides speech-to-text functionality for the GNOME Shell
extension using OpenAI API (compatible with OpenAI and whisper.cpp servers).
"""

__version__ = "1.0.0"
__author__ = "Kaveh Tehrani"
__email__ = "codemonkey13x@gmail.com"

from .service import Speech2TextService

__all__ = ["Speech2TextService"]
