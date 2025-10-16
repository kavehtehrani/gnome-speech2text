#!/usr/bin/env python3
"""
Simple microphone test script for GNOME Speech2Text Service (whisper.cpp)

This script will:
1. Check if the service is running
2. Check dependencies
3. Record audio from your microphone
4. Show the transcription result
"""

import sys
import time

import dbus
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib

# Colors for terminal output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
BOLD = "\033[1m"
RESET = "\033[0m"


def print_success(msg):
    print(f"{GREEN}✓{RESET} {msg}")


def print_error(msg):
    print(f"{RED}✗{RESET} {msg}")


def print_info(msg):
    print(f"{BLUE}ℹ{RESET} {msg}")


def print_warning(msg):
    print(f"{YELLOW}⚠{RESET} {msg}")


def check_service():
    """Check if the D-Bus service is available"""
    print(f"\n{BOLD}Step 1: Checking service status...{RESET}")

    try:
        # Use the main loop that was set up at the start
        bus = dbus.SessionBus()
        service = bus.get_object(
            "org.gnome.Shell.Extensions.Speech2TextWhisperCpp",
            "/org/gnome/Shell/Extensions/Speech2TextWhisperCpp",
        )

        status = service.GetServiceStatus()
        print_success(f"Service is running: {status}")
        return service

    except dbus.exceptions.DBusException as e:
        print_error("Service is not running!")
        print_error(f"Error: {e}")
        print_info("Start the service with: gnome-speech2text-service-whispercpp")
        sys.exit(1)


def check_dependencies(service):
    """Check if all dependencies are available"""
    print(f"\n{BOLD}Step 2: Checking dependencies...{RESET}")

    deps_ok, missing = service.CheckDependencies()

    if deps_ok:
        print_success("All dependencies are available!")
    else:
        print_warning("Some dependencies are missing:")
        for dep in missing:
            print(f"  - {dep}")
        print_info("The test will continue, but some features may not work.")

    return deps_ok


def record_and_transcribe(service, duration=5):
    """Record audio and get transcription"""
    print(f"\n{BOLD}Step 3: Recording audio...{RESET}")
    print_info(f"Recording will start in 3 seconds. Duration: {duration} seconds")
    print_info("Get ready to speak into your microphone!")

    # Countdown
    for i in range(3, 0, -1):
        print(f"  {i}...")
        time.sleep(1)

    print(f"{YELLOW}🎤 RECORDING NOW - Speak into your microphone!{RESET}")

    # Create the main loop
    loop = GLib.MainLoop()

    transcription_result = {"text": None, "error": None, "done": False}

    def on_transcription_ready(_recording_id, text):
        transcription_result["text"] = text
        transcription_result["done"] = True
        loop.quit()

    def on_recording_error(_recording_id, error):
        transcription_result["error"] = error
        transcription_result["done"] = True
        loop.quit()

    # Subscribe to signals
    bus = dbus.SessionBus()
    bus.add_signal_receiver(
        on_transcription_ready,
        dbus_interface="org.gnome.Shell.Extensions.Speech2TextWhisperCpp",
        signal_name="TranscriptionReady",
    )
    bus.add_signal_receiver(
        on_recording_error,
        dbus_interface="org.gnome.Shell.Extensions.Speech2TextWhisperCpp",
        signal_name="RecordingError",
    )

    # Start recording (preview_mode=true means don't type, just transcribe)
    recording_id = service.StartRecording(
        duration,  # duration in seconds
        False,  # copy_to_clipboard
        True,  # preview_mode (don't type the text)
    )

    print_info(f"Recording ID: {recording_id}")

    # Wait for transcription with timeout
    timeout_seconds = duration + 30  # Give extra time for processing

    def timeout_handler():
        print_error("Timeout waiting for transcription!")
        transcription_result["error"] = "Timeout"
        transcription_result["done"] = True
        loop.quit()
        return False

    GLib.timeout_add_seconds(timeout_seconds, timeout_handler)

    # Run the event loop and wait for result
    loop.run()

    return transcription_result


def main():
    print(f"{BOLD}{'=' * 70}{RESET}")
    print(f"{BOLD}GNOME Speech2Text Service - Microphone Test{RESET}")
    print(f"{BOLD}{'=' * 70}{RESET}")

    # Initialize D-Bus main loop (required for signals)
    DBusGMainLoop(set_as_default=True)

    # Step 1: Check service
    service = check_service()

    # Step 2: Check dependencies
    check_dependencies(service)

    # Step 3: Record and transcribe
    result = record_and_transcribe(service, duration=5)

    # Step 4: Show results
    print(f"\n{BOLD}Step 4: Results{RESET}")
    print(f"{BOLD}{'=' * 70}{RESET}")

    if result["error"]:
        print_error(f"Recording failed: {result['error']}")
        sys.exit(1)
    elif result["text"]:
        print_success("Transcription successful!")
        print(f"\n{BOLD}Transcribed text:{RESET}")
        print(f"{BLUE}┌{'─' * 68}┐{RESET}")
        print(f"{BLUE}│{RESET} {result['text']:<66} {BLUE}│{RESET}")
        print(f"{BLUE}└{'─' * 68}┘{RESET}")
        print()
        print_success("Test completed successfully!")
    else:
        print_error("No transcription received (empty result)")
        sys.exit(1)

    print(f"\n{BOLD}{'=' * 70}{RESET}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Test interrupted by user{RESET}")
        sys.exit(0)
    except Exception as e:
        print_error(f"Unexpected error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
