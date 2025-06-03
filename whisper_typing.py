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

def record_audio_with_vad(max_duration=30, silence_duration=2.0, sample_rate=16000):
    """Record audio with voice activity detection - stops after silence_duration seconds of quiet"""
    global stop_recording
    
    print("🎤 Recording started - speak now! (Will auto-stop after {} seconds of silence)".format(silence_duration), flush=True)
    
    # Create temporary file for audio
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
        audio_file = tmp_file.name
    
    # Queue for communication between threads
    audio_queue = queue.Queue()
    
    try:
        # Use ffmpeg to record audio and monitor volume levels
        cmd = [
            'ffmpeg', '-y',
            '-f', 'pulse',
            '-i', 'default',
            '-t', str(max_duration),  # Maximum duration
            '-ar', str(sample_rate),
            '-ac', '1',
            '-af', 'volumedetect',  # Add volume detection
            '-f', 'wav',
            audio_file,
            '-f', 'null',  # Also output to null for real-time volume monitoring
            '-'
        ]
        
        # Start ffmpeg process
        process = subprocess.Popen(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        
        # Voice activity detection variables
        last_speech_time = time.time()
        speech_detected = False
        silence_threshold_db = -50  # dB threshold for speech detection
        
        def monitor_audio_levels():
            nonlocal last_speech_time, speech_detected
            
            while process.poll() is None and not stop_recording:
                line = process.stderr.readline()
                if line and 'mean_volume:' in line:
                    try:
                        # Parse volume from ffmpeg output
                        # Example: [Parsed_volumedetect_0 @ 0x...] mean_volume: -23.1 dB
                        vol_str = line.split('mean_volume:')[1].split('dB')[0].strip()
                        volume_db = float(vol_str)
                        
                        current_time = time.time()
                        
                        # Check if this is speech (above threshold)
                        if volume_db > silence_threshold_db:
                            last_speech_time = current_time
                            if not speech_detected:
                                speech_detected = True
                                print("🗣️ Speech detected!", flush=True)
                        
                        # Check for silence timeout (only after we've detected speech)
                        if speech_detected and (current_time - last_speech_time) >= silence_duration:
                            print("🤫 Silence detected for {:.1f}s - stopping recording".format(silence_duration), flush=True)
                            process.terminate()
                            break
                            
                    except (ValueError, IndexError):
                        pass
            
            # If manual stop was requested, terminate the process gently
            if stop_recording:
                print("🛑 Manual stop requested - stopping recording", flush=True)
                try:
                    # Send SIGTERM to ffmpeg to let it finalize the file
                    process.terminate()
                    # Wait a moment for graceful shutdown
                    time.sleep(0.5)
                    if process.poll() is None:
                        # If still running, force kill
                        process.kill()
                except:
                    pass
        
        # Start monitoring in separate thread
        monitor_thread = threading.Thread(target=monitor_audio_levels)
        monitor_thread.daemon = True
        monitor_thread.start()
        
        # Wait for process to complete or be interrupted
        try:
            process.wait()
        except KeyboardInterrupt:
            process.terminate()
            process.wait()
            print("🛑 Recording stopped by user", flush=True)
            return audio_file if os.path.exists(audio_file) and os.path.getsize(audio_file) > 0 else None
        
        if process.returncode == 0 or process.returncode == -15 or process.returncode == 255:  # 255 is ffmpeg interrupted
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
    # Set up signal handlers for graceful termination
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGUSR1, signal_handler)  # Handle gentle stop
    
    print("🎙️ Whisper Typing Extension Started", flush=True)
    
    # Record audio with voice activity detection
    audio_file = record_audio_with_vad(max_duration=30, silence_duration=2.0)
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
