#!/usr/bin/env python3
"""
Whisper.cpp Client - A client library for whisper.cpp server

This module provides an OpenAI-compatible API for interacting with whisper.cpp servers.
It handles server health checking, auto-starting, and audio transcription.
"""

import subprocess
import time
from pathlib import Path
from typing import Any, BinaryIO, Optional
from urllib.parse import urlparse

import requests


class WhisperCppClient:
    """Client for whisper.cpp server with OpenAI-compatible API

    This client provides an interface similar to the OpenAI Python library
    but designed specifically for whisper.cpp servers.

    Args:
        base_url: Base URL of the whisper.cpp server (e.g., "http://localhost:8080")
        auto_start: Whether to automatically start the server if not running (localhost only)
        model_file: Model file name to use for auto-start. Examples:
            - Base models: "tiny", "base", "small", "medium"
            - Large models: "large-v1", "large-v2", "large-v3", "large-v3-turbo"
            - English-only: "tiny.en", "base.en", "small.en", "medium.en"
            - Quantized: "base-q5_1", "base-q8_0", "small-q5_1", "medium-q8_0"
        language: Language code for auto-start server (default: "auto" for auto-detection).
            Examples: "en", "es", "fr", "de", "auto"

    Example:
        >>> client = WhisperCppClient(base_url="http://localhost:8080")
        >>> with open("audio.wav", "rb") as f:
        ...     text = client.audio.transcriptions.create(file=f)
        >>> print(text)
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8080",
        auto_start: bool = True,
        model_file: str = "small",
        language: str = "auto",
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model_file = model_file
        self.language = language
        self._server_process: Optional[subprocess.Popen[bytes]] = None

        # Determine if this is a localhost server
        parsed_url = urlparse(base_url)
        self.is_localhost = parsed_url.hostname in ("localhost", "127.0.0.1", "::1")

        # Auto-start server if enabled and localhost
        if auto_start and self.is_localhost:
            self.start_server_if_needed()

        # Create nested resource objects for OpenAI-compatible API
        self._audio_resource = AudioResource(self)

    @property
    def audio(self) -> "AudioResource":
        """Access to audio-related resources (OpenAI-compatible)"""
        return self._audio_resource

    def health_check(self, timeout: float = 2.0) -> dict[str, str]:
        """Check if the whisper.cpp server is healthy and responding

        Args:
            timeout: Request timeout in seconds

        Returns:
            dict with 'status' key: 'ok', 'loading', or 'error'

        Example:
            >>> client.health_check()
            {'status': 'ok'}
        """
        try:
            # whisper.cpp provides a /health endpoint
            response = requests.get(f"{self.base_url}/health", timeout=timeout)

            if response.status_code == 200:
                data: dict[str, Any] = response.json()
                status = data.get("status", "unknown")
                return {"status": str(status)}
            elif response.status_code == 503:
                # Server is loading model
                data_503: dict[str, Any] = response.json()
                return {"status": "loading", "details": str(data_503.get("status"))}
            else:
                return {"status": "error", "code": str(response.status_code)}

        except requests.exceptions.RequestException as e:
            return {"status": "error", "details": str(e)}

    def start_server_if_needed(self) -> bool:
        """Start whisper.cpp server if not already running

        Only works for localhost servers. Checks if server is running,
        and if not, attempts to start it with the configured model file.

        Returns:
            bool: True if server is running (was already running or successfully started),
                  False otherwise
        """
        if not self.is_localhost:
            return False

        # Check if server is already running
        health = self.health_check()
        if health["status"] == "ok":
            return True

        # Determine model path
        model_path = (
            Path.home() / ".cache" / "whisper.cpp" / f"ggml-{self.model_file}.bin"
        )

        if not model_path.exists():
            raise FileNotFoundError(
                f"Whisper model not found at {model_path}. "
                f"Download it using the official script from whisper.cpp repository:\n"
                f"  git clone https://github.com/ggerganov/whisper.cpp\n"
                f"  cd whisper.cpp\n"
                f"  ./models/download-ggml-model.sh {self.model_file} ~/.cache/whisper.cpp"
            )

        # Check if whisper-server command exists
        try:
            subprocess.run(["which", "whisper-server"], capture_output=True, check=True)
        except (FileNotFoundError, subprocess.CalledProcessError) as e:
            raise FileNotFoundError(
                "whisper-server command not found. "
                "Install whisper.cpp from https://github.com/ggerganov/whisper.cpp"
            ) from e

        # Start whisper-server
        try:
            cmd = [
                "whisper-server",
                "-m",
                str(model_path),
                "-l",
                self.language,
            ]

            self._server_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

            # Wait for server to become ready
            max_wait = 10.0  # seconds
            wait_interval = 0.5  # seconds
            elapsed = 0.0

            while elapsed < max_wait:
                time.sleep(wait_interval)
                elapsed += wait_interval

                # Check if server process died
                try:
                    exit_code = self._server_process.poll()
                    if exit_code is not None:
                        try:
                            stdout, stderr = self._server_process.communicate(timeout=1.0)
                            stdout_str = stdout.decode('utf-8').strip() if stdout else ""
                            stderr_str = stderr.decode('utf-8').strip() if stderr else ""
                        except Exception as e:
                            stdout_str = "(error reading stdout)"
                            stderr_str = "(error reading stderr)"

                        self._server_process = None
                        raise RuntimeError(
                            f"whisper-server exited early (rc={exit_code}): "
                            f"stdout='{stdout_str}', stderr='{stderr_str}'"
                        )
                except AttributeError:
                    # Process might have been cleaned up by another thread
                    self._server_process = None
                    raise RuntimeError("whisper-server process was unexpectedly terminated")

                health = self.health_check()
                if health["status"] == "ok":
                    return True

            # Timeout - server didn't become ready
            return False

        except Exception as e:
            raise RuntimeError(f"Failed to start whisper-server: {str(e)}") from e

    def stop_server(self) -> None:
        """Stop the whisper.cpp server if it was started by this client"""
        if self._server_process and self._server_process.poll() is None:
            try:
                self._server_process.terminate()
                self._server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._server_process.kill()
                self._server_process.wait()
            finally:
                self._server_process = None

    def __del__(self) -> None:
        """Cleanup: stop server on destruction"""
        self.stop_server()


class AudioResource:
    """Audio-related API resources (OpenAI-compatible)"""

    def __init__(self, client: WhisperCppClient) -> None:
        self._client = client
        self._transcriptions = TranscriptionResource(client)

    @property
    def transcriptions(self) -> "TranscriptionResource":
        """Access to transcription resources"""
        return self._transcriptions


class TranscriptionResource:
    """Audio transcription API (OpenAI-compatible)"""

    def __init__(self, client: WhisperCppClient) -> None:
        self._client = client

    def create(
        self,
        file: BinaryIO,
        response_format: str = "text",
        language: Optional[str] = None,
        timeout: float = 30.0,
    ) -> str:
        """Transcribe audio file using whisper.cpp server

        The model used for transcription is determined by the whisper.cpp server
        configuration (specified with -m flag at server startup).

        Args:
            file: Audio file to transcribe (file-like object opened in binary mode)
            response_format: Response format - "text", "json", "verbose_json", "srt", "vtt"
            language: Language code (optional, whisper.cpp will auto-detect if not provided)
            timeout: Request timeout in seconds

        Returns:
            str: Transcribed text (for response_format="text")

        Raises:
            requests.exceptions.RequestException: On HTTP errors
            ValueError: If response is empty or invalid

        Example:
            >>> with open("audio.wav", "rb") as f:
            ...     text = client.audio.transcriptions.create(file=f)
        """
        # Prepare multipart form data
        file.seek(0)  # Ensure we're at the start of the file
        files = {"file": ("audio.wav", file, "audio/wav")}

        data: dict[str, str] = {
            "response_format": response_format,
        }

        if language:
            data["language"] = language

        # Make request to whisper.cpp server
        try:
            response = requests.post(
                f"{self._client.base_url}/inference",
                files=files,
                data=data,
                timeout=timeout,
            )
            response.raise_for_status()

            # Parse response based on format
            if response_format == "text":
                text = response.text.strip()
                if not text:
                    raise ValueError("Transcription returned empty result")
                return text
            elif response_format in ("json", "verbose_json"):
                result: dict[str, Any] = response.json()
                text = str(result.get("text", "")).strip()
                if not text:
                    raise ValueError("Transcription returned empty result")
                return text
            else:
                # For other formats (srt, vtt), return as-is
                return str(response.text)

        except requests.exceptions.HTTPError as e:
            # Enhance error messages
            if e.response is not None and e.response.status_code == 404:
                raise requests.exceptions.HTTPError(
                    "Transcription endpoint not found. "
                    "Check that whisper.cpp server is running and accessible."
                ) from e
            elif e.response is not None and e.response.status_code == 401:
                raise requests.exceptions.HTTPError(
                    "Authentication failed (should not happen with whisper.cpp)"
                ) from e
            else:
                raise
