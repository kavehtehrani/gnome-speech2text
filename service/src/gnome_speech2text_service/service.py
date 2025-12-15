#!/usr/bin/env python3

import asyncio
import math
import os
import signal
import subprocess
import sys
import syslog
import tempfile
import threading
import time
import uuid
import wave
from array import array
from datetime import datetime
from typing import TYPE_CHECKING

import whisper
from dbus_next.aio import MessageBus
from dbus_next.service import ServiceInterface, method, signal as dbus_signal

BUS_NAME = "org.gnome.Shell.Extensions.Speech2Text"
OBJECT_PATH = "/org/gnome/Shell/Extensions/Speech2Text"
INTERFACE_NAME = "org.gnome.Shell.Extensions.Speech2Text"

if TYPE_CHECKING:
    # dbus-next uses D-Bus type signature strings in annotations like: param: 's' -> 'b'
    # Static type checkers may flag these as undefined forward references; define them for typing only.
    class i: ...
    class b: ...
    class s: ...
    class ss: ...
    class sb: ...
    class bas: ...


class Speech2TextService(ServiceInterface):
    """D-Bus service for speech-to-text functionality (dbus-next/asyncio)."""

    def __init__(self, loop: asyncio.AbstractEventLoop):
        super().__init__(INTERFACE_NAME)
        self._loop = loop

        # Service state
        self.active_recordings = {}  # recording_id -> recording_info
        self.whisper_model = None
        self.dependencies_checked = False
        self.missing_deps = []

        # Initialize syslog for proper journalctl logging
        syslog.openlog("gnome-speech2text-service", syslog.LOG_PID, syslog.LOG_USER)
        syslog.syslog(syslog.LOG_INFO, "Speech2Text D-Bus service started")
        print("Speech2Text D-Bus service started")

    def _emit_threadsafe(self, fn, *args):
        """Emit a D-Bus signal safely from worker threads."""
        try:
            if self._loop and self._loop.is_running():
                self._loop.call_soon_threadsafe(fn, *args)
                return
        except Exception:
            # If anything about the loop is unexpected, fall back to direct call.
            pass
        fn(*args)

    def _load_whisper_model(self):
        """Lazy load Whisper model with CPU fallback."""
        if self.whisper_model is None:
            try:
                # Avoid oversubscribing CPU threads (especially important in VMs)
                try:
                    import torch  # type: ignore

                    cpu_count = os.cpu_count() or 1
                    torch.set_num_threads(max(1, min(4, cpu_count)))
                    torch.set_num_interop_threads(1)
                except Exception:
                    # If torch isn't available yet for any reason, don't fail here.
                    pass

                print("Loading Whisper model...")
                syslog.syslog(syslog.LOG_INFO, "Loading Whisper model: base (cpu)")
                # Force CPU-only mode to avoid CUDA compatibility issues
                self.whisper_model = whisper.load_model("base", device="cpu")
                print("Whisper model loaded successfully on CPU")
                syslog.syslog(syslog.LOG_INFO, "Whisper model loaded successfully")
            except Exception as e:
                print(f"Failed to load Whisper model: {e}")
                raise e
        return self.whisper_model

    def _wav_rms_normalized(self, wav_path: str) -> float:
        """
        Compute RMS of a PCM WAV file (normalized 0..1).
        Uses only the stdlib to avoid extra dependencies.
        """
        try:
            with wave.open(wav_path, "rb") as wf:
                nchannels = wf.getnchannels()
                sampwidth = wf.getsampwidth()
                nframes = wf.getnframes()

                # We expect 16kHz mono 16-bit, but handle minor variations.
                if sampwidth != 2 or nframes <= 0:
                    return 0.0

                total_samples = 0
                sumsq = 0.0

                # Read in chunks
                chunk_frames = 4096
                while True:
                    frames = wf.readframes(chunk_frames)
                    if not frames:
                        break

                    samples = array("h")
                    samples.frombytes(frames)

                    # If stereo, downmix by simple averaging pairs
                    if nchannels == 2:
                        # Ensure even length
                        if len(samples) % 2 == 1:
                            samples = samples[:-1]
                        mono = array("h")
                        for i in range(0, len(samples), 2):
                            mono.append(int((samples[i] + samples[i + 1]) / 2))
                        samples = mono
                    elif nchannels != 1:
                        # Unknown channel layout; treat as failure
                        return 0.0

                    for s in samples:
                        sumsq += float(s) * float(s)
                    total_samples += len(samples)

                if total_samples == 0:
                    return 0.0

                rms = math.sqrt(sumsq / total_samples)
                return float(rms) / 32768.0
        except Exception:
            return 0.0

    def _check_dependencies(self):
        """Check if all required dependencies are available."""
        if self.dependencies_checked:
            return len(self.missing_deps) == 0, self.missing_deps

        missing = []

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
                subprocess.run(["xdotool", "--version"], capture_output=True, check=True)
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

        # Check for Whisper
        try:
            import whisper  # noqa: F401
        except ImportError:
            missing.append("whisper")

        self.missing_deps = missing
        self.dependencies_checked = True
        return len(missing) == 0, missing

    def _detect_display_server(self):
        """Detect if we're running on X11 or Wayland."""
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

    def _copy_to_clipboard(self, text):
        """Copy text to clipboard with X11/Wayland support."""
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

    def _type_text(self, text):
        """Type text using appropriate method for display server."""
        if not text:
            return False

        try:
            # Use xdotool for typing (works on both X11 and XWayland)
            subprocess.run(["xdotool", "type", "--delay", "10", text], check=True)
            return True
        except Exception as e:
            print(f"Error typing text: {e}")
            return False

    def _cleanup_recording(self, recording_id):
        """Clean up recording resources and remove from active recordings."""
        try:
            recording_info = self.active_recordings.get(recording_id)
            if recording_info:
                # Stop any running process
                process = recording_info.get("process")
                if process and process.poll() is None:
                    try:
                        print(f"Cleaning up running process for recording {recording_id}")
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
                            try:
                                subprocess.run(["kill", "-9", str(process.pid)], check=False)
                            except Exception:
                                pass
                    except Exception as e:
                        print(f"Error cleaning up process: {e}")

                # Clean up audio file if it exists
                audio_file = recording_info.get("audio_file")
                if audio_file and os.path.exists(audio_file):
                    try:
                        os.unlink(audio_file)
                        print(f"Cleaned up audio file: {audio_file}")
                    except Exception as e:
                        print(f"Error cleaning up audio file: {e}")

                # Remove from active recordings
                del self.active_recordings[recording_id]
                print(f"Removed recording {recording_id} from active recordings")
        except Exception as e:
            print(f"Error in cleanup_recording: {e}")

    def _record_audio(self, recording_id, max_duration=60):
        """Record audio in a separate thread."""
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
            self._emit_threadsafe(self.RecordingStarted, recording_id)

            # Use ffmpeg to record audio - unified approach for both X11 and Wayland
            display_server = self._detect_display_server()

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
                "1",
                "-bufsize",
                "32k",
                "-avioflags",
                "direct",
                "-fflags",
                "+flush_packets",
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
            syslog.syslog(syslog.LOG_INFO, f"FFmpeg process started with PID: {process.pid}")
            syslog.syslog(syslog.LOG_INFO, f"FFmpeg command: {' '.join(cmd)}")

            # Check if process started successfully
            time.sleep(0.1)
            if process.poll() is not None:
                stderr_output = process.stderr.read() if process.stderr else "No stderr available"
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
                    if elapsed < min_recording_time:
                        syslog.syslog(
                            syslog.LOG_INFO,
                            f"Delaying stop request ({elapsed:.1f}s < {min_recording_time}s)",
                        )
                        time.sleep(0.1)
                        continue
                    break

                time.sleep(0.1)

            if recording_info.get("stop_requested", False):
                syslog.syslog(
                    syslog.LOG_INFO,
                    f"Stop requested for recording {recording_id}, terminating FFmpeg process",
                )
                try:
                    syslog.syslog(syslog.LOG_INFO, "Sending 'q' to FFmpeg stdin for graceful exit")
                    try:
                        process.stdin.write("q\n")
                        process.stdin.flush()
                        process.stdin.close()
                        process.wait(timeout=2.0)
                        syslog.syslog(syslog.LOG_INFO, "FFmpeg terminated gracefully with 'q' command")
                    except (subprocess.TimeoutExpired, BrokenPipeError, OSError):
                        syslog.syslog(syslog.LOG_WARNING, "'q' command failed, trying SIGINT")
                        process.send_signal(signal.SIGINT)
                        try:
                            process.wait(timeout=2.0)
                            syslog.syslog(syslog.LOG_INFO, "FFmpeg terminated with SIGINT")
                        except subprocess.TimeoutExpired:
                            syslog.syslog(syslog.LOG_WARNING, "SIGINT timeout, force killing")
                            process.kill()
                            process.wait()
                except Exception as e:
                    syslog.syslog(syslog.LOG_ERR, f"Error stopping recording process: {e}")
                    try:
                        process.kill()
                        process.wait()
                    except Exception:
                        pass

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
                        syslog.syslog(syslog.LOG_INFO, f"FFmpeg stderr output: {stderr_output}")
            except (ValueError, OSError) as e:
                syslog.syslog(syslog.LOG_DEBUG, f"Could not read stderr (process terminated): {e}")

            time.sleep(0.3)

            # Check if we have valid audio with retry logic for short recordings
            audio_valid = False
            syslog.syslog(syslog.LOG_INFO, f"*** Checking audio file: {audio_file}")
            for attempt in range(5):
                if os.path.exists(audio_file):
                    file_size = os.path.getsize(audio_file)
                    syslog.syslog(
                        syslog.LOG_INFO,
                        f"Attempt {attempt + 1}: File exists, size: {file_size} bytes",
                    )
                    if file_size > 100:
                        audio_valid = True
                        syslog.syslog(
                            syslog.LOG_INFO,
                            f"Audio validation successful on attempt {attempt + 1}",
                        )
                        break
                    syslog.syslog(
                        syslog.LOG_WARNING,
                        f"File too small ({file_size} bytes), retrying...",
                    )
                else:
                    syslog.syslog(
                        syslog.LOG_WARNING,
                        f"Attempt {attempt + 1}: File doesn't exist yet",
                    )
                if attempt < 4:
                    time.sleep(0.2)

            if audio_valid:
                recording_info["status"] = "recorded"
                self._emit_threadsafe(self.RecordingStopped, recording_id, "completed")
                self._transcribe_audio(recording_id)
            else:
                recording_info["status"] = "failed"
                file_size = os.path.getsize(audio_file) if os.path.exists(audio_file) else 0
                error_msg = (
                    f"Audio validation failed: file_size={file_size} bytes, "
                    f"file_exists={os.path.exists(audio_file)}"
                )
                syslog.syslog(syslog.LOG_ERR, f"DEBUG: {error_msg}")
                self._emit_threadsafe(
                    self.RecordingError,
                    recording_id,
                    f"No audio recorded or file too small (size: {file_size} bytes)",
                )

        except Exception as e:
            recording_info["status"] = "failed"
            self._emit_threadsafe(self.RecordingError, recording_id, str(e))
        finally:
            self._cleanup_recording(recording_id)

    def _transcribe_audio(self, recording_id):
        """Transcribe recorded audio."""
        recording_info = self.active_recordings.get(recording_id)
        if not recording_info or recording_info["status"] != "recorded":
            return

        audio_file = recording_info.get("audio_file")
        if not audio_file or not os.path.exists(audio_file):
            self._emit_threadsafe(self.RecordingError, recording_id, "Audio file not found")
            return

        try:
            recording_info["status"] = "transcribing"

            # Detect silent recordings early to avoid confusing empty transcriptions.
            rms = self._wav_rms_normalized(audio_file)
            syslog.syslog(syslog.LOG_INFO, f"Audio RMS (normalized): {rms:.6f}")
            if rms < 0.001:
                recording_info["status"] = "failed"
                self._emit_threadsafe(
                    self.RecordingError,
                    recording_id,
                    "No speech detected (audio appears silent). "
                    "Check your microphone input and that PulseAudio/PipeWire default source is correct.",
                )
                return

            syslog.syslog(syslog.LOG_INFO, f"Starting transcription for recording {recording_id}")
            started = time.time()

            model = self._load_whisper_model()
            # Force fp16 off for CPU-only environments.
            result = model.transcribe(audio_file, fp16=False)
            text = result["text"].strip()

            if not text:
                recording_info["status"] = "failed"
                self._emit_threadsafe(
                    self.RecordingError,
                    recording_id,
                    "Transcription produced empty text. "
                    "This often means the recording contained silence or very low volume input. "
                    "Check microphone/input source and try again.",
                )
                return

            recording_info["text"] = text
            recording_info["status"] = "completed"

            syslog.syslog(
                syslog.LOG_INFO,
                f"Transcription finished for {recording_id} in {time.time() - started:.1f}s (chars={len(text)})",
            )
            self._emit_threadsafe(self.TranscriptionReady, recording_id, text)

            copy_to_clipboard = recording_info.get("copy_to_clipboard", False)
            preview_mode = recording_info.get("preview_mode", False)

            if not preview_mode:
                if self._type_text(text):
                    self._emit_threadsafe(self.TextTyped, text, True)
                else:
                    self._emit_threadsafe(self.TextTyped, text, False)

            if copy_to_clipboard:
                self._copy_to_clipboard(text)

        except Exception as e:
            recording_info["status"] = "failed"
            self._emit_threadsafe(self.RecordingError, recording_id, f"Transcription failed: {str(e)}")
        finally:
            try:
                if audio_file and os.path.exists(audio_file):
                    os.unlink(audio_file)
            except Exception:
                pass

            self._cleanup_recording(recording_id)

    # D-Bus Methods (must preserve signatures expected by the GNOME extension)
    @method()
    def StartRecording(self, duration: "i", copy_to_clipboard: "b", preview_mode: "b") -> "s":
        """Start a new recording session."""
        try:
            deps_ok, missing = self._check_dependencies()
            if not deps_ok:
                raise Exception(f"Missing dependencies: {', '.join(missing)}")

            recording_id = str(uuid.uuid4())
            duration = min(max(1, int(duration)), 300)  # 1s to 5min

            self.active_recordings[recording_id] = {
                "id": recording_id,
                "duration": duration,
                "copy_to_clipboard": bool(copy_to_clipboard),
                "preview_mode": bool(preview_mode),
                "status": "starting",
                "created_at": datetime.now(),
                "stop_requested": False,
            }

            thread = threading.Thread(target=self._record_audio, args=(recording_id, duration))
            thread.daemon = True
            thread.start()

            return recording_id

        except Exception as e:
            error_msg = str(e)
            print(f"StartRecording error: {error_msg}")
            dummy_id = str(uuid.uuid4())
            self._emit_threadsafe(self.RecordingError, dummy_id, error_msg)
            return dummy_id

    @method()
    def StopRecording(self, recording_id: "s") -> "b":
        """Stop an active recording."""
        try:
            recording_info = self.active_recordings.get(recording_id)
            if not recording_info:
                return False

            recording_info["stop_requested"] = True

            process = recording_info.get("process")
            if process and process.poll() is None:
                try:
                    process.send_signal(signal.SIGINT)
                except Exception:
                    pass

            return True

        except Exception as e:
            print(f"StopRecording error: {e}")
            return False

    @method()
    def CancelRecording(self, recording_id: "s") -> "b":
        """Cancel an active recording without processing."""
        try:
            recording_info = self.active_recordings.get(recording_id)
            if not recording_info:
                return False

            print(f"Cancelling recording {recording_id}")
            recording_info["status"] = "cancelled"
            recording_info["stop_requested"] = True

            self._cleanup_recording(recording_id)
            self._emit_threadsafe(self.RecordingStopped, recording_id, "cancelled")

            return True

        except Exception as e:
            print(f"CancelRecording error: {e}")
            return False

    @method()
    def TypeText(self, text: "s", copy_to_clipboard: "b") -> "b":
        """Type provided text directly."""
        try:
            success = True

            if not self._type_text(text):
                success = False

            if copy_to_clipboard:
                if not self._copy_to_clipboard(text):
                    print("Failed to copy to clipboard")

            self.TextTyped(text, success)
            return success

        except Exception as e:
            print(f"TypeText error: {e}")
            self.TextTyped(text, False)
            return False

    @method()
    def GetServiceStatus(self) -> "s":
        """Get current service status."""
        try:
            deps_ok, missing = self._check_dependencies()
            if not deps_ok:
                return f"dependencies_missing:{','.join(missing)}"

            active_count = len(
                [
                    r
                    for r in self.active_recordings.values()
                    if r.get("status") in ["recording", "transcribing"]
                ]
            )

            return f"ready:active_recordings={active_count}"

        except Exception as e:
            return f"error:{str(e)}"

    @method()
    def CheckDependencies(self) -> "bas":
        """Check if all dependencies are available."""
        try:
            deps_ok, missing = self._check_dependencies()
            return [deps_ok, missing]
        except Exception as e:
            return [False, [f"Error checking dependencies: {str(e)}"]]

    # D-Bus Signals
    @dbus_signal()
    def RecordingStarted(self, recording_id: "s") -> "s":
        return recording_id

    @dbus_signal()
    def RecordingStopped(self, recording_id: "s", reason: "s") -> "ss":
        return [recording_id, reason]

    @dbus_signal()
    def TranscriptionReady(self, recording_id: "s", text: "s") -> "ss":
        return [recording_id, text]

    @dbus_signal()
    def RecordingError(self, recording_id: "s", error_message: "s") -> "ss":
        return [recording_id, error_message]

    @dbus_signal()
    def TextTyped(self, text: "s", success: "b") -> "sb":
        return [text, success]

    def shutdown(self):
        """Attempt graceful shutdown of active recordings."""
        for recording_id, recording_info in list(self.active_recordings.items()):
            process = recording_info.get("process")
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

            self._cleanup_recording(recording_id)


async def _async_main():
    loop = asyncio.get_running_loop()
    service = Speech2TextService(loop)

    bus = await MessageBus().connect()
    bus.export(OBJECT_PATH, service)
    await bus.request_name(BUS_NAME)

    print("Starting Speech2Text D-Bus service main loop (asyncio)...")

    def _handle_shutdown(signum=None):
        print(f"Received signal {signum}, shutting down...")
        try:
            service.shutdown()
        finally:
            bus.disconnect()

    # Prefer asyncio-native signal handlers
    try:
        loop.add_signal_handler(signal.SIGTERM, _handle_shutdown, signal.SIGTERM)
        loop.add_signal_handler(signal.SIGINT, _handle_shutdown, signal.SIGINT)
    except (NotImplementedError, RuntimeError):
        # Fallback for environments without add_signal_handler
        signal.signal(signal.SIGTERM, lambda s, f: loop.call_soon_threadsafe(_handle_shutdown, s))
        signal.signal(signal.SIGINT, lambda s, f: loop.call_soon_threadsafe(_handle_shutdown, s))

    try:
        await bus.wait_for_disconnect()
    finally:
        # Best-effort cleanup
        try:
            service.shutdown()
        except Exception:
            pass

    return 0


def main():
    """Main function to start the D-Bus service."""
    try:
        return asyncio.run(_async_main())
    except KeyboardInterrupt:
        return 0
    except Exception as e:
        print(f"Error starting service: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
