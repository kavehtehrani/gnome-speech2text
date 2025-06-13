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
    
    # Type the transcribed text
    type_text(text)
    
    print("🎉 Done!", flush=True)

if __name__ == "__main__":
    main()
