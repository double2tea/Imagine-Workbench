#!/usr/bin/env python3

from __future__ import annotations

import base64
import json
import tempfile
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from threading import Thread
from typing import Any

from imagine_resolve_bridge import BridgeConfig, BridgeRoutes, ImagineResolveBridge


class MockServer:
    def __init__(self) -> None:
        self.requests: list[dict[str, Any]] = []
        self.server = HTTPServer(("127.0.0.1", 0), self._handler())
        self.thread = Thread(target=self.server.serve_forever, daemon=True)

    @property
    def url(self) -> str:
        host, port = self.server.server_address
        return f"http://{host}:{port}"

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()

    def _handler(self) -> type[BaseHTTPRequestHandler]:
        parent = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                parent.requests.append({"method": "GET", "path": self.path})
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"name": "imagine-resolve-bridge"}).encode("utf-8"))

            def do_POST(self) -> None:
                length = int(self.headers.get("Content-Length", "0"))
                body = self.rfile.read(length)
                parent.requests.append({
                    "method": "POST",
                    "path": self.path,
                    "content_type": self.headers.get("Content-Type", ""),
                    "authorization": self.headers.get("Authorization", ""),
                    "provider_key": self.headers.get("x-ai-api-key", ""),
                    "body": body,
                })
                if self.path == "/v1/images/generations":
                    self._json({"data": [{"b64_json": base64.b64encode(b"image").decode("ascii")}]})
                    return
                if self.path == "/v1/audio/speech":
                    self.send_response(200)
                    self.send_header("Content-Type", "audio/wav")
                    self.end_headers()
                    self.wfile.write(b"audio")
                    return
                if self.path == "/v1/audio/transcriptions":
                    self._json({"text": "hello from transcript"})
                    return
                if self.path == "/api/media/generate-video":
                    self._json({"operationName": "mock:video:task_1", "source": "mock"})
                    return
                if self.path == "/api/media/status":
                    self._json({"done": True, "mediaType": "video", "progress": 100, "status": "completed"})
                    return
                if self.path == "/api/media/video-download":
                    self.send_response(200)
                    self.send_header("Content-Type", "video/mp4")
                    self.end_headers()
                    self.wfile.write(b"video")
                    return
                self.send_response(404)
                self.end_headers()

            def log_message(self, format: str, *args: Any) -> None:
                return

            def _json(self, payload: dict[str, Any]) -> None:
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(payload).encode("utf-8"))

        return Handler


class ImagineResolveBridgeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = MockServer()
        self.server.start()
        self.tmp = tempfile.TemporaryDirectory()
        self.bridge = ImagineResolveBridge(BridgeConfig(
            base_url=self.server.url,
            output_dir=Path(self.tmp.name),
            routes=BridgeRoutes(),
            gateway_api_key="gateway",
            provider_api_key="provider",
        ))

    def tearDown(self) -> None:
        self.tmp.cleanup()
        self.server.stop()

    def test_generate_image_saves_openai_b64_response(self) -> None:
        path = self.bridge.generate_image("prompt", "mock:image", "image_result")

        self.assertEqual(path.read_bytes(), b"image")
        request = self.server.requests[-1]
        self.assertEqual(request["path"], "/v1/images/generations")
        self.assertEqual(request["authorization"], "Bearer gateway")
        self.assertEqual(request["provider_key"], "provider")
        body = json.loads(request["body"].decode("utf-8"))
        self.assertEqual(body["response_format"], "b64_json")

    def test_tts_saves_binary_audio(self) -> None:
        path = self.bridge.tts("hello", "mimo:mimo-v2.5-tts", "voice", "Chloe", None)

        self.assertEqual(path.suffix, ".wav")
        self.assertEqual(path.read_bytes(), b"audio")

    def test_transcribe_writes_txt_and_srt(self) -> None:
        audio = Path(self.tmp.name) / "input.wav"
        audio.write_bytes(b"audio")

        txt, srt = self.bridge.transcribe(audio, "mimo:mimo-v2.5-asr", "subtitle", "auto")

        self.assertEqual(txt.read_text(encoding="utf-8"), "hello from transcript")
        self.assertIn("00:00:00,000 --> 00:00:05,000", srt.read_text(encoding="utf-8"))
        self.assertIn("multipart/form-data", self.server.requests[-1]["content_type"])

    def test_generate_video_polls_and_downloads_result(self) -> None:
        path = self.bridge.generate_video("shot", "mock:video", "video_result", [], 10)

        self.assertEqual(path.suffix, ".mp4")
        self.assertEqual(path.read_bytes(), b"video")
        self.assertEqual([item["path"] for item in self.server.requests[-3:]], [
            "/api/media/generate-video",
            "/api/media/status",
            "/api/media/video-download",
        ])


if __name__ == "__main__":
    unittest.main()
