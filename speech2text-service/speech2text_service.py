#!/usr/bin/env python3

import dbus
import dbus.service
import dbus.mainloop.glib
from gi.repository import GLib
import subprocess
import tempfile
import os
import sys
import whisper
import signal
import time
import threading
import uuid
from datetime import datetime

class Speech2TextService(dbus.service.Object):
    """D-Bus service for speech-to-text functionality"""
    
    def __init__(self):
        # Set up D-Bus
        dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
        bus = dbus.SessionBus()
        bus_name = dbus.service.BusName("org.gnome.Speech2Text", bus)
        super().__init__(bus_name, "/org/gnome/Speech2Text")
        
        # Service state
        self.active_recordings = {}  # recording_id -> recording_info
        self.whisper_model = None
        self.dependencies_checked = False
        self.missing_deps = []
        
        print("Speech2Text D-Bus service started")
        
    def _load_whisper_model(self):
        """Lazy load Whisper model with CPU fallback"""
        if self.whisper_model is None:
            try:
                print("Loading Whisper model...")
                # Force CPU-only mode to avoid CUDA compatibility issues
                self.whisper_model = whisper.load_model("base", device="cpu")
                print("Whisper model loaded successfully on CPU")
            except Exception as e:
                print(f"Failed to load Whisper model: {e}")
                raise e
        return self.whisper_model
    
    def _check_dependencies(self):
        """Check if all required dependencies are available"""
        if self.dependencies_checked:
            return len(self.missing_deps) == 0, self.missing_deps
            
        missing = []
        
        # Check for ffmpeg
        try:
            subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        except (FileNotFoundError, subprocess.CalledProcessError):
            missing.append("ffmpeg")
        
        # Check for clipboard tools (session-type specific)
        clipboard_available = False
        session_type = os.environ.get('XDG_SESSION_TYPE', '')
        
        # Check for xdotool (for X11 typing only)
        if session_type != 'wayland':
            try:
                subprocess.run(['xdotool', '--version'], capture_output=True, check=True)
            except (FileNotFoundError, subprocess.CalledProcessError):
                missing.append("xdotool")
        
        if session_type == 'wayland':
            # On Wayland, only wl-copy works
            try:
                subprocess.run(['which', 'wl-copy'], capture_output=True, check=True)
                clipboard_available = True
            except (FileNotFoundError, subprocess.CalledProcessError):
                pass
        else:
            # On X11 or unknown, check for xclip/xsel
            for tool in ['xclip', 'xsel']:
                try:
                    subprocess.run(['which', tool], capture_output=True, check=True)
                    clipboard_available = True
                    break
                except (FileNotFoundError, subprocess.CalledProcessError):
                    continue
        
        if not clipboard_available:
            if session_type == 'wayland':
                missing.append("wl-clipboard (required for Wayland)")
            else:
                missing.append("clipboard-tools (xclip or xsel for X11)")
        
        # Check for Whisper
        try:
            import whisper
        except ImportError:
            missing.append("whisper")
        
        self.missing_deps = missing
        self.dependencies_checked = True
        return len(missing) == 0, missing
    
    def _detect_display_server(self):
        """Detect if we're running on X11 or Wayland"""
        try:
            session_type = os.environ.get('XDG_SESSION_TYPE', '').lower()
            if session_type:
                return session_type
            
            if os.environ.get('WAYLAND_DISPLAY'):
                return 'wayland'
            
            if os.environ.get('DISPLAY'):
                return 'x11'
            
            return 'x11'  # fallback
        except:
            return 'x11'
    
    def _copy_to_clipboard(self, text):
        """Copy text to clipboard with X11/Wayland support"""
        if not text:
            return False
        
        display_server = self._detect_display_server()
        
        try:
            if display_server == 'wayland':
                try:
                    subprocess.run(['wl-copy'], input=text, text=True, check=True)
                    return True
                except (FileNotFoundError, subprocess.CalledProcessError):
                    # Fallback to xclip (XWayland)
                    try:
                        subprocess.run(['xclip', '-selection', 'clipboard'], 
                                     input=text, text=True, check=True)
                        return True
                    except (FileNotFoundError, subprocess.CalledProcessError):
                        return False
            else:
                # X11
                try:
                    subprocess.run(['xclip', '-selection', 'clipboard'], 
                                 input=text, text=True, check=True)
                    return True
                except (FileNotFoundError, subprocess.CalledProcessError):
                    try:
                        subprocess.run(['xsel', '--clipboard', '--input'], 
                                     input=text, text=True, check=True)
                        return True
                    except (FileNotFoundError, subprocess.CalledProcessError):
                        return False
        except Exception as e:
            print(f"Error copying to clipboard: {e}")
            return False
    
    def _type_text(self, text):
        """Type text using appropriate method for display server"""
        if not text:
            return False
        
        try:
            # Use xdotool for typing (works on both X11 and XWayland)
            subprocess.run(['xdotool', 'type', '--delay', '10', text], check=True)
            return True
        except Exception as e:
            print(f"Error typing text: {e}")
            return False
    
    def _cleanup_recording(self, recording_id):
        """Clean up recording resources and remove from active recordings"""
        try:
            recording_info = self.active_recordings.get(recording_id)
            if recording_info:
                # Stop any running process
                process = recording_info.get('process')
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
                                subprocess.run(['kill', '-9', str(process.pid)], check=False)
                            except:
                                pass
                    except Exception as e:
                        print(f"Error cleaning up process: {e}")
                
                # Clean up audio file if it exists
                audio_file = recording_info.get('audio_file')
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
        """Record audio in a separate thread"""
        recording_info = self.active_recordings.get(recording_id)
        if not recording_info:
            return
        
        # Create temporary file for audio
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
            audio_file = tmp_file.name
        
        recording_info['audio_file'] = audio_file
        recording_info['status'] = 'recording'
        
        try:
            # Emit recording started signal
            self.RecordingStarted(recording_id)
            
            # Use ffmpeg to record audio
            cmd = [
                'ffmpeg', '-y',
                '-f', 'pulse',
                '-i', 'default',
                '-t', str(max_duration),
                '-ar', '16000',
                '-ac', '1',
                '-f', 'wav',
                audio_file
            ]
            
            process = subprocess.Popen(cmd, stderr=subprocess.PIPE, 
                                     stdout=subprocess.PIPE, text=True)
            recording_info['process'] = process
            
            # Wait for process or manual stop
            while process.poll() is None and recording_info.get('stop_requested', False) == False:
                time.sleep(0.1)
            
            # Stop recording if requested
            if recording_info.get('stop_requested', False):
                try:
                    # First try SIGINT (graceful)
                    process.send_signal(signal.SIGINT)
                    time.sleep(0.5)
                    
                    # If still running, try SIGTERM
                    if process.poll() is None:
                        process.terminate()
                        time.sleep(0.5)
                    
                    # If still running, force kill
                    if process.poll() is None:
                        process.kill()
                        time.sleep(0.2)
                    
                    # Final check and force cleanup if needed
                    if process.poll() is None:
                        print(f"Warning: ffmpeg process {process.pid} may still be running")
                        try:
                            # Try system kill as last resort
                            subprocess.run(['kill', '-9', str(process.pid)], check=False)
                        except:
                            pass
                except Exception as e:
                    print(f"Error stopping recording process: {e}")
            
            process.wait()
            
            # Give a small delay for file system to flush the audio data
            time.sleep(0.2)
            
            # Check if we have valid audio with retry logic for short recordings
            audio_valid = False
            for attempt in range(3):  # Try up to 3 times
                if os.path.exists(audio_file):
                    file_size = os.path.getsize(audio_file)
                    # Lower threshold to 400 bytes (just above WAV header size)
                    # and ensure file has some content
                    if file_size > 400:
                        audio_valid = True
                        break
                # Small delay between attempts
                if attempt < 2:
                    time.sleep(0.1)
            
            if audio_valid:
                recording_info['status'] = 'recorded'
                self.RecordingStopped(recording_id, "completed")
                
                # Start transcription
                self._transcribe_audio(recording_id)
            else:
                recording_info['status'] = 'failed'
                file_size = os.path.getsize(audio_file) if os.path.exists(audio_file) else 0
                self.RecordingError(recording_id, f"No audio recorded or file too small (size: {file_size} bytes)")
                
        except Exception as e:
            recording_info['status'] = 'failed'
            self.RecordingError(recording_id, str(e))
        finally:
            # Always clean up the recording from active recordings
            # regardless of success or failure
            self._cleanup_recording(recording_id)
    
    def _transcribe_audio(self, recording_id):
        """Transcribe recorded audio"""
        recording_info = self.active_recordings.get(recording_id)
        if not recording_info or recording_info['status'] != 'recorded':
            return
        
        audio_file = recording_info.get('audio_file')
        if not audio_file or not os.path.exists(audio_file):
            self.RecordingError(recording_id, "Audio file not found")
            return
        
        try:
            recording_info['status'] = 'transcribing'
            
            # Load model and transcribe
            model = self._load_whisper_model()
            result = model.transcribe(audio_file)
            text = result["text"].strip()
            
            recording_info['text'] = text
            recording_info['status'] = 'completed'
            
            # Emit transcription ready signal
            self.TranscriptionReady(recording_id, text)
            
            # Handle post-processing based on recording options
            copy_to_clipboard = recording_info.get('copy_to_clipboard', False)
            preview_mode = recording_info.get('preview_mode', False)
            
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
            recording_info['status'] = 'failed'
            self.RecordingError(recording_id, f"Transcription failed: {str(e)}")
        finally:
            # Clean up audio file and recording state
            try:
                if audio_file and os.path.exists(audio_file):
                    os.unlink(audio_file)
            except:
                pass
            
            # Clean up the recording from active recordings
            self._cleanup_recording(recording_id)

    # D-Bus Methods
    @dbus.service.method("org.gnome.Speech2Text", in_signature='ibb', out_signature='s')
    def StartRecording(self, duration, copy_to_clipboard, preview_mode):
        """Start a new recording session"""
        try:
            # Check dependencies first
            deps_ok, missing = self._check_dependencies()
            if not deps_ok:
                raise Exception(f"Missing dependencies: {', '.join(missing)}")
            
            # Generate unique recording ID
            recording_id = str(uuid.uuid4())
            
            # Validate duration
            duration = max(10, min(300, duration))  # 10s to 5min
            
            # Store recording info
            self.active_recordings[recording_id] = {
                'id': recording_id,
                'duration': duration,
                'copy_to_clipboard': copy_to_clipboard,
                'preview_mode': preview_mode,
                'status': 'starting',
                'created_at': datetime.now(),
                'stop_requested': False
            }
            
            # Start recording in separate thread
            thread = threading.Thread(target=self._record_audio, 
                                    args=(recording_id, duration))
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
    
    @dbus.service.method("org.gnome.Speech2Text", in_signature='s', out_signature='b')
    def StopRecording(self, recording_id):
        """Stop an active recording"""
        try:
            recording_info = self.active_recordings.get(recording_id)
            if not recording_info:
                return False
            
            recording_info['stop_requested'] = True
            
            # Stop the process if it's running
            process = recording_info.get('process')
            if process and process.poll() is None:
                try:
                    process.send_signal(signal.SIGINT)
                except:
                    pass
            
            return True
            
        except Exception as e:
            print(f"StopRecording error: {e}")
            return False
    
    @dbus.service.method("org.gnome.Speech2Text", in_signature='s', out_signature='b')
    def CancelRecording(self, recording_id):
        """Cancel an active recording without processing"""
        try:
            recording_info = self.active_recordings.get(recording_id)
            if not recording_info:
                return False
            
            print(f"Cancelling recording {recording_id}")
            
            # Mark as cancelled
            recording_info['status'] = 'cancelled'
            recording_info['stop_requested'] = True
            
            # Immediately clean up the recording
            self._cleanup_recording(recording_id)
            
            # Emit cancelled signal
            self.RecordingStopped(recording_id, "cancelled")
            
            return True
            
        except Exception as e:
            print(f"CancelRecording error: {e}")
            return False
    
    @dbus.service.method("org.gnome.Speech2Text", in_signature='sb', out_signature='b')
    def TypeText(self, text, copy_to_clipboard):
        """Type provided text directly"""
        try:
            success = True
            
            # Type the text
            if not self._type_text(text):
                success = False
            
            # Copy to clipboard if requested
            if copy_to_clipboard:
                if not self._copy_to_clipboard(text):
                    print("Failed to copy to clipboard")
            
            # Emit signal
            self.TextTyped(text, success)
            return success
            
        except Exception as e:
            print(f"TypeText error: {e}")
            self.TextTyped(text, False)
            return False
    
    @dbus.service.method("org.gnome.Speech2Text", out_signature='s')
    def GetServiceStatus(self):
        """Get current service status"""
        try:
            deps_ok, missing = self._check_dependencies()
            if not deps_ok:
                return f"dependencies_missing:{','.join(missing)}"
            
            active_count = len([r for r in self.active_recordings.values() 
                              if r['status'] in ['recording', 'transcribing']])
            
            return f"ready:active_recordings={active_count}"
            
        except Exception as e:
            return f"error:{str(e)}"
    
    @dbus.service.method("org.gnome.Speech2Text", out_signature='bas')
    def CheckDependencies(self):
        """Check if all dependencies are available"""
        try:
            deps_ok, missing = self._check_dependencies()
            return deps_ok, missing
        except Exception as e:
            return False, [f"Error checking dependencies: {str(e)}"]

    # D-Bus Signals
    @dbus.service.signal("org.gnome.Speech2Text", signature='s')
    def RecordingStarted(self, recording_id):
        pass
    
    @dbus.service.signal("org.gnome.Speech2Text", signature='ss')
    def RecordingStopped(self, recording_id, reason):
        pass
    
    @dbus.service.signal("org.gnome.Speech2Text", signature='ss')
    def TranscriptionReady(self, recording_id, text):
        pass
    
    @dbus.service.signal("org.gnome.Speech2Text", signature='ss')
    def RecordingError(self, recording_id, error_message):
        pass
    
    @dbus.service.signal("org.gnome.Speech2Text", signature='sb')
    def TextTyped(self, text, success):
        pass

def main():
    """Main function to start the D-Bus service"""
    try:
        service = Speech2TextService()
        
        # Set up signal handlers for graceful shutdown
        def signal_handler(signum, frame):
            print(f"Received signal {signum}, shutting down...")
            # Clean up active recordings
            for recording_id, recording_info in list(service.active_recordings.items()):
                process = recording_info.get('process')
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
            
            print("All recordings cleaned up, exiting...")
            sys.exit(0)
        
        signal.signal(signal.SIGTERM, signal_handler)
        signal.signal(signal.SIGINT, signal_handler)
        
        print("Starting Speech2Text D-Bus service main loop...")
        
        # Start the main loop
        loop = GLib.MainLoop()
        loop.run()
        
    except Exception as e:
        print(f"Error starting service: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 