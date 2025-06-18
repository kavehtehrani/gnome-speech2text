#!/usr/bin/env python3

import subprocess
import tempfile
import os
import sys
import whisper
import signal
import time
import threading
import queue
import argparse

# Global flag to indicate when to stop recording
stop_recording = False

def signal_handler(signum, frame):
    """Handle termination signals gracefully"""
    global stop_recording
    print("🔔 Signal received: {}".format(signum), flush=True)
    if signum == signal.SIGUSR1:
        print("🛑 Stop requested - finishing current recording", flush=True)
        stop_recording = True
    elif signum == signal.SIGTERM:
        print("🛑 Termination requested", flush=True)
        sys.exit(0)
    else:
        print("🛑 Recording interrupted", flush=True)
        sys.exit(0)

def detect_display_server():
    """Detect if we're running on X11 or Wayland"""
    try:
        # Check XDG_SESSION_TYPE first
        session_type = os.environ.get('XDG_SESSION_TYPE', '').lower()
        if session_type:
            print("🖥️ Display server detected via XDG_SESSION_TYPE: {}".format(session_type), flush=True)
            return session_type
        
        # Check WAYLAND_DISPLAY
        if os.environ.get('WAYLAND_DISPLAY'):
            print("🖥️ Display server detected via WAYLAND_DISPLAY: wayland", flush=True)
            return 'wayland'
        
        # Check DISPLAY (X11)
        if os.environ.get('DISPLAY'):
            print("🖥️ Display server detected via DISPLAY: x11", flush=True)
            return 'x11'
        
        # Fallback: try to detect based on running processes
        try:
            result = subprocess.run(['pgrep', '-x', 'gnome-shell'], capture_output=True, text=True)
            if result.returncode == 0:
                # Check if Wayland compositor is running
                result_wayland = subprocess.run(['pgrep', '-f', 'wayland'], capture_output=True, text=True)
                if result_wayland.returncode == 0:
                    print("🖥️ Display server detected via process check: wayland", flush=True)
                    return 'wayland'
        except:
            pass
        
        # Default fallback to X11
        print("🖥️ Display server detection failed, defaulting to: x11", flush=True)
        return 'x11'
        
    except Exception as e:
        print("❌ Error detecting display server: {}, defaulting to X11".format(e), flush=True)
        return 'x11'

def copy_to_clipboard(text, display_server=None):
    """Copy text to clipboard with X11/Wayland support"""
    if not text:
        return False
    
    print("📋 Copying text to clipboard...", flush=True)
    
    if display_server is None:
        display_server = detect_display_server()
    
    try:
        if display_server == 'wayland':
            # For Wayland, use wl-copy if available
            try:
                subprocess.run(['wl-copy'], input=text, text=True, check=True)
                print("✅ Text copied to clipboard (Wayland)", flush=True)
                return True
            except (FileNotFoundError, subprocess.CalledProcessError):
                print("⚠️ wl-copy not found, trying fallback methods", flush=True)
                
                # Fallback to xclip if available (works in XWayland)
                try:
                    subprocess.run(['xclip', '-selection', 'clipboard'], input=text, text=True, check=True)
                    print("✅ Text copied to clipboard (XWayland fallback)", flush=True)
                    return True
                except (FileNotFoundError, subprocess.CalledProcessError):
                    print("❌ No clipboard tools available for Wayland", flush=True)
                    return False
        else:
            # For X11, try xclip first, then xsel as fallback
            try:
                subprocess.run(['xclip', '-selection', 'clipboard'], input=text, text=True, check=True)
                print("✅ Text copied to clipboard (X11 - xclip)", flush=True)
                return True
            except (FileNotFoundError, subprocess.CalledProcessError):
                try:
                    subprocess.run(['xsel', '--clipboard', '--input'], input=text, text=True, check=True)
                    print("✅ Text copied to clipboard (X11 - xsel)", flush=True)
                    return True
                except (FileNotFoundError, subprocess.CalledProcessError):
                    print("❌ No clipboard tools available for X11 (install xclip or xsel)", flush=True)
                    return False
                    
    except Exception as e:
        print("❌ Error copying to clipboard: {}".format(e), flush=True)
        return False

def record_audio_simple(max_duration=60, sample_rate=16000):
    """Simple audio recording - stops only when manually stopped"""
    global stop_recording
    
    print("🎤 Recording started - speak now! Press 'Stop Recording' when done.", flush=True)
    print("⏰ Maximum recording time: {} seconds".format(max_duration), flush=True)
    
    # Create temporary file for audio
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
        audio_file = tmp_file.name
    
    try:
        # Use ffmpeg to record audio
        cmd = [
            'ffmpeg', '-y',
            '-f', 'pulse',
            '-i', 'default',
            '-t', str(max_duration),  # Maximum duration as fallback
            '-ar', str(sample_rate),
            '-ac', '1',
            '-f', 'wav',
            audio_file
        ]
        
        # Start ffmpeg process
        process = subprocess.Popen(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        
        def monitor_for_stop():
            """Monitor for manual stop signal"""
            while process.poll() is None and not stop_recording:
                time.sleep(0.1)  # Check every 100ms
            
            # If manual stop was requested, terminate recording gently
            if stop_recording:
                print("🛑 Stop requested - finalizing recording", flush=True)
                try:
                    # Send SIGINT for gentle termination
                    process.send_signal(signal.SIGINT)
                    time.sleep(0.5)
                    
                    # If still running, use SIGTERM
                    if process.poll() is None:
                        process.terminate()
                        time.sleep(0.3)
                        
                    # Final fallback
                    if process.poll() is None:
                        process.kill()
                        
                except Exception as e:
                    print("❌ Error stopping recording: {}".format(e), flush=True)
        
        # Start monitoring in separate thread
        monitor_thread = threading.Thread(target=monitor_for_stop)
        monitor_thread.daemon = True
        monitor_thread.start()
        
        # Wait for process to complete
        try:
            process.wait()
        except KeyboardInterrupt:
            process.terminate()
            process.wait()
            print("🛑 Recording stopped by user", flush=True)
            return audio_file if os.path.exists(audio_file) and os.path.getsize(audio_file) > 0 else None
        
        if process.returncode == 0 or process.returncode == -15 or process.returncode == 255 or process.returncode == -2:
            print("✅ Recording complete! (return code: {})".format(process.returncode), flush=True)
            # Check if we have a valid audio file
            if os.path.exists(audio_file):
                file_size = os.path.getsize(audio_file)
                print("📁 Audio file size: {} bytes".format(file_size), flush=True)
                if file_size > 1000:  # At least 1KB
                    return audio_file
                else:
                    print("⚠️ Audio file too small, may be empty", flush=True)
                    return None
            else:
                print("❌ Audio file not found", flush=True)
                return None
        else:
            print("❌ Error recording audio (return code: {})".format(process.returncode), flush=True)
            return None
            
    except Exception as e:
        print("❌ Error during recording: {}".format(e), flush=True)
        return None

def transcribe_audio(audio_file):
    """Transcribe audio using Whisper"""
    if not audio_file or not os.path.exists(audio_file):
        return None
        
    print("🧠 Transcribing audio...", flush=True)
    
    try:
        # Load Whisper model (using base model for speed)
        model = whisper.load_model("base")
        
        # Transcribe the audio
        result = model.transcribe(audio_file)
        text = result["text"].strip()
        
        print("📝 Transcribed: '{}'".format(text), flush=True)
        return text
        
    except Exception as e:
        print("❌ Error during transcription: {}".format(e), flush=True)
        return None
    finally:
        # Clean up temporary file
        try:
            os.unlink(audio_file)
        except:
            pass

def type_text(text):
    """Type the transcribed text using xdotool"""
    if not text:
        return
        
    print("⌨️ Typing text...", flush=True)
    
    try:
        # Use xdotool to type the text
        subprocess.run(['xdotool', 'type', '--delay', '10', text], check=True)
        print("✅ Text typed successfully!", flush=True)
        
    except Exception as e:
        print("❌ Error typing text: {}".format(e), flush=True)

def main():
    """Main function to orchestrate recording, transcription, and typing"""
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Whisper Speech-to-Text Extension')
    parser.add_argument('--duration', type=int, default=60, 
                       help='Maximum recording duration in seconds (default: 60)')
    parser.add_argument('--copy-to-clipboard', action='store_true',
                       help='Copy transcribed text to clipboard in addition to typing')
    parser.add_argument('--preview-mode', action='store_true',
                       help='Output transcribed text for preview instead of typing directly')
    args = parser.parse_args()
    
    # Validate duration (10 seconds to 5 minutes)
    if args.duration < 10:
        args.duration = 10
    elif args.duration > 300:
        args.duration = 300
    
    # Set up signal handlers for graceful termination
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGUSR1, signal_handler)  # Handle gentle stop
    
    print("🎙️ Whisper Typing Extension Started", flush=True)
    print("⏰ Recording duration limit: {} seconds".format(args.duration), flush=True)
    if args.copy_to_clipboard:
        print("📋 Clipboard copying enabled", flush=True)
    if args.preview_mode:
        print("👁️ Preview mode enabled", flush=True)
    
    # Detect display server early for better error reporting
    display_server = detect_display_server()
    
    # Record audio with configurable duration
    audio_file = record_audio_simple(max_duration=args.duration, sample_rate=16000)
    if not audio_file:
        print("❌ Failed to record audio", flush=True)
        return
    
    # Transcribe audio
    text = transcribe_audio(audio_file)
    if not text:
        print("❌ Failed to transcribe audio", flush=True)
        return
    
    # If in preview mode, output the transcribed text for the extension to capture
    if args.preview_mode:
        print("TRANSCRIBED_TEXT_START", flush=True)
        print(text, flush=True)
        print("TRANSCRIBED_TEXT_END", flush=True)
        print("🎉 Transcription complete - text sent to extension!", flush=True)
        return
    
    # Copy to clipboard if requested
    if args.copy_to_clipboard:
        copy_success = copy_to_clipboard(text, display_server)
        if not copy_success:
            print("⚠️ Failed to copy to clipboard, but continuing with typing", flush=True)
    
    # Type the transcribed text
    type_text(text)
    
    print("🎉 Done!", flush=True)

def type_text_only():
    """Standalone function to type text provided via command line argument"""
    parser = argparse.ArgumentParser(description='Type text using xdotool')
    parser.add_argument('text', help='Text to type')
    parser.add_argument('--copy-to-clipboard', action='store_true',
                       help='Copy text to clipboard in addition to typing')
    args = parser.parse_args()
    
    if args.copy_to_clipboard:
        display_server = detect_display_server()
        copy_success = copy_to_clipboard(args.text, display_server)
        if not copy_success:
            print("⚠️ Failed to copy to clipboard, but continuing with typing", flush=True)
    
    type_text(args.text)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--type-only":
        # Remove the --type-only flag and call type_text_only
        sys.argv.pop(1)
        type_text_only()
    else:
        main()
