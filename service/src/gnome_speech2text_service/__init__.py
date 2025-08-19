"""GNOME Speech2Text Service

A D-Bus service that provides speech-to-text functionality for the GNOME Shell extension.
"""

__version__ = "1.0.4"
__author__ = "Kaveh Tehrani"
__email__ = "codemonkey13x@gmail.com"

from .service import Speech2TextService

__all__ = ["Speech2TextService"]
