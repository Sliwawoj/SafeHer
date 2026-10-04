"""WebSocket protocol helpers (SafeHer mobile ↔ backend)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

AlertLevel = Literal[1, 2, 3]


class GeoLocation(BaseModel):
    lat: float
    lng: float
    accuracy_m: float | None = None


class ThreatInfo(BaseModel):
    suspect_outfit: str | None = None
    distance_or_behavior: str | None = None
    landmark: str | None = None

    def merge(
        self,
        *,
        suspect_outfit: str | None = None,
        distance_or_behavior: str | None = None,
        landmark: str | None = None,
    ) -> ThreatInfo:
        return ThreatInfo(
            suspect_outfit=suspect_outfit or self.suspect_outfit,
            distance_or_behavior=distance_or_behavior or self.distance_or_behavior,
            landmark=landmark or self.landmark,
        )

    def as_summary_parts(self) -> list[str]:
        parts: list[str] = []
        if self.suspect_outfit:
            parts.append(f"Ubiór: {self.suspect_outfit}")
        if self.distance_or_behavior:
            parts.append(f"Zachowanie/dystans: {self.distance_or_behavior}")
        if self.landmark:
            parts.append(f"Punkt: {self.landmark}")
        return parts

    def has_any(self) -> bool:
        return bool(self.suspect_outfit or self.distance_or_behavior or self.landmark)


class SessionInit(BaseModel):
    type: Literal["session.init"] = "session.init"
    location: GeoLocation
    locale: str = "pl-PL"
    contact_name: str | None = None
    client: dict[str, Any] | None = None
    # Legacy field from LOUDSPEAKER/SILENT split — ignored if present.
    mode: str | None = None


class SessionUpdateLocation(BaseModel):
    type: Literal["session.update_location"] = "session.update_location"
    location: GeoLocation


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


def _live_location_link(location: GeoLocation | None) -> str:
    if location is None:
        return ""
    return f"https://maps.google.com/?q={location.lat},{location.lng}"


def sms_payload(
    *,
    level: int,
    location: GeoLocation | None,
    summary: str | None = None,
    threat: ThreatInfo | None = None,
) -> dict[str, Any]:
    maps = _live_location_link(location)
    threat = threat or ThreatInfo()
    threat_parts = threat.as_summary_parts()
    threat_meta = {
        "suspect_outfit": threat.suspect_outfit,
        "distance_or_behavior": threat.distance_or_behavior,
        "landmark": threat.landmark,
    }

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
        if threat_parts:
            body = f"{body}\n" + " | ".join(threat_parts)
    else:
        body = f"Czuję zagrożenie. Śledź moją lokalizację: {maps}"
        details: list[str] = list(threat_parts)
        if summary and summary not in details:
            details.append(summary)
        if details:
            body = f"{body}\nSzczegóły: " + " | ".join(details)

    return {
        "type": "tool.sms_payload",
        "level": level,
        "to_label": "trusted_contact",
        "body": body,
        "meta": {
            "summary": summary,
            "live_location_link": maps,
            **threat_meta,
        },
    }


class SessionState(BaseModel):
    session_id: str
    location: GeoLocation | None = None
    locale: str = "pl-PL"
    contact_name: str | None = None
    last_summary: str | None = Field(default=None)
    threat: ThreatInfo = Field(default_factory=ThreatInfo)
    user_notes: list[str] = Field(default_factory=list)
    last_sms_body: str | None = Field(default=None)
    cached_safe_havens: list[dict[str, Any]] = Field(default_factory=list)
