"""Lightweight threat-detail extraction from user speech transcripts (no Live tools)."""

from __future__ import annotations

import re

from .protocol import ThreatInfo

# Clothing / appearance cues (incl. Polish inflections: kurtce, bluzie…)
_OUTFIT_RE = re.compile(
    r"(?:"
    r"(?:w\s+)?(?:czarn|biał|szar|niebiesk|czerwon|zielon|brązow|beżow|ciem)\w*"
    r"\s+(?:kurtc?\w*|bluz\w*|płaszcz\w*|plaszcz\w*|koszul\w*|spodn\w*|dres\w*|czapc?\w*|kaptur\w*|but\w*|sneakers\w*)"
    r"(?:\s+z\s+kaptur\w*)?"
    r"|"
    r"(?:kurtc?\w*|bluz\w*|płaszcz\w*|plaszcz\w*)(?:\s+z\s+kaptur\w*)"
    r"|"
    r"kaptur\w*"
    r")",
    re.IGNORECASE,
)

# Distance / behavior
_DISTANCE_RE = re.compile(
    r"(?:"
    r"(?:kilka|par[eę]|ze?\s*\d+|metr\w*|krok\w*)"
    r".{0,24}?"
    r"(?:za\s+mn[aą]|z\s+tyłu|z\s+tylu|za\s+plecami)"
    r"|"
    r"(?:idzie|szedł|szedl|chodzi|stoi|patrzy|śledzi|sledzi)\w*"
    r".{0,20}?"
    r"(?:za\s+mn[aą]|z\s+tyłu|z\s+tylu|blisko|tuż|tuz)"
    r"|"
    r"(?:blisko|tuż\s+za|tuz\s+za|zaraz\s+za)\s+mn[aą]"
    r"|"
    r"(?:pusto|nikogo|nikt|sam[ae])"
    r")",
    re.IGNORECASE,
)

# Landmark / place
_LANDMARK_RE = re.compile(
    r"(?:"
    r"(?:przy|koło|kolo|obok|na\s+rogu|mijam|mije|widzę|widze)\s+"
    r"(?:ul\.?\s*)?[\wąćęłńóśźżĄĆĘŁŃÓŚŹŻ\"«»][\wąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s\-]{1,40}"
    r"|"
    r"(?:żabk|zabk|orlen|bp|shell|carrefour|biedronk|lidl|apteka|stacj)\w*"
    r".{0,30}?"
    r")",
    re.IGNORECASE,
)

_MAX_NOTES = 8
_MAX_FIELD_LEN = 120


def _clip(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip(" .,;:-")
    if len(text) > _MAX_FIELD_LEN:
        return text[: _MAX_FIELD_LEN - 1].rstrip() + "…"
    return text


def extract_threat_bits(text: str) -> ThreatInfo:
    """Best-effort parse of one user utterance into ThreatInfo fields."""
    raw = (text or "").strip()
    if not raw:
        return ThreatInfo()

    outfit = None
    m = _OUTFIT_RE.search(raw)
    if m:
        outfit = _clip(m.group(0))

    distance = None
    m = _DISTANCE_RE.search(raw)
    if m:
        distance = _clip(m.group(0))

    landmark = None
    m = _LANDMARK_RE.search(raw)
    if m:
        landmark = _clip(m.group(0))

    return ThreatInfo(
        suspect_outfit=outfit,
        distance_or_behavior=distance,
        landmark=landmark,
    )


def merge_user_note(notes: list[str], text: str) -> list[str]:
    cleaned = _clip(text)
    if not cleaned or len(cleaned) < 3:
        return notes
    # Skip near-duplicates
    low = cleaned.lower()
    if any(low in n.lower() or n.lower() in low for n in notes[-3:]):
        return notes
    next_notes = [*notes, cleaned]
    return next_notes[-_MAX_NOTES:]


def notes_summary(notes: list[str]) -> str | None:
    if not notes:
        return None
    return " | ".join(notes[-4:])
