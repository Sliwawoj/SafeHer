"""WebSocket protocol helpers (SafeHer mobile ↔ backend)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

AgentMode = Literal["LOUDSPEAKER", "SILENT"]
AlertLevel = Literal[1, 2, 3]


class GeoLocation(BaseModel):
    lat: float
    lng: float
    accuracy_m: float | None = None


class SessionInit(BaseModel):
    type: Literal["session.init"] = "session.init"
    mode: AgentMode = "LOUDSPEAKER"
    location: GeoLocation
    locale: str = "pl-PL"
    contact_name: str | None = None
    client: dict[str, Any] | None = None


class SessionUpdateLocation(BaseModel):
    type: Literal["session.update_location"] = "session.update_location"
    location: GeoLocation


class SessionSetMode(BaseModel):
    type: Literal["session.set_mode"] = "session.set_mode"
    mode: AgentMode


class AlertTrigger(BaseModel):
    type: Literal["alert.trigger"] = "alert.trigger"
    level: AlertLevel
    reason: Literal["power_button_triple", "duress_pin_fail", "manual"] = "manual"


class SessionEnd(BaseModel):
    type: Literal["session.end"] = "session.end"
    reason: str = "user_hangup"


def session_ready_payload(
    session_id: str,
    *,
    input_rate: int,
    output_rate: int,
) -> dict[str, Any]:
    return {
        "type": "session.ready",
        "session_id": session_id,
        "audio": {
            "input_rate": input_rate,
            "output_rate": output_rate,
            "encoding": "pcm16",
        },
    }


def session_error_payload(code: str, message: str) -> dict[str, Any]:
    return {"type": "session.error", "code": code, "message": message}


def session_ended_payload(reason: str) -> dict[str, Any]:
    return {"type": "session.ended", "reason": reason}


def transcript_payload(role: str, text: str) -> dict[str, Any]:
    return {"type": "agent.transcript", "role": role, "text": text}


def audio_interrupted_payload() -> dict[str, Any]:
    return {"type": "audio.interrupted"}


def sms_payload(
    *,
    level: int,
    mode: str,
    location: GeoLocation | None,
    summary: str | None = None,
) -> dict[str, Any]:
    maps = ""
    if location is not None:
        maps = f"https://maps.google.com/?q={location.lat},{location.lng}"

    if level >= 3:
        body = (
            "UWAGA: Połączenie SafeHer zostało przerwane bez poprawnego kodu PIN. "
            f"Istnieje ryzyko ataku. Sprawdź lokalizację: {maps}"
        )
    elif level == 2:
        body = (
            "POTRZEBNA PILNA POMOC! Zadzwoń pod 112 lub natychmiast do mnie. "
            f"Moja aktualna pozycja: {maps}"
        )
    else:
        mode_pl = (
            "głośnomówiącym"
            if (mode or "").upper() == "LOUDSPEAKER"
            else "cichym"
        )
        body = (
            f"Rozmawiam w trybie {mode_pl}, aby odstraszyć osobę w pobliżu. "
            f"Śledź moją lokalizację: {maps}"
        )
        if summary:
            body = f"{body}\nPodsumowanie: {summary}"

    return {
        "type": "tool.sms_payload",
        "level": level,
        "to_label": "trusted_contact",
        "body": body,
        "meta": {"mode": mode, "summary": summary},
    }


class SessionState(BaseModel):
    session_id: str
    mode: AgentMode = "LOUDSPEAKER"
    location: GeoLocation | None = None
    locale: str = "pl-PL"
    contact_name: str | None = None
    last_summary: str | None = Field(default=None)
