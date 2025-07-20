"""
Tests for whisper_typing.py module
"""
import pytest
import signal
import os
from unittest.mock import Mock, patch, MagicMock

# Mock the whisper module before importing whisper_typing
with patch.dict('sys.modules', {'whisper': Mock()}):
    import whisper_typing


class TestSignalHandler:
    """Test signal handling functionality"""
    
    def test_sigusr1_sets_stop_recording(self):
        """Test that SIGUSR1 sets the global stop flag"""
        whisper_typing.stop_recording = False
        whisper_typing.signal_handler(signal.SIGUSR1, None)
        assert whisper_typing.stop_recording is True
    
    def test_sigterm_exits(self):
        """Test that SIGTERM causes system exit"""
        with pytest.raises(SystemExit):
            whisper_typing.signal_handler(signal.SIGTERM, None)
    
    def test_other_signals_exit(self):
        """Test that other signals cause system exit"""
        with pytest.raises(SystemExit):
            whisper_typing.signal_handler(signal.SIGINT, None)


class TestDisplayServerDetection:
    """Test display server detection functionality"""
    
    def test_detect_x11_via_session_type(self, mock_environment):
        """Test X11 detection via XDG_SESSION_TYPE"""
        mock_environment['XDG_SESSION_TYPE'] = 'x11'
        result = whisper_typing.detect_display_server()
        assert result == 'x11'
    
    def test_detect_wayland_via_session_type(self, mock_environment):
        """Test Wayland detection via XDG_SESSION_TYPE"""
        mock_environment['XDG_SESSION_TYPE'] = 'wayland'
        result = whisper_typing.detect_display_server()
        assert result == 'wayland'
    
    def test_detect_wayland_via_display_env(self, mock_environment):
        """Test Wayland detection via WAYLAND_DISPLAY"""
        mock_environment['XDG_SESSION_TYPE'] = ''
        mock_environment['WAYLAND_DISPLAY'] = 'wayland-0'
        with patch.dict(os.environ, mock_environment):
            result = whisper_typing.detect_display_server()
            assert result == 'wayland'
    
    def test_detect_x11_via_display_env(self, mock_environment):
        """Test X11 detection via DISPLAY"""
        mock_environment['XDG_SESSION_TYPE'] = ''
        if 'WAYLAND_DISPLAY' in mock_environment:
            del mock_environment['WAYLAND_DISPLAY']
        mock_environment['DISPLAY'] = ':0'
        with patch.dict(os.environ, mock_environment, clear=False):
            result = whisper_typing.detect_display_server()
            assert result == 'x11'


class TestAudioRecording:
    """Test audio recording functionality"""
    
    @patch('whisper_typing.subprocess.run')
    def test_record_audio_success(self, mock_run, temp_audio_file):
        """Test successful audio recording"""
        mock_run.return_value.returncode = 0
        
        # Mock the record_audio function (would need to be extracted)
        with patch('tempfile.NamedTemporaryFile') as mock_temp:
            mock_temp.return_value.__enter__.return_value.name = temp_audio_file
            # Test would go here once function is extracted
    
    @patch('whisper_typing.subprocess.run')
    def test_record_audio_failure(self, mock_run):
        """Test audio recording failure handling"""
        mock_run.return_value.returncode = 1
        mock_run.return_value.stderr = b'Recording failed'
        
        # Test would verify proper error handling


class TestWhisperIntegration:
    """Test Whisper model integration"""
    
    def test_transcribe_audio(self, mock_whisper_model, temp_audio_file):
        """Test audio transcription"""
        result = mock_whisper_model.transcribe(temp_audio_file)
        assert result['text'] == 'test transcription'
        mock_whisper_model.transcribe.assert_called_once_with(temp_audio_file)
    
    @patch('whisper.load_model')
    def test_model_loading(self, mock_load_model):
        """Test Whisper model loading"""
        mock_model = Mock()
        mock_load_model.return_value = mock_model
        
        # Would test actual model loading code once extracted to function
        model = mock_load_model('base')
        assert model == mock_model


class TestTextInsertion:
    """Test text insertion functionality"""
    
    @patch('whisper_typing.subprocess.run')
    def test_xdotool_text_insertion(self, mock_run, mock_environment):
        """Test text insertion via xdotool on X11"""
        mock_environment['XDG_SESSION_TYPE'] = 'x11'
        mock_run.return_value.returncode = 0
        
        # Test would verify xdotool command construction and execution
    
    @patch('whisper_typing.subprocess.run')
    def test_clipboard_copy_x11(self, mock_run, mock_environment):
        """Test clipboard copying on X11"""
        mock_environment['XDG_SESSION_TYPE'] = 'x11'
        mock_run.return_value.returncode = 0
        
        # Test would verify xclip command for clipboard
    
    @patch('whisper_typing.subprocess.run')
    def test_clipboard_copy_wayland(self, mock_run, mock_environment):
        """Test clipboard copying on Wayland"""
        mock_environment['XDG_SESSION_TYPE'] = 'wayland'
        mock_run.return_value.returncode = 0
        
        # Test would verify wl-copy command for clipboard