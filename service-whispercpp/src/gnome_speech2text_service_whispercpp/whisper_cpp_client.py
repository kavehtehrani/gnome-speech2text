#!/usr/bin/env python3
"""
Whisper.cpp Client - A client library for whisper.cpp server

This module provides an OpenAI-compatible API for interacting with whisper.cpp servers.
It handles server health checking, auto-starting, and audio transcription.
"""

import re
import subprocess
import time
from pathlib import Path
from typing import Any, BinaryIO, Optional, Union
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
        vad_model: VAD (Voice Activity Detection) model name for auto-start (default: "auto").
            When "auto" (default), automatically discovers VAD models in ~/.cache/whisper.cpp/
            matching pattern: ggml-silero-v*.bin (e.g., silero-v5.1.2, silero-v1.2.3-alpha)
            When specified explicitly, uses that model name.
            When None, disables VAD.
            Path format: ~/.cache/whisper.cpp/ggml-{vad_model}.bin

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
        vad_model: Optional[str] = "auto",
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model_file = model_file
        self.language = language
        self.vad_model = self._resolve_vad_model(vad_model)
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

    def _discover_vad_model(self) -> Optional[str]:
        """Discover available VAD models in ~/.cache/whisper.cpp/

        Searches for VAD model files matching the pattern:
        ggml-silero-v*.bin (e.g., ggml-silero-v5.1.2.bin, ggml-silero-v1.2.3-alpha.bin)

        Returns:
            str: The model name (without ggml- prefix and .bin suffix) if found,
                 None if no VAD model is found

        Example:
            If ggml-silero-v5.1.2.bin exists, returns "silero-v5.1.2"
        """
        cache_dir = Path.home() / ".cache" / "whisper.cpp"
        if not cache_dir.exists():
            return None

        # Pattern to match: ggml-silero-v{version}.bin
        # Matches versions like: v5.1.2, v1.2, v1.2.3-alpha, v2.0.1-beta.2
        pattern = re.compile(r"^ggml-(silero-v[\d.]+([-.][\w.]+)?).bin$")

        vad_models = []
        for file_path in cache_dir.glob("ggml-silero-v*.bin"):
            match = pattern.match(file_path.name)
            if match:
                model_name = match.group(1)  # Extract the part between ggml- and .bin
                vad_models.append((model_name, file_path))

        if not vad_models:
            return None

        # If multiple models found, use the one with the highest version number
        # Sort by filename to get the latest version
        vad_models.sort(key=lambda x: x[0], reverse=True)
        selected_model = vad_models[0][0]

        return selected_model

    def _resolve_vad_model(self, vad_model: Optional[str]) -> Optional[str]:
        """Resolve VAD model parameter to actual model name

        Args:
            vad_model: VAD model specification:
                - "auto": Auto-discover VAD model in cache directory
                - None or empty string: Disable VAD
                - Specific name: Use that model name

        Returns:
            Optional[str]: Resolved model name, or None if VAD should be disabled
        """
        if vad_model == "auto":
            return self._discover_vad_model()
        elif vad_model and vad_model.strip():
            return vad_model.strip()
        else:
            return None

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

            # Add VAD flags if VAD model is specified
            if self.vad_model:
                vad_model_path = (
                    Path.home()
                    / ".cache"
                    / "whisper.cpp"
                    / f"ggml-{self.vad_model}.bin"
                )

                if not vad_model_path.exists():
                    raise FileNotFoundError(
                        f"VAD model not found at {vad_model_path}. "
                        f"Download it using the official script from whisper.cpp repository."
                    )

                cmd.extend(["--vad", "-vm", str(vad_model_path)])

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
                            stdout, stderr = self._server_process.communicate(
                                timeout=1.0
                            )
                            stdout_str = (
                                stdout.decode("utf-8").strip() if stdout else ""
                            )
                            stderr_str = (
                                stderr.decode("utf-8").strip() if stderr else ""
                            )
                        except Exception:
                            stdout_str = "(error reading stdout)"
                            stderr_str = "(error reading stderr)"

                        self._server_process = None
                        raise RuntimeError(
                            f"whisper-server exited early (rc={exit_code}): "
                            f"stdout='{stdout_str}', stderr='{stderr_str}'"
                        )
                except AttributeError as err:
                    # Process might have been cleaned up by another thread
                    self._server_process = None
                    raise RuntimeError(
                        "whisper-server process was unexpectedly terminated"
                    ) from err

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
    ) -> Union[str, dict[str, Any]]:
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

            # Try to parse as JSON first (all errors are returned as JSON)
            try:
                result: dict[str, Any] = response.json()

                # Check if server returned an error
                if "error" in result:
                    error_msg = result["error"]
                    raise ValueError(f"Whisper server returned error: {error_msg}")

                # Successfully parsed JSON - return it as-is
                # Empty text field is valid (no speech detected)
                return result

            except (ValueError, KeyError, TypeError):
                # JSON parsing failed - response is plain text (text/srt/vtt format)
                # Empty string is valid (no speech detected)
                return response.text

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
