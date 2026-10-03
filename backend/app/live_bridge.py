"""Gemini Live session bridge: client WebSocket ↔ Gemini Live PCM."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types
from starlette.websockets import WebSocketState

from .config import Settings
from .prompts import build_system_instruction, mode_switch_hint
from .protocol import (
    AlertTrigger,
    SessionEnd,
    SessionInit,
    SessionSetMode,
    SessionState,
    SessionUpdateLocation,
    audio_interrupted_payload,
    session_ended_payload,
    session_error_payload,
    session_ready_payload,
    sms_payload,
    transcript_payload,
)

logger = logging.getLogger("safeher.live")


class LiveBridge:
    """Owns one mobile/desktop client WebSocket and one Gemini Live session."""

    def __init__(self, websocket: WebSocket, settings: Settings) -> None:
        self.ws = websocket
        self.settings = settings
        self.state: SessionState | None = None
        self._send_lock = asyncio.Lock()
        self._stop = asyncio.Event()
        self._gemini: Any | None = None

    async def run(self) -> None:
        await self.ws.accept()
        try:
            init = await self._await_session_init()
            self.state = SessionState(
                session_id=f"sh_{uuid.uuid4().hex[:16]}",
                mode=init.mode,
                location=init.location,
                locale=init.locale,
                contact_name=init.contact_name,
            )
            await self._run_gemini_session(init)
        except WebSocketDisconnect:
            logger.info("client disconnected")
        except Exception as exc:  # noqa: BLE001 — surface to client then close
            logger.exception("live bridge failed")
            await self._safe_send_json(
                session_error_payload("bridge_failed", str(exc))
            )
        finally:
            self._stop.set()
            await self._safe_close()

    async def _await_session_init(self) -> SessionInit:
        while True:
            message = await self.ws.receive()
            if message["type"] == "websocket.disconnect":
                raise WebSocketDisconnect()
            text = message.get("text")
            if not text:
                # Ignore early binary until session is ready.
                continue
            payload = json.loads(text)
            if payload.get("type") != "session.init":
                await self._safe_send_json(
                    session_error_payload(
                        "expected_session_init",
                        "First text message must be session.init",
                    )
                )
                continue
            return SessionInit.model_validate(payload)

    async def _run_gemini_session(self, init: SessionInit) -> None:
        assert self.state is not None
        logger.info(
            "opening gemini live session_id=%s mode=%s model=%s",
            self.state.session_id,
            self.state.mode,
            self.settings.gemini_model,
        )
        client = genai.Client(
            api_key=self.settings.gemini_api_key,
            http_options={"api_version": "v1alpha"},
        )
        system_instruction = build_system_instruction(
            init.mode,
            contact_name=init.contact_name,
            locale=init.locale,
            location=init.location.model_dump(),
        )
        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            system_instruction=system_instruction,
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
        )

        try:
            async with client.aio.live.connect(
                model=self.settings.gemini_model,
                config=config,
            ) as session:
                self._gemini = session
                logger.info("gemini connected session_id=%s", self.state.session_id)
                await self._safe_send_json(
                    session_ready_payload(
                        self.state.session_id,
                        input_rate=self.settings.audio_input_sample_rate,
                        output_rate=self.settings.audio_output_sample_rate,
                    )
                )
                logger.info("session.ready sent session_id=%s", self.state.session_id)
                client_task = asyncio.create_task(
                    self._pump_client_to_gemini(session),
                    name="client_to_gemini",
                )
                gemini_task = asyncio.create_task(
                    self._pump_gemini_to_client(session),
                    name="gemini_to_client",
                )
                # After pumps are live, nudge Gemini to greet (phone pickup).
                await session.send_realtime_input(
                    text=(
                        "Połączenie właśnie odebrane. "
                        "Przywitaj się krótko i naturalnie jak bliska osoba."
                    )
                )
                done, pending = await asyncio.wait(
                    {client_task, gemini_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                self._stop.set()
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)
                for task in done:
                    if task.cancelled():
                        continue
                    exc = task.exception()
                    if exc and not isinstance(exc, WebSocketDisconnect):
                        raise exc
        except WebSocketDisconnect:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("gemini session error")
            await self._safe_send_json(
                session_error_payload("gemini_unavailable", str(exc))
            )

    async def _pump_client_to_gemini(self, session: Any) -> None:
        mime = f"audio/pcm;rate={self.settings.audio_input_sample_rate}"
        try:
            while not self._stop.is_set():
                message = await self.ws.receive()
                if message["type"] == "websocket.disconnect":
                    self._stop.set()
                    break

                data = message.get("bytes")
                if data:
                    await session.send_realtime_input(
                        audio=types.Blob(data=data, mime_type=mime)
                    )
                    continue

                text = message.get("text")
                if text:
                    should_end = await self._handle_control(session, text)
                    if should_end:
                        self._stop.set()
                        break
        except WebSocketDisconnect:
            self._stop.set()
        except Exception:
            self._stop.set()
            raise

    async def _pump_gemini_to_client(self, session: Any) -> None:
        try:
            while not self._stop.is_set():
                turn = session.receive()
                async for response in turn:
                    if self._stop.is_set():
                        return

                    server_content = response.server_content
                    if server_content and server_content.interrupted:
                        await self._safe_send_json(audio_interrupted_payload())

                    audio = response.data
                    if audio:
                        await self._safe_send_bytes(audio)

                    if server_content:
                        await self._forward_transcriptions(server_content)

                # End of model turn — loop for next VAD-triggered turn.
        except WebSocketDisconnect:
            self._stop.set()
        except Exception:
            if not self._stop.is_set():
                self._stop.set()
                raise

    async def _forward_transcriptions(self, server_content: Any) -> None:
        assert self.state is not None
        inp = getattr(server_content, "input_transcription", None)
        if inp and getattr(inp, "text", None):
            text = inp.text.strip()
            if text:
                self.state.last_summary = text
                await self._safe_send_json(transcript_payload("user", text))

        out = getattr(server_content, "output_transcription", None)
        if out and getattr(out, "text", None):
            text = out.text.strip()
            if text:
                await self._safe_send_json(transcript_payload("assistant", text))

    async def _handle_control(self, session: Any, raw: str) -> bool:
        """Return True when the live session should end."""
        assert self.state is not None
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            await self._safe_send_json(
                session_error_payload("invalid_json", "Control message is not JSON")
            )
            return False

        msg_type = payload.get("type")
        if msg_type == "session.update_location":
            update = SessionUpdateLocation.model_validate(payload)
            self.state.location = update.location
            return False

        if msg_type == "session.set_mode":
            set_mode = SessionSetMode.model_validate(payload)
            self.state.mode = set_mode.mode
            await session.send_realtime_input(text=mode_switch_hint(set_mode.mode))
            return False

        if msg_type == "alert.trigger":
            alert = AlertTrigger.model_validate(payload)
            await self._safe_send_json(
                sms_payload(
                    level=alert.level,
                    mode=self.state.mode,
                    location=self.state.location,
                    summary=self.state.last_summary,
                )
            )
            return False

        if msg_type == "session.end":
            end = SessionEnd.model_validate(payload)
            await self._safe_send_json(session_ended_payload(end.reason))
            return True

        await self._safe_send_json(
            session_error_payload("unknown_message", f"Unsupported type: {msg_type}")
        )
        return False

    async def _safe_send_json(self, payload: dict[str, Any]) -> None:
        if self.ws.client_state != WebSocketState.CONNECTED:
            return
        async with self._send_lock:
            try:
                await self.ws.send_json(payload)
            except Exception:  # noqa: BLE001
                logger.debug("send_json failed", exc_info=True)

    async def _safe_send_bytes(self, data: bytes) -> None:
        if self.ws.client_state != WebSocketState.CONNECTED:
            return
        async with self._send_lock:
            try:
                await self.ws.send_bytes(data)
            except Exception:  # noqa: BLE001
                logger.debug("send_bytes failed", exc_info=True)

    async def _safe_close(self) -> None:
        if self.ws.client_state == WebSocketState.CONNECTED:
            try:
                await self.ws.close()
            except Exception:  # noqa: BLE001
                pass
