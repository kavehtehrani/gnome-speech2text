#!/usr/bin/env python3

import subprocess
import tempfile
import os
import sys
import whisper

def record_audio(duration=5, sample_rate=16000):
    """Record audio using ffmpeg instead of pyaudio"""
    print(f"🎤 Recording for {duration} seconds...")
    
    # Create temporary file for audio
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
        audio_file = tmp_file.name
    
    try:
        # Use ffmpeg to record audio from default microphone
        cmd = [
            'ffmpeg', '-y',  # -y to overwrite output file
            '-f', 'pulse',   # Use PulseAudio input
            '-i', 'default', # Default microphone
            '-t', str(duration),  # Duration
            '-ar', str(sample_rate),  # Sample rate
            '-ac', '1',      # Mono
            '-f', 'wav',     # Output format
            audio_file
        ]
        
        # Run ffmpeg with minimal output
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"❌ Error recording audio: {result.stderr}")
            return None
            
        print("✅ Recording complete!")
        return audio_file
        
    except Exception as e:
        print(f"❌ Error during recording: {e}")
        return None

def transcribe_audio(audio_file):
    """Transcribe audio using Whisper"""
    if not audio_file or not os.path.exists(audio_file):
        return None
        
    print("🧠 Transcribing audio...")
    
    try:
        # Load Whisper model (using base model for speed)
        model = whisper.load_model("base")
        
        # Transcribe the audio
        result = model.transcribe(audio_file)
        text = result["text"].strip()
        
        print(f"📝 Transcribed: '{text}'")
        return text
        
    except Exception as e:
        print(f"❌ Error during transcription: {e}")
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
        
    print("⌨️ Typing text...")
    
    try:
        # Use xdotool to type the text
        subprocess.run(['xdotool', 'type', '--delay', '10', text], check=True)
        print("✅ Text typed successfully!")
        
    except Exception as e:
        print(f"❌ Error typing text: {e}")

def main():
    """Main function to orchestrate recording, transcription, and typing"""
    print("🎙️ Whisper Typing Extension Started")
    
    # Record audio
    audio_file = record_audio(duration=5)
    if not audio_file:
        print("❌ Failed to record audio")
        return
    
    # Transcribe audio
    text = transcribe_audio(audio_file)
    if not text:
        print("❌ Failed to transcribe audio")
        return
    
    # Type the transcribed text
    type_text(text)
    
    print("🎉 Done!")

if __name__ == "__main__":
    main()
