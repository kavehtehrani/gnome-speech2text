#!/usr/bin/env python3

import subprocess
import tempfile
import os
import sys
import whisper
import signal
import time

def record_audio(duration=5, sample_rate=16000):
    """Record audio using ffmpeg with minimal delay"""
    print("🎤 Recording started - speak now!", flush=True)
    
    # Create temporary file for audio
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
        audio_file = tmp_file.name
    
    try:
        # Use ffmpeg with minimal buffering for faster startup
        cmd = [
            'ffmpeg', '-y',  # -y to overwrite output file
            '-f', 'pulse',   # Use PulseAudio input
            '-i', 'default', # Default microphone
            '-t', str(duration),  # Duration
            '-ar', str(sample_rate),  # Sample rate
            '-ac', '1',      # Mono
            '-f', 'wav',     # Output format
            '-loglevel', 'error',  # Reduce ffmpeg output
            audio_file
        ]
        
        # Run ffmpeg 
        process = subprocess.Popen(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE)
        
        # Wait for recording to complete or be interrupted
        try:
            process.wait()
        except KeyboardInterrupt:
            process.terminate()
            process.wait()
            print("🛑 Recording stopped by user", flush=True)
            return audio_file if os.path.exists(audio_file) and os.path.getsize(audio_file) > 0 else None
        
        if process.returncode == 0:
            print("✅ Recording complete!", flush=True)
            return audio_file
        else:
            print("❌ Error recording audio", flush=True)
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

def signal_handler(signum, frame):
    """Handle termination signals gracefully"""
    print("🛑 Recording interrupted", flush=True)
    sys.exit(0)

def main():
    """Main function to orchestrate recording, transcription, and typing"""
    # Set up signal handlers for graceful termination
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    print("🎙️ Whisper Typing Extension Started", flush=True)
    
    # Record audio 
    audio_file = record_audio(duration=5)
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
