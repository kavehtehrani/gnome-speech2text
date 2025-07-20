"""
Pytest configuration and fixtures for Python backend testing
"""
import pytest
import tempfile
import os
import sys
from unittest.mock import Mock, patch

# Add src directory to Python path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../src'))

@pytest.fixture
def temp_audio_file():
    """Create a temporary audio file for testing"""
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        # Create a minimal WAV file header
        tmp.write(b'RIFF' + b'\x00' * 4 + b'WAVE' + b'fmt ' + b'\x00' * 20 + b'data' + b'\x00' * 4)
        tmp.flush()
        yield tmp.name
    os.unlink(tmp.name)

@pytest.fixture
def mock_whisper_model():
    """Mock Whisper model for testing"""
    with patch('whisper.load_model') as mock_load:
        mock_model = Mock()
        mock_model.transcribe.return_value = {'text': 'test transcription'}
        mock_load.return_value = mock_model
        yield mock_model

@pytest.fixture
def mock_subprocess():
    """Mock subprocess for audio recording"""
    with patch('subprocess.run') as mock_run, \
         patch('subprocess.Popen') as mock_popen:
        mock_process = Mock()
        mock_process.returncode = 0
        mock_process.communicate.return_value = (b'', b'')
        mock_popen.return_value = mock_process
        mock_run.return_value = mock_process
        yield mock_process

@pytest.fixture
def mock_environment():
    """Mock environment variables"""
    env_vars = {
        'XDG_SESSION_TYPE': 'x11',
        'DISPLAY': ':0'
    }
    return env_vars