#!/usr/bin/env python3
"""
GNOME Speech2Text D-Bus Service - whisper.cpp Backend

This service provides speech-to-text functionality via D-Bus using a local
whisper.cpp server with OpenAI-compatible API.
"""

import contextlib
import os
import re
import signal
import subprocess
import sys
import syslog
import tempfile
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import dbus
import dbus.mainloop.glib
import dbus.service
from gi.repository import GLib

from .whisper_cpp_client import WhisperCppClient


class Speech2TextService(dbus.service.Object):  # type: ignore
    """D-Bus service for speech-to-text functionality using whisper.cpp

    Note: D-Bus method names must use PascalCase per D-Bus specification,
    hence ruff N802 warnings are suppressed for D-Bus methods/signals.
    """

    def __init__(self) -> None:
        # Set up D-Bus
        dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
        bus = dbus.SessionBus()
        bus_name = dbus.service.BusName(
            "org.gnome.Shell.Extensions.Speech2TextWhisperCpp", bus
        )
        super().__init__(bus_name, "/org/gnome/Shell/Extensions/Speech2TextWhisperCpp")

        # Service state
        self.active_recordings: Dict[str, Dict[str, Any]] = {}
        self.dependencies_checked: bool = False
        self.missing_deps: List[str] = []

        # Initialize whisper.cpp client
        server_url = os.environ.get("WHISPER_SERVER_URL", "http://localhost:8080")
        self.server_url = server_url

        # Determine model file name for auto-start
        # WHISPER_MODEL should be a whisper.cpp model name like: base, small, medium, large-v3-turbo, etc.
        # Variants with .en, -q5_1, -q8_0 suffixes are also supported (e.g., base.en, small-q5_1)
        model_file_name = os.environ.get("WHISPER_MODEL", "small")

        # Determine language for auto-start
        # WHISPER_LANGUAGE should be a language code like: en, es, fr, de, or "auto" for auto-detection
        language = os.environ.get("WHISPER_LANGUAGE", "auto")

        # Determine VAD model for auto-start (optional)
        # WHISPER_VAD_MODEL should be a VAD model name like: silero-v5.1.2
        # Special values:
        #   - "auto" (default): Auto-discover VAD models in ~/.cache/whisper.cpp/
        #   - "none" or empty: Disable VAD
        #   - Specific name: Use that model
        vad_model: Optional[str] = os.environ.get("WHISPER_VAD_MODEL", "auto")
        if vad_model and vad_model.strip().lower() in ("none", ""):
            vad_model = None

        # Check if auto-start is enabled
        auto_start = os.environ.get("WHISPER_AUTO_START", "true").lower()
        auto_start_enabled = auto_start not in ("false", "0", "no", "off")

        # Initialize client
        self.client = WhisperCppClient(
            base_url=server_url,
            auto_start=auto_start_enabled,
            model_file=model_file_name,
            language=language,
            vad_model=vad_model,
        )

        # Initialize syslog for proper journalctl logging
        syslog.openlog(
            "gnome-speech2text-service-whispercpp", syslog.LOG_PID, syslog.LOG_USER
        )
        syslog.syslog(
            syslog.LOG_INFO, "Speech2Text D-Bus service started (whisper.cpp backend)"
        )
        print("Speech2Text D-Bus service started (whisper.cpp backend)")

    def _check_dependencies(self) -> Tuple[bool, List[str]]:
        """Check if all required dependencies are available"""
        if self.dependencies_checked:
            return len(self.missing_deps) == 0, self.missing_deps

        missing: List[str] = []

        # Check for ffmpeg
        try:
            subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        except (FileNotFoundError, subprocess.CalledProcessError):
            missing.append("ffmpeg")

        # Check for clipboard tools (session-type specific)
        clipboard_available = False
        session_type = os.environ.get("XDG_SESSION_TYPE", "")

        # Check for xdotool (for X11 typing only)
        if session_type != "wayland":
            try:
                subprocess.run(
                    ["xdotool", "--version"], capture_output=True, check=True
                )
            except (FileNotFoundError, subprocess.CalledProcessError):
                missing.append("xdotool")

        if session_type == "wayland":
            # On Wayland, only wl-copy works
            try:
                subprocess.run(["which", "wl-copy"], capture_output=True, check=True)
                clipboard_available = True
            except (FileNotFoundError, subprocess.CalledProcessError):
                pass
        else:
            # On X11 or unknown, check for xclip/xsel
            for tool in ["xclip", "xsel"]:
                try:
                    subprocess.run(["which", tool], capture_output=True, check=True)
                    clipboard_available = True
                    break
                except (FileNotFoundError, subprocess.CalledProcessError):
                    continue

        if not clipboard_available:
            if session_type == "wayland":
                missing.append("wl-clipboard (required for Wayland)")
            else:
                missing.append("clipboard-tools (xclip or xsel for X11)")

        # Check server connectivity
        health = self.client.health_check()
        if health["status"] != "ok":
            missing.append(f"whisper.cpp server not responding at {self.server_url}")

        self.missing_deps = missing
        self.dependencies_checked = True
        return len(missing) == 0, missing

    def _detect_display_server(self) -> str:
        """Detect if we're running on X11 or Wayland"""
        try:
            session_type = os.environ.get("XDG_SESSION_TYPE", "").lower()
            if session_type:
                return session_type

            if os.environ.get("WAYLAND_DISPLAY"):
                return "wayland"

            if os.environ.get("DISPLAY"):
                return "x11"

            return "x11"  # fallback
        except Exception:
            return "x11"

    def _copy_to_clipboard(self, text: str) -> bool:
        """Copy text to clipboard with X11/Wayland support"""
        if not text:
            return False

        display_server = self._detect_display_server()

        try:
            if display_server == "wayland":
                try:
                    subprocess.run(["wl-copy"], input=text, text=True, check=True)
                    return True
                except (FileNotFoundError, subprocess.CalledProcessError):
                    # Fallback to xclip (XWayland)
                    try:
                        subprocess.run(
                            ["xclip", "-selection", "clipboard"],
                            input=text,
                            text=True,
                            check=True,
                        )
                        return True
                    except (FileNotFoundError, subprocess.CalledProcessError):
                        return False
            else:
                # X11
                try:
                    subprocess.run(
                        ["xclip", "-selection", "clipboard"],
                        input=text,
                        text=True,
                        check=True,
                    )
                    return True
                except (FileNotFoundError, subprocess.CalledProcessError):
                    try:
                        subprocess.run(
                            ["xsel", "--clipboard", "--input"],
                            input=text,
                            text=True,
                            check=True,
                        )
                        return True
                    except (FileNotFoundError, subprocess.CalledProcessError):
                        return False
        except Exception as e:
            print(f"Error copying to clipboard: {e}")
            return False

    def _type_text(self, text: str) -> bool:
        """Type text using appropriate method for display server"""
        if not text:
            return False

        try:
            # Use xdotool for typing (works on both X11 and XWayland)
            subprocess.run(["xdotool", "type", "--delay", "10", text], check=True)
            return True
        except Exception as e:
            print(f"Error typing text: {e}")
            return False

    def _cleanup_recording(self, recording_id: str) -> None:
        """Clean up recording resources and remove from active recordings"""
        try:
            recording_info = self.active_recordings.get(recording_id)
            if recording_info:
                # Stop any running process
                process: Optional[subprocess.Popen[str]] = recording_info.get("process")
                if process and process.poll() is None:
                    try:
                        print(
                            f"Cleaning up running process for recording {recording_id}"
                        )
                        process.send_signal(signal.SIGINT)
                        time.sleep(0.2)
                        if process.poll() is None:
                            process.terminate()
                            time.sleep(0.2)
                        if process.poll() is None:
                            process.kill()
                            time.sleep(0.1)

                        # Final check with system kill
                        if process.poll() is None:
                            with contextlib.suppress(Exception):
                                subprocess.run(
                                    ["kill", "-9", str(process.pid)],
                                    check=False,
                                )
                    except Exception as e:
                        print(f"Error cleaning up process: {e}")

                # Clean up audio file if it exists
                audio_file: Optional[str] = recording_info.get("audio_file")
                if audio_file:
                    audio_path = Path(audio_file)
                    if audio_path.exists():
                        try:
                            audio_path.unlink()
                            print(f"Cleaned up audio file: {audio_file}")
                        except Exception as e:
                            print(f"Error cleaning up audio file: {e}")

                # Remove from active recordings
                del self.active_recordings[recording_id]
                print(f"Removed recording {recording_id} from active recordings")
        except Exception as e:
            print(f"Error in cleanup_recording: {e}")

    def _record_audio(self, recording_id: str, max_duration: int = 60) -> None:
        """Record audio in a separate thread"""
        recording_info = self.active_recordings.get(recording_id)
        if not recording_info:
            return

        # Create temporary file for audio
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
            audio_file = tmp_file.name

        recording_info["audio_file"] = audio_file
        recording_info["status"] = "recording"

        try:
            # Emit recording started signal
            self.RecordingStarted(recording_id)

            # Use ffmpeg to record audio - unified approach for both X11 and Wayland
            display_server = self._detect_display_server()

            # Unified configuration that works well for short recordings
            cmd = [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-nostats",
                "-loglevel",
                "error",
                "-f",
                "pulse",
                "-i",
                "default",
                "-flush_packets",
                "1",  # Force packet flushing
                "-bufsize",
                "32k",  # Small buffer size
                "-avioflags",
                "direct",  # Direct I/O, avoid buffering
                "-fflags",
                "+flush_packets",  # Additional flush flag
                "-t",
                str(max_duration),
                "-ar",
                "16000",
                "-ac",
                "1",
                "-f",
                "wav",
                audio_file,
            ]

            process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdout=subprocess.PIPE,
                text=True,
            )
            recording_info["process"] = process
            syslog.syslog(
                syslog.LOG_INFO, f"FFmpeg process started with PID: {process.pid}"
            )
            syslog.syslog(syslog.LOG_INFO, f"FFmpeg command: {' '.join(cmd)}")

            # Check if process started successfully
            time.sleep(0.1)  # Give it a moment to start
            if process.poll() is not None:
                # Process failed immediately
                stderr_output = (
                    process.stderr.read() if process.stderr else "No stderr available"
                )
                syslog.syslog(
                    syslog.LOG_ERR,
                    f"FFmpeg process failed immediately with return code: {process.returncode}",
                )
                syslog.syslog(syslog.LOG_ERR, f"FFmpeg stderr: {stderr_output}")
                raise Exception(f"FFmpeg failed to start: {stderr_output}")

            # Wait for process or manual stop
            start_time = time.time()
            min_recording_time = 2.0
            syslog.syslog(
                syslog.LOG_INFO,
                f"Recording on {display_server}, minimum recording time: {min_recording_time}s",
            )

            while process.poll() is None:
                elapsed = time.time() - start_time

                if recording_info.get("stop_requested", False):
                    # Ensure minimum time for FFmpeg to initialize
                    if elapsed < min_recording_time:
                        syslog.syslog(
                            syslog.LOG_INFO,
                            f"Delaying stop request ({elapsed:.1f}s < {min_recording_time}s)",
                        )
                        time.sleep(0.1)
                        continue
                    else:
                        break

                time.sleep(0.1)

            # Stop recording if requested
            if recording_info.get("stop_requested", False):
                syslog.syslog(
                    syslog.LOG_INFO,
                    f"Stop requested for recording {recording_id}, terminating FFmpeg process",
                )
                try:
                    syslog.syslog(
                        syslog.LOG_INFO,
                        "Sending 'q' to FFmpeg stdin for graceful exit",
                    )
                    try:
                        # Send 'q' to tell FFmpeg to quit gracefully
                        if process.stdin:
                            process.stdin.write("q\n")
                            process.stdin.flush()
                            process.stdin.close()

                        # Give it time to finish and write the file
                        process.wait(timeout=2.0)
                        syslog.syslog(
                            syslog.LOG_INFO,
                            "FFmpeg terminated gracefully with 'q' command",
                        )
                    except (
                        subprocess.TimeoutExpired,
                        BrokenPipeError,
                        OSError,
                    ):
                        # If 'q' doesn't work, fall back to SIGINT
                        syslog.syslog(
                            syslog.LOG_WARNING, "'q' command failed, trying SIGINT"
                        )
                        process.send_signal(signal.SIGINT)

                        try:
                            process.wait(timeout=2.0)
                            syslog.syslog(
                                syslog.LOG_INFO, "FFmpeg terminated with SIGINT"
                            )
                        except subprocess.TimeoutExpired:
                            syslog.syslog(
                                syslog.LOG_WARNING, "SIGINT timeout, force killing"
                            )
                            process.kill()
                            process.wait()

                except Exception as e:
                    syslog.syslog(
                        syslog.LOG_ERR, f"Error stopping recording process: {e}"
                    )
                    # Ensure process is terminated even if error occurs
                    with contextlib.suppress(Exception):
                        process.kill()
                        process.wait()

            process.wait()
            syslog.syslog(
                syslog.LOG_INFO,
                f"FFmpeg process finished with return code: {process.returncode}",
            )

            # Capture any stderr output from FFmpeg (safely)
            try:
                if process.stderr and not process.stderr.closed:
                    stderr_output = process.stderr.read()
                    if stderr_output:
                        syslog.syslog(
                            syslog.LOG_INFO, f"FFmpeg stderr output: {stderr_output}"
                        )
            except (ValueError, OSError) as e:
                syslog.syslog(
                    syslog.LOG_DEBUG,
                    f"Could not read stderr (process terminated): {e}",
                )

            # Give a small delay for file system to flush the audio data
            time.sleep(0.3)

            # Check if we have valid audio with retry logic
            audio_valid = False
            audio_path = Path(audio_file)
            syslog.syslog(syslog.LOG_INFO, f"*** Checking audio file: {audio_file}")
            for attempt in range(5):  # Try up to 5 times
                if audio_path.exists():
                    file_size = audio_path.stat().st_size
                    syslog.syslog(
                        syslog.LOG_INFO,
                        f"Attempt {attempt + 1}: File exists, size: {file_size} bytes",
                    )
                    # Lower threshold to 100 bytes
                    if file_size > 100:
                        audio_valid = True
                        syslog.syslog(
                            syslog.LOG_INFO,
                            f"Audio validation successful on attempt {attempt + 1}",
                        )
                        break
                    else:
                        syslog.syslog(
                            syslog.LOG_WARNING,
                            f"File too small ({file_size} bytes), retrying...",
                        )
                else:
                    syslog.syslog(
                        syslog.LOG_WARNING,
                        f"Attempt {attempt + 1}: File doesn't exist yet",
                    )
                # Small delay between attempts
                if attempt < 4:
                    time.sleep(0.2)

            if audio_valid:
                recording_info["status"] = "recorded"
                self.RecordingStopped(recording_id, "completed")

                # Start transcription
                self._transcribe_audio(recording_id)
            else:
                recording_info["status"] = "failed"
                file_size = audio_path.stat().st_size if audio_path.exists() else 0
                error_msg = f"Audio validation failed: file_size={file_size} bytes, file_exists={audio_path.exists()}"
                syslog.syslog(syslog.LOG_ERR, f"DEBUG: {error_msg}")
                self.RecordingError(
                    recording_id,
                    f"No audio recorded or file too small (size: {file_size} bytes)",
                )

        except Exception as e:
            recording_info["status"] = "failed"
            self.RecordingError(recording_id, str(e))
        finally:
            # Always clean up the recording from active recordings
            self._cleanup_recording(recording_id)

    def _transcribe_audio(self, recording_id: str) -> None:
        """Transcribe recorded audio using whisper.cpp"""
        recording_info = self.active_recordings.get(recording_id)
        if not recording_info or recording_info["status"] != "recorded":
            return

        audio_file: Optional[str] = recording_info.get("audio_file")
        if not audio_file or not Path(audio_file).exists():
            self.RecordingError(recording_id, "Audio file not found")
            return

        try:
            recording_info["status"] = "transcribing"

            # Transcribe using whisper.cpp server
            # Use JSON format for better error detection and structured response
            with Path(audio_file).open("rb") as af:
                response = self.client.audio.transcriptions.create(
                    file=af, response_format="json"
                )

            # Extract text from response (response is dict for JSON format, str for text format)
            if isinstance(response, dict):
                text = str(response.get("text", "")).strip()
            else:
                text = response.strip()

            # Remove excessive white space including new-lines (sic!)
            text = re.sub(r"\s+", " ", text.strip())

            recording_info["text"] = text
            recording_info["status"] = "completed"

            # Emit transcription ready signal
            self.TranscriptionReady(recording_id, text)

            # Handle post-processing based on recording options
            copy_to_clipboard: bool = recording_info.get("copy_to_clipboard", False)
            preview_mode: bool = recording_info.get("preview_mode", False)

            if not preview_mode:
                # Type the text directly
                if self._type_text(text):
                    self.TextTyped(text, True)
                else:
                    self.TextTyped(text, False)

            # Copy to clipboard if requested
            if copy_to_clipboard:
                self._copy_to_clipboard(text)

        except Exception as e:
            recording_info["status"] = "failed"
            error_msg = str(e)

            # Provide more helpful error messages
            if "Connection" in error_msg or "connection" in error_msg:
                error_msg = f"Cannot connect to whisper.cpp server at {self.server_url}. Is it running?"
            elif "timeout" in error_msg.lower():
                error_msg = "Server timeout - transcription took too long or server is unresponsive"
            elif "404" in error_msg or "Not Found" in error_msg:
                error_msg = f"Transcription endpoint not found - check WHISPER_SERVER_URL is correct: {self.server_url}"

            syslog.syslog(
                syslog.LOG_ERR,
                f"Transcription failed for recording {recording_id}: {error_msg}",
            )
            self.RecordingError(recording_id, f"Transcription failed: {error_msg}")
        finally:
            # Clean up audio file and recording state
            if audio_file:
                audio_path = Path(audio_file)
                with contextlib.suppress(Exception):
                    if audio_path.exists():
                        audio_path.unlink()

            # Clean up the recording from active recordings
            self._cleanup_recording(recording_id)

    # D-Bus Methods
    @dbus.service.method(  # type: ignore
        "org.gnome.Shell.Extensions.Speech2TextWhisperCpp",
        in_signature="ibb",
        out_signature="s",
    )
    def StartRecording(  # noqa: N802 - D-Bus method name must be PascalCase
        self, duration: int, copy_to_clipboard: bool, preview_mode: bool
    ) -> str:
        """Start a new recording session"""
        try:
            # Check dependencies first
            deps_ok, missing = self._check_dependencies()
            if not deps_ok:
                raise Exception(f"Missing dependencies: {', '.join(missing)}")

            # Generate unique recording ID
            recording_id = str(uuid.uuid4())

            # Validate duration (allow short recordings, user can stop manually)
            duration = min(max(1, duration), 300)  # 1s to 5min

            # Store recording info
            self.active_recordings[recording_id] = {
                "id": recording_id,
                "duration": duration,
                "copy_to_clipboard": copy_to_clipboard,
                "preview_mode": preview_mode,
                "status": "starting",
                "created_at": datetime.now(),
                "stop_requested": False,
            }

            # Start recording in separate thread
            thread = threading.Thread(
                target=self._record_audio, args=(recording_id, duration)
            )
            thread.daemon = True
            thread.start()

            return recording_id

        except Exception as e:
            error_msg = str(e)
            print(f"StartRecording error: {error_msg}")
            # Use a dummy ID for error reporting
            dummy_id = str(uuid.uuid4())
            self.RecordingError(dummy_id, error_msg)
            return dummy_id

    @dbus.service.method(  # type: ignore
        "org.gnome.Shell.Extensions.Speech2TextWhisperCpp",
        in_signature="s",
        out_signature="b",
    )
    def StopRecording(self, recording_id: str) -> bool:  # noqa: N802
        """Stop an active recording"""
        try:
            recording_info = self.active_recordings.get(recording_id)
            if not recording_info:
                return False

            recording_info["stop_requested"] = True

            # Stop the process if it's running
            process: Optional[subprocess.Popen[str]] = recording_info.get("process")
            if process and process.poll() is None:
                with contextlib.suppress(Exception):
                    process.send_signal(signal.SIGINT)

            return True

        except Exception as e:
            print(f"StopRecording error: {e}")
            return False

    @dbus.service.method(  # type: ignore
        "org.gnome.Shell.Extensions.Speech2TextWhisperCpp",
        in_signature="s",
        out_signature="b",
    )
    def CancelRecording(self, recording_id: str) -> bool:  # noqa: N802
        """Cancel an active recording without processing"""
        try:
            recording_info = self.active_recordings.get(recording_id)
            if not recording_info:
                return False

            print(f"Cancelling recording {recording_id}")

            # Mark as cancelled
            recording_info["status"] = "cancelled"
            recording_info["stop_requested"] = True

            # Immediately clean up the recording
            self._cleanup_recording(recording_id)

            # Emit cancelled signal
            self.RecordingStopped(recording_id, "cancelled")

            return True

        except Exception as e:
            print(f"CancelRecording error: {e}")
            return False

    @dbus.service.method(  # type: ignore
        "org.gnome.Shell.Extensions.Speech2TextWhisperCpp",
        in_signature="sb",
        out_signature="b",
    )
    def TypeText(self, text: str, copy_to_clipboard: bool) -> bool:  # noqa: N802
        """Type provided text directly"""
        try:
            success = True

            # Type the text
            if not self._type_text(text):
                success = False

            # Copy to clipboard if requested
            if copy_to_clipboard and not self._copy_to_clipboard(text):
                print("Failed to copy to clipboard")

            # Emit signal
            self.TextTyped(text, success)
            return success

        except Exception as e:
            print(f"TypeText error: {e}")
            self.TextTyped(text, False)
            return False

    @dbus.service.method(  # type: ignore
        "org.gnome.Shell.Extensions.Speech2TextWhisperCpp", out_signature="s"
    )
    def GetServiceStatus(self) -> str:  # noqa: N802
        """Get current service status"""
        try:
            deps_ok, missing = self._check_dependencies()
            if not deps_ok:
                return f"dependencies_missing:{','.join(missing)}"

            # Check server connectivity
            health = self.client.health_check()
            if health["status"] != "ok":
                return f"server_error:whisper.cpp server not responding at {self.server_url}"

            active_count = len(
                [
                    r
                    for r in self.active_recordings.values()
                    if r["status"] in ["recording", "transcribing"]
                ]
            )

            return f"ready:active_recordings={active_count}"

        except Exception as e:
            return f"error:{str(e)}"

    @dbus.service.method(  # type: ignore
        "org.gnome.Shell.Extensions.Speech2TextWhisperCpp", out_signature="bas"
    )
    def CheckDependencies(self) -> Tuple[bool, List[str]]:  # noqa: N802
        """Check if all dependencies are available"""
        try:
            deps_ok, missing = self._check_dependencies()
            return deps_ok, missing
        except Exception as e:
            return False, [f"Error checking dependencies: {str(e)}"]

    # D-Bus Signals
    @dbus.service.signal(  # type: ignore
        "org.gnome.Shell.Extensions.Speech2TextWhisperCpp", signature="s"
    )
    def RecordingStarted(self, recording_id: str) -> None:  # noqa: N802
        pass

    @dbus.service.signal(  # type: ignore
        "org.gnome.Shell.Extensions.Speech2TextWhisperCpp", signature="ss"
    )
    def RecordingStopped(self, recording_id: str, reason: str) -> None:  # noqa: N802
        pass

    @dbus.service.signal(  # type: ignore
        "org.gnome.Shell.Extensions.Speech2TextWhisperCpp", signature="ss"
    )
    def TranscriptionReady(self, recording_id: str, text: str) -> None:  # noqa: N802
        pass

    @dbus.service.signal(  # type: ignore
        "org.gnome.Shell.Extensions.Speech2TextWhisperCpp", signature="ss"
    )
    def RecordingError(  # noqa: N802
        self, recording_id: str, error_message: str
    ) -> None:
        pass

    @dbus.service.signal(  # type: ignore
        "org.gnome.Shell.Extensions.Speech2TextWhisperCpp", signature="sb"
    )
    def TextTyped(self, text: str, success: bool) -> None:  # noqa: N802
        pass


def main() -> int:
    """Main function to start the D-Bus service"""
    try:
        service = Speech2TextService()

        # Set up signal handlers for graceful shutdown
        def signal_handler(signum: int, frame: Any) -> None:  # noqa: ARG001
            print(f"Received signal {signum}, shutting down...")
            # Clean up active recordings
            for recording_id, recording_info in list(service.active_recordings.items()):
                process: Optional[subprocess.Popen[str]] = recording_info.get("process")
                if process and process.poll() is None:
                    try:
                        print(f"Terminating recording process {process.pid}")
                        process.send_signal(signal.SIGINT)
                        time.sleep(0.2)
                        if process.poll() is None:
                            process.terminate()
                            time.sleep(0.2)
                        if process.poll() is None:
                            process.kill()
                    except Exception as e:
                        print(f"Error terminating process: {e}")

                # Clean up resources
                service._cleanup_recording(recording_id)

            # Stop whisper-server if we started it
            try:
                print("Stopping whisper-server...")
                service.client.stop_server()
                print("Whisper-server stopped")
            except Exception as e:
                print(f"Error stopping whisper-server: {e}")

            print("All recordings cleaned up, exiting...")
            sys.exit(0)

        signal.signal(signal.SIGTERM, signal_handler)
        signal.signal(signal.SIGINT, signal_handler)

        print("Starting Speech2Text D-Bus service main loop (whisper.cpp backend)...")

        # Start the main loop
        loop = GLib.MainLoop()
        loop.run()

        return 0

    except Exception as e:
        print(f"Error starting service: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
