"""Gemini Live session bridge: client WebSocket ↔ Gemini Live PCM + tools."""

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
from .overpass import get_nearby_safe_havens
from .prompts import build_system_instruction, mode_switch_hint, pickup_nudge
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


def _live_tools() -> list[types.Tool]:
    find_safe_haven = types.FunctionDeclaration(
        name="find_safe_haven",
        description=(
            "Znajdź najbliższe otwarte/oświetlone bezpieczne miejsca "
            "(stacja paliw, apteka, sklep, posterunek) względem aktualnej "
            "pozycji GPS użytkowniczki. Zwraca 0–3 punkty z dystansem i kierunkiem."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={},
        ),
    )
    update_threat_info = types.FunctionDeclaration(
        name="update_threat_info",
        description=(
            "Zapisz w tle ustalone szczegóły sytuacji do treści SMS (tryb SILENT). "
            "Wywołuj tylko z polami, które faktycznie udało się ustalić z rozmowy. "
            "W trybie LOUDSPEAKER nie używaj tego narzędzia."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "suspect_outfit": types.Schema(
                    type=types.Type.STRING,
                    description="Opis ubioru podejrzanej osoby, jeśli ustalony.",
                    nullable=True,
                ),
                "distance_or_behavior": types.Schema(
                    type=types.Type.STRING,
                    description="Dystans lub zachowanie osoby, jeśli ustalone.",
                    nullable=True,
                ),
                "landmark": types.Schema(
                    type=types.Type.STRING,
                    description="Punkt orientacyjny / landmark, jeśli ustalony.",
                    nullable=True,
                ),
            },
        ),
    )
    return [
        types.Tool(function_declarations=[find_safe_haven, update_threat_info]),
    ]


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
            tools=_live_tools(),
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
                await session.send_realtime_input(text=pickup_nudge(init.mode))
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

                    if response.tool_call:
                        await self._handle_tool_call(session, response.tool_call)
                        continue

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

    async def _handle_tool_call(self, session: Any, tool_call: Any) -> None:
        assert self.state is not None
        calls = getattr(tool_call, "function_calls", None) or []
        responses: list[types.FunctionResponse] = []
        for fc in calls:
            name = fc.name or ""
            args = dict(fc.args or {})
            logger.info(
                "tool_call session_id=%s name=%s args=%s",
                self.state.session_id,
                name,
                args,
            )
            try:
                result = await self._dispatch_tool(name, args)
            except Exception as exc:  # noqa: BLE001
                logger.exception("tool %s failed", name)
                result = {"ok": False, "error": str(exc)}
            responses.append(
                types.FunctionResponse(
                    id=fc.id,
                    name=name,
                    response=result,
                )
            )
        if responses:
            await session.send_tool_response(function_responses=responses)

    async def _dispatch_tool(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        assert self.state is not None
        if name == "find_safe_haven":
            return await self._tool_find_safe_haven()
        if name == "update_threat_info":
            return await self._tool_update_threat_info(args)
        return {"ok": False, "error": f"unknown_tool:{name}"}

    async def _tool_find_safe_haven(self) -> dict[str, Any]:
        assert self.state is not None
        loc = self.state.location
        if loc is None:
            return {"ok": True, "places": [], "note": "brak lokalizacji GPS"}
        places = await get_nearby_safe_havens(
            loc.lat,
            loc.lng,
            radius=self.settings.safe_haven_radius_m,
            overpass_url=self.settings.overpass_url,
        )
        logger.info(
            "find_safe_haven session_id=%s count=%s",
            self.state.session_id,
            len(places),
        )
        return {"ok": True, "places": places}

    async def _tool_update_threat_info(self, args: dict[str, Any]) -> dict[str, Any]:
        assert self.state is not None
        outfit = _optional_str(args.get("suspect_outfit"))
        distance = _optional_str(args.get("distance_or_behavior"))
        landmark = _optional_str(args.get("landmark"))

        if not any((outfit, distance, landmark)):
            return {"ok": False, "error": "no_fields"}

        if self.state.mode == "LOUDSPEAKER":
            # Spec: loudspeaker does not collect SMS details.
            return {
                "ok": False,
                "error": "loudspeaker_no_threat_collection",
            }

        self.state.threat = self.state.threat.merge(
            suspect_outfit=outfit,
            distance_or_behavior=distance,
            landmark=landmark,
        )
        payload = sms_payload(
            level=1,
            mode=self.state.mode,
            location=self.state.location,
            summary=self.state.last_summary,
            threat=self.state.threat,
        )
        self.state.last_sms_body = payload["body"]
        await self._safe_send_json(payload)
        logger.info(
            "update_threat_info session_id=%s threat=%s",
            self.state.session_id,
            self.state.threat.model_dump(),
        )
        return {
            "ok": True,
            "saved": self.state.threat.model_dump(exclude_none=True),
        }

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
            sms = sms_payload(
                level=alert.level,
                mode=self.state.mode,
                location=self.state.location,
                summary=self.state.last_summary,
                threat=self.state.threat,
            )
            self.state.last_sms_body = sms["body"]
            await self._safe_send_json(sms)
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


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
