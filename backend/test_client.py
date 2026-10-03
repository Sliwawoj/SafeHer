"""
SafeHer Stage-1 desktop test client.

Streams raw PCM16 from the PC microphone to the FastAPI /ws/live bridge
and plays Gemini native-audio responses in real time (no files).

IMPORTANT: use headphones — no echo cancellation on the default devices.

Usage (from backend/):
  .\\venv\\Scripts\\Activate.ps1
  python test_client.py
  python test_client.py --mode SILENT --url ws://127.0.0.1:8000/ws/live
"""

from __future__ import annotations

import argparse
import asyncio
import json
import signal
import sys

import numpy as np
import sounddevice as sd
import websockets
from websockets.exceptions import ConnectionClosed

INPUT_RATE = 16_000
OUTPUT_RATE = 24_000
CHANNELS = 1
# ~40 ms @ 16 kHz mono int16
MIC_BLOCK = 640


class LiveTestClient:
    def __init__(self, url: str, mode: str, contact_name: str) -> None:
        self.url = url
        self.mode = mode.upper()
        self.contact_name = contact_name
        self.mic_queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=32)
        self.play_queue: asyncio.Queue[bytes | None] = asyncio.Queue()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._stop = asyncio.Event()

    def _on_mic(self, indata, frames, time_info, status) -> None:  # noqa: ANN001
        if status:
            print(f"[mic] {status}", file=sys.stderr)
        pcm = np.asarray(indata, dtype=np.float32).reshape(-1)
        pcm16 = np.clip(pcm * 32767.0, -32768, 32767).astype(np.int16).tobytes()
        if self._loop is None:
            return
        try:
            self._loop.call_soon_threadsafe(self._enqueue_mic, pcm16)
        except RuntimeError:
            pass

    def _enqueue_mic(self, pcm16: bytes) -> None:
        try:
            self.mic_queue.put_nowait(pcm16)
        except asyncio.QueueFull:
            try:
                _ = self.mic_queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            try:
                self.mic_queue.put_nowait(pcm16)
            except asyncio.QueueFull:
                pass

    def _on_speaker(self, outdata, frames, time_info, status) -> None:  # noqa: ANN001
        if status:
            print(f"[spk] {status}", file=sys.stderr)
        needed = frames * CHANNELS
        buf = np.zeros(needed, dtype=np.int16)
        filled = 0
        while filled < needed:
            try:
                chunk = self.play_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            if chunk is None:
                # Flush signal — drop remaining buffered audio.
                while True:
                    try:
                        self.play_queue.get_nowait()
                    except asyncio.QueueEmpty:
                        break
                break
            samples = np.frombuffer(chunk, dtype=np.int16)
            take = min(needed - filled, samples.size)
            buf[filled : filled + take] = samples[:take]
            filled += take
            if take < samples.size:
                leftover = samples[take:].tobytes()
                try:
                    self.play_queue.put_nowait(leftover)
                except asyncio.QueueFull:
                    pass
                break
        outdata[:] = buf.reshape(-1, CHANNELS).astype(np.float32) / 32768.0

    async def run(self) -> None:
        self._loop = asyncio.get_running_loop()
        print(f"Connecting to {self.url} …")
        async with websockets.connect(
            self.url,
            max_size=8 * 1024 * 1024,
            ping_interval=20,
        ) as ws:
            init = {
                "type": "session.init",
                "mode": self.mode,
                "location": {"lat": 52.2297, "lng": 21.0122, "accuracy_m": 10},
                "locale": "pl-PL",
                "contact_name": self.contact_name,
                "client": {"platform": "desktop-test", "app_version": "0.1.0"},
            }
            await ws.send(json.dumps(init))
            print(f"Sent session.init (mode={self.mode}). Waiting for session.ready…")

            ready = False
            while not ready:
                raw = await ws.recv()
                if isinstance(raw, bytes):
                    continue
                msg = json.loads(raw)
                print("[server]", msg)
                if msg.get("type") == "session.ready":
                    ready = True
                elif msg.get("type") == "session.error":
                    raise RuntimeError(msg.get("message", "session error"))

            print("Ready. Speak into the mic (headphones recommended). Ctrl+C to end.")

            with (
                sd.InputStream(
                    samplerate=INPUT_RATE,
                    channels=CHANNELS,
                    dtype="float32",
                    blocksize=MIC_BLOCK,
                    callback=self._on_mic,
                ),
                sd.OutputStream(
                    samplerate=OUTPUT_RATE,
                    channels=CHANNELS,
                    dtype="float32",
                    blocksize=0,
                    callback=self._on_speaker,
                ),
            ):
                sender = asyncio.create_task(self._send_mic(ws))
                receiver = asyncio.create_task(self._recv_server(ws))
                stopper = asyncio.create_task(self._stop.wait())
                done, pending = await asyncio.wait(
                    {sender, receiver, stopper},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                self._stop.set()
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)

                if not ws.closed:
                    await ws.send(
                        json.dumps({"type": "session.end", "reason": "user_hangup"})
                    )
                    try:
                        final = await asyncio.wait_for(ws.recv(), timeout=2)
                        if isinstance(final, str):
                            print("[server]", final)
                    except Exception:  # noqa: BLE001
                        pass

        print("Session closed.")

    async def _send_mic(self, ws) -> None:  # noqa: ANN001
        while not self._stop.is_set():
            chunk = await self.mic_queue.get()
            try:
                await ws.send(chunk)
            except ConnectionClosed:
                self._stop.set()
                return

    async def _recv_server(self, ws) -> None:  # noqa: ANN001
        try:
            async for message in ws:
                if isinstance(message, bytes):
                    await self.play_queue.put(message)
                    continue
                msg = json.loads(message)
                mtype = msg.get("type")
                if mtype == "audio.interrupted":
                    await self.play_queue.put(None)
                    print("\n[audio interrupted — playback flushed]")
                elif mtype == "agent.transcript":
                    print(f"\n[{msg.get('role')}] {msg.get('text')}")
                elif mtype == "tool.sms_payload":
                    print("\n[SMS payload]", msg.get("body"))
                elif mtype == "session.ended":
                    print("\n[session.ended]", msg.get("reason"))
                    self._stop.set()
                    return
                elif mtype == "session.error":
                    print("\n[session.error]", msg)
                    self._stop.set()
                    return
                else:
                    print("\n[server]", msg)
        except ConnectionClosed:
            self._stop.set()


async def _amain(args: argparse.Namespace) -> None:
    client = LiveTestClient(args.url, args.mode, args.contact)
    loop = asyncio.get_running_loop()

    def _request_stop() -> None:
        print("\nStopping…")
        client._stop.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _request_stop)
        except NotImplementedError:
            # Windows: signal handlers in asyncio are limited.
            signal.signal(sig, lambda *_: _request_stop())

    await client.run()


def main() -> None:
    parser = argparse.ArgumentParser(description="SafeHer Live audio test client")
    parser.add_argument(
        "--url",
        default="ws://127.0.0.1:8000/ws/live",
        help="Backend WebSocket URL",
    )
    parser.add_argument(
        "--mode",
        default="LOUDSPEAKER",
        choices=["LOUDSPEAKER", "SILENT"],
        help="Agent mode",
    )
    parser.add_argument("--contact", default="Tata", help="Caller display name")
    args = parser.parse_args()
    try:
        asyncio.run(_amain(args))
    except KeyboardInterrupt:
        print("\nInterrupted.")


if __name__ == "__main__":
    main()
