"""GNOME Speech2Text Service - Whisper.cpp Backend

A D-Bus service that provides speech-to-text functionality for the GNOME Shell
extension using whisper.cpp server for local speech recognition.

Forked from kavehtehrani/gnome-speech2text
"""

__version__ = "0.9"
__author__ = "Bartek Celary"
__email__ = "bcelary@gmail.com"

from .service import Speech2TextService

__all__ = ["Speech2TextService"]
