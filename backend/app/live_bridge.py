"""Gemini Live session bridge: client WebSocket ↔ Gemini Live PCM (no mid-call tools)."""

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
from .demo_script import (
    DEMO_AGENT_LINES,
    demo_line_nudge,
    demo_system_instruction,
    demo_threat_for_user_turn,
)
from .overpass import get_nearby_safe_havens
from .prompts import build_system_instruction, pickup_nudge
from .protocol import (
    AlertTrigger,
    SessionEnd,
    SessionInit,
    SessionState,
    SessionUpdateLocation,
    audio_interrupted_payload,
    session_ended_payload,
    session_error_payload,
    session_ready_payload,
    sms_payload,
    transcript_payload,
)
from .threat_extract import extract_threat_bits, merge_user_note, notes_summary

logger = logging.getLogger("safeher.live")

GEMINI_CONNECT_ATTEMPTS = 3
GEMINI_CONNECT_RETRY_DELAY_S = 0.8
SAFE_HAVEN_PROMPT_LIMIT = 2
# Cap Overpass wait so a slow map API doesn't delay the greeting.
SAFE_HAVEN_LOAD_TIMEOUT_S = 7.0

# Demo fallback when Overpass is slow/down (Kraków centre — matches mobile GPS fallback).
FALLBACK_SAFE_HAVENS: list[dict[str, Any]] = [
    {
        "name": "Żabka",
        "street": "ul. Floriańska",
        "distance_m": 350,
        "direction": "wschód",
        "hint": "Żabka przy ul. Floriańskiej, ok. 350 m na wschód",
    },
    {
        "name": "stacja Orlen",
        "street": "ul. Westerplatte",
        "distance_m": 500,
        "direction": "południe",
        "hint": "stacja Orlen przy ul. Westerplatte, ok. 500 m na południe",
    },
]
# Warm male-ish voice for partner/brother persona (native audio).
GEMINI_VOICE_NAME = "Charon"


def _live_connect_config(system_instruction: str) -> types.LiveConnectConfig:
    """Audio-only Live config. No tools — tool calls crash native-audio with 1007."""
    return types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        system_instruction=system_instruction,
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=GEMINI_VOICE_NAME,
                )
            ),
            language_code="pl-PL",
        ),
        # Wait longer for her to finish; barge-in when she starts speaking.
        realtime_input_config=types.RealtimeInputConfig(
            automatic_activity_detection=types.AutomaticActivityDetection(
                end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_LOW,
                start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_HIGH,
                silence_duration_ms=1400,
                prefix_padding_ms=300,
            ),
        ),
        # Native-audio + thinking/tool turns → CONTENT_TYPE_AUDIO 1007 mid-call.
        thinking_config=types.ThinkingConfig(thinking_budget=0),
        # User speech only — feeds SMS details without Live function-calling.
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=None,
        tools=None,
    )


class LiveBridge:
    """Owns one mobile/desktop client WebSocket and one Gemini Live session."""

    def __init__(self, websocket: WebSocket, settings: Settings) -> None:
        self.ws = websocket
        self.settings = settings
        self.state: SessionState | None = None
        self._send_lock = asyncio.Lock()
        self._stop = asyncio.Event()
        self._gemini: Any | None = None
        # Demo turn machine (film recording).
        self._demo_busy = False
        self._demo_pending_user = ""
        self._demo_debounce_task: asyncio.Task[None] | None = None
        self._demo_lock = asyncio.Lock()

    async def run(self) -> None:
        await self.ws.accept()
        try:
            init = await self._await_session_init()
            self.state = SessionState(
                session_id=f"sh_{uuid.uuid4().hex[:16]}",
                location=init.location,
                locale=init.locale,
                contact_name=init.contact_name,
                demo_mode=bool(init.demo_mode),
            )
            places: list[dict[str, Any]] = []
            if self.state.demo_mode:
                # Film demo: never inject Overpass POIs (avoids Carrefour etc.).
                logger.info(
                    "demo_mode ON session_id=%s — skipping Overpass",
                    self.state.session_id,
                )
            else:
                places = await self._load_safe_havens_fast()
            self.state.cached_safe_havens = places
            await self._run_gemini_session(init, places)
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

    async def _load_safe_havens_fast(self) -> list[dict[str, Any]]:
        assert self.state is not None
        loc = self.state.location
        if loc is None:
            return []
        try:
            places = await asyncio.wait_for(
                get_nearby_safe_havens(
                    loc.lat,
                    loc.lng,
                    radius=self.settings.safe_haven_radius_m,
                    overpass_url=self.settings.overpass_url,
                ),
                timeout=SAFE_HAVEN_LOAD_TIMEOUT_S,
            )
        except TimeoutError:
            logger.warning(
                "safe_havens timeout session_id=%s — starting without POI",
                self.state.session_id,
            )
            places = []
        except Exception:  # noqa: BLE001
            logger.warning(
                "safe_havens failed session_id=%s",
                self.state.session_id,
                exc_info=True,
            )
            places = []
        logger.info(
            "safe_havens_loaded session_id=%s count=%s",
            self.state.session_id,
            len(places),
        )
        if not places:
            logger.warning(
                "safe_havens empty session_id=%s — using demo fallback POI",
                self.state.session_id,
            )
            return list(FALLBACK_SAFE_HAVENS)
        return places

    async def _run_gemini_session(
        self,
        init: SessionInit,
        safe_havens: list[dict[str, Any]],
    ) -> None:
        assert self.state is not None
        prompt_havens = safe_havens[:SAFE_HAVEN_PROMPT_LIMIT]
        logger.info(
            "opening gemini live session_id=%s model=%s havens=%s demo=%s",
            self.state.session_id,
            self.settings.gemini_model,
            len(prompt_havens),
            self.state.demo_mode,
        )
        client = genai.Client(
            api_key=self.settings.gemini_api_key,
            http_options={"api_version": "v1alpha"},
        )
        if self.state.demo_mode:
            system_instruction = demo_system_instruction(
                contact_name=init.contact_name,
            )
        else:
            system_instruction = build_system_instruction(
                contact_name=init.contact_name,
                locale=init.locale,
                location=init.location.model_dump(),
                safe_havens=prompt_havens,
            )
        config = _live_connect_config(system_instruction)

        last_error: Exception | None = None
        for attempt in range(1, GEMINI_CONNECT_ATTEMPTS + 1):
            try:
                async with client.aio.live.connect(
                    model=self.settings.gemini_model,
                    config=config,
                ) as session:
                    await self._run_live_session(session, prompt_havens)
                return
            except TimeoutError as exc:
                last_error = exc
                logger.warning(
                    "gemini connect timeout session_id=%s attempt=%s/%s",
                    self.state.session_id,
                    attempt,
                    GEMINI_CONNECT_ATTEMPTS,
                )
                if attempt < GEMINI_CONNECT_ATTEMPTS:
                    await asyncio.sleep(GEMINI_CONNECT_RETRY_DELAY_S * attempt)
            except WebSocketDisconnect:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.exception("gemini session error")
                await self._safe_send_json(
                    session_error_payload("gemini_unavailable", str(exc))
                )
                return

        assert last_error is not None
        logger.exception("gemini connect failed after retries")
        await self._safe_send_json(
            session_error_payload(
                "gemini_unavailable",
                f"Gemini Live handshake timeout after {GEMINI_CONNECT_ATTEMPTS} attempts",
            )
        )

    async def _run_live_session(
        self,
        session: Any,
        safe_havens: list[dict[str, Any]],
    ) -> None:
        assert self.state is not None
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
        nudge = (
            demo_line_nudge(0)
            if self.state.demo_mode
            else pickup_nudge(safe_havens=safe_havens)
        )
        assert nudge is not None
        logger.info(
            "pickup_nudge session_id=%s havens=%s demo=%s nudge=%s",
            self.state.session_id,
            len(safe_havens),
            self.state.demo_mode,
            nudge[:180],
        )
        if self.state.demo_mode:
            self._demo_busy = True
            self.state.demo_next_agent_line = 1
        await self._force_agent_line(session, nudge)
        if self.state.demo_mode:
            # Allow user replies after the opening line has had time to start.
            asyncio.create_task(self._demo_release_busy_after(4.0))
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
                    should_end = await self._handle_control(text)
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

                    # Tools disabled — if API still emits a call, ignore (don't crash audio).
                    if response.tool_call:
                        logger.warning(
                            "unexpected tool_call session_id=%s — ignored",
                            self.state.session_id if self.state else "?",
                        )
                        continue

                    server_content = response.server_content
                    if server_content and server_content.interrupted:
                        await self._safe_send_json(audio_interrupted_payload())

                    audio = response.data
                    if audio:
                        await self._safe_send_bytes(audio)

                    if server_content:
                        if (
                            self.state
                            and self.state.demo_mode
                            and getattr(server_content, "turn_complete", False)
                        ):
                            self._demo_busy = False
                        await self._forward_transcriptions(server_content)

                # End of model turn — loop for next VAD-triggered turn.
        except WebSocketDisconnect:
            self._stop.set()
        except Exception:
            if not self._stop.is_set():
                self._stop.set()
                raise

    async def _forward_transcriptions(self, server_content: Any) -> None:
        """Capture user speech for SMS details (no Live tools)."""
        if server_content is None or self.state is None:
            return
        try:
            inp = getattr(server_content, "input_transcription", None)
            if inp and getattr(inp, "text", None):
                text = str(inp.text).strip()
                if text:
                    if self.state.demo_mode:
                        await self._demo_on_user_chunk(text)
                    else:
                        await self._ingest_user_transcript(text)

            out = getattr(server_content, "output_transcription", None)
            if out and getattr(out, "text", None):
                text = str(out.text).strip()
                if text:
                    await self._safe_send_json(transcript_payload("assistant", text))
        except Exception:  # noqa: BLE001 — never break the audio pump
            logger.debug("transcription forward skipped", exc_info=True)

    async def _force_agent_line(self, session: Any, nudge: str) -> None:
        try:
            await session.send_client_content(
                turns={
                    "role": "user",
                    "parts": [{"text": nudge}],
                },
                turn_complete=True,
            )
        except Exception:  # noqa: BLE001
            logger.warning(
                "send_client_content failed — falling back to realtime text",
                exc_info=True,
            )
            await session.send_realtime_input(text=nudge)

    async def _demo_release_busy_after(self, seconds: float) -> None:
        try:
            await asyncio.sleep(seconds)
        except asyncio.CancelledError:
            return
        self._demo_busy = False

    async def _demo_on_user_chunk(self, text: str) -> None:
        """Buffer streaming STT; commit one demo user-turn after silence."""
        assert self.state is not None
        pending = self._demo_pending_user
        if not pending:
            self._demo_pending_user = text
        elif text.startswith(pending) or pending in text:
            self._demo_pending_user = text if len(text) >= len(pending) else pending
        elif pending.startswith(text):
            pass
        else:
            self._demo_pending_user = f"{pending} {text}".strip()

        if self._demo_busy:
            return
        if self._demo_debounce_task and not self._demo_debounce_task.done():
            self._demo_debounce_task.cancel()
        self._demo_debounce_task = asyncio.create_task(self._demo_commit_user_turn())

    async def _demo_commit_user_turn(self) -> None:
        try:
            await asyncio.sleep(1.6)
        except asyncio.CancelledError:
            return

        async with self._demo_lock:
            if self._stop.is_set() or self.state is None or not self.state.demo_mode:
                return
            if self._demo_busy:
                return
            text = self._demo_pending_user.strip()
            self._demo_pending_user = ""
            if len(text) < 6:
                return

            self._demo_busy = True
            try:
                await self._ingest_user_transcript(text, advance_demo=False)
                next_idx = self.state.demo_next_agent_line
                if next_idx >= len(DEMO_AGENT_LINES):
                    logger.info(
                        "demo_script_done session_id=%s",
                        self.state.session_id,
                    )
                    return
                nudge = demo_line_nudge(next_idx)
                if nudge is None:
                    return
                self.state.demo_user_turns += 1
                self.state.demo_next_agent_line = next_idx + 1
                session = self._gemini
                if session is None:
                    return
                logger.info(
                    "demo_next_line session_id=%s line=%s/%s",
                    self.state.session_id,
                    next_idx + 1,
                    len(DEMO_AGENT_LINES),
                )
                await self._force_agent_line(session, nudge)
                asyncio.create_task(self._demo_release_busy_after(3.5))
            except Exception:
                self._demo_busy = False
                raise

    async def _ingest_user_transcript(
        self,
        text: str,
        *,
        advance_demo: bool = True,
    ) -> None:
        """Accumulate user lines + extract threat bits for the SMS draft."""
        assert self.state is not None
        self.state.user_notes = merge_user_note(self.state.user_notes, text)
        self.state.last_summary = notes_summary(self.state.user_notes)
        await self._safe_send_json(transcript_payload("user", text))

        bits = extract_threat_bits(text)
        turn_idx = self.state.demo_user_turns if self.state.demo_mode else -1
        if self.state.demo_mode:
            seeded = demo_threat_for_user_turn(turn_idx)
            if seeded is not None:
                bits = bits.merge(
                    suspect_outfit=seeded.suspect_outfit,
                    distance_or_behavior=seeded.distance_or_behavior,
                    landmark=seeded.landmark,
                )

        if bits.has_any():
            before = self.state.threat.model_dump()
            self.state.threat = self.state.threat.merge(
                suspect_outfit=bits.suspect_outfit,
                distance_or_behavior=bits.distance_or_behavior,
                landmark=bits.landmark,
            )
            if self.state.threat.model_dump() != before:
                payload = sms_payload(
                    location=self.state.location,
                    summary=self.state.last_summary,
                    threat=self.state.threat,
                )
                self.state.last_sms_body = payload["body"]
                await self._safe_send_json(payload)
                logger.info(
                    "threat_from_transcript session_id=%s threat=%s",
                    self.state.session_id,
                    self.state.threat.model_dump(exclude_none=True),
                )

        if self.state.demo_mode and advance_demo:
            # Legacy path unused — demo advances via _demo_commit_user_turn.
            return

    async def _handle_control(self, raw: str) -> bool:
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
            logger.info(
                "ignored legacy session.set_mode session_id=%s",
                self.state.session_id,
            )
            return False

        if msg_type == "alert.trigger":
            AlertTrigger.model_validate(payload)
            summary = self.state.last_summary or notes_summary(self.state.user_notes)
            sms = sms_payload(
                location=self.state.location,
                summary=summary,
                threat=self.state.threat,
            )
            self.state.last_sms_body = sms["body"]
            await self._safe_send_json(sms)
            logger.info(
                "alert.trigger session_id=%s threat=%s summary=%s",
                self.state.session_id,
                self.state.threat.model_dump(exclude_none=True),
                summary,
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
