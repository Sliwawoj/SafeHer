"""Overpass API — nearby safe havens (fuel, pharmacy, convenience, police)."""

from __future__ import annotations

import logging
import math
from typing import Any

import httpx

logger = logging.getLogger("safeher.overpass")

DEFAULT_OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_TIMEOUT_S = 3.0
MAX_RESULTS = 3

_CATEGORY_LABEL = {
    "fuel": "stacja paliw",
    "pharmacy": "apteka",
    "convenience": "sklep",
    "police": "posterunek policji",
}

_DIRECTION_PL = (
    "północ",
    "północny wschód",
    "wschód",
    "południowy wschód",
    "południe",
    "południowy zachód",
    "zachód",
    "północny zachód",
)

# Conversational direction phrases for the agent prompt / speech.
_DIRECTION_HINT_PL = (
    "na północ",
    "na północny wschód",
    "na wschód",
    "na południowy wschód",
    "na południe",
    "na południowy zachód",
    "na zachód",
    "na północny zachód",
)


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlmb = math.radians(lon2 - lon1)
    y = math.sin(dlmb) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dlmb)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def _direction_pl(bearing: float) -> str:
    idx = int((bearing + 22.5) // 45) % 8
    return _DIRECTION_PL[idx]


def _direction_hint_pl(bearing: float) -> str:
    idx = int((bearing + 22.5) // 45) % 8
    return _DIRECTION_HINT_PL[idx]


def _round_distance_m(dist_m: int) -> int:
    """Round to a speakable distance (50 / 100 / 150 …)."""
    if dist_m < 40:
        return max(20, dist_m)
    if dist_m < 120:
        return int(round(dist_m / 25.0) * 25)
    if dist_m < 400:
        return int(round(dist_m / 50.0) * 50)
    return int(round(dist_m / 100.0) * 100)


def _street_label(tags: dict[str, Any]) -> str | None:
    """Build a short Polish street label from OSM addr:* tags."""
    street = (
        tags.get("addr:street")
        or tags.get("street")
        or tags.get("addr:place")
        or ""
    ).strip()
    if not street:
        return None
    # Normalize common OSM forms → „ul. X”
    lower = street.lower()
    if lower.startswith(("ul.", "ul ", "al.", "al ", "pl.", "pl ")):
        street_fmt = street
    elif lower.startswith("ulica "):
        street_fmt = "ul. " + street[6:].strip()
    elif lower.startswith("aleja ") or lower.startswith("aleje "):
        street_fmt = "al. " + street.split(" ", 1)[1].strip()
    else:
        street_fmt = f"ul. {street}"
    number = (tags.get("addr:housenumber") or "").strip()
    if number:
        return f"{street_fmt} {number}"
    return street_fmt


def _build_hint(
    *,
    name: str,
    category: str,
    street: str | None,
    dist_m: int,
    direction_hint: str,
) -> str:
    """Human-readable fact for the agent, e.g. 'Żabka, ul. Floriańska — ok. 400 m na wschód'."""
    cat = _CATEGORY_LABEL.get(category, "miejsce")
    place = name if name else cat
    rounded = _round_distance_m(dist_m)
    where = f", {street}" if street else ""
    return f"{place}{where} — ok. {rounded} m {direction_hint}"


def _build_query(lat: float, lon: float, radius: int) -> str:
    # nodes + ways (out center) for common safe-haven tags
    filters = [
        '["amenity"="fuel"]',
        '["amenity"="pharmacy"]',
        '["shop"="convenience"]',
        '["amenity"="police"]',
    ]
    parts: list[str] = []
    for f in filters:
        parts.append(f"  node{f}(around:{radius},{lat},{lon});")
        parts.append(f"  way{f}(around:{radius},{lat},{lon});")
    body = "\n".join(parts)
    return f"[out:json][timeout:3];\n(\n{body}\n);\nout center tags;"


def _element_coords(el: dict[str, Any]) -> tuple[float, float] | None:
    if "lat" in el and "lon" in el:
        return float(el["lat"]), float(el["lon"])
    center = el.get("center") or {}
    if "lat" in center and "lon" in center:
        return float(center["lat"]), float(center["lon"])
    return None


def _classify(tags: dict[str, Any]) -> str:
    amenity = (tags.get("amenity") or "").lower()
    shop = (tags.get("shop") or "").lower()
    if amenity == "fuel":
        return "fuel"
    if amenity == "pharmacy":
        return "pharmacy"
    if amenity == "police":
        return "police"
    if shop == "convenience":
        return "convenience"
    return "place"


def _display_name(tags: dict[str, Any], category: str) -> str:
    name = (tags.get("name") or tags.get("brand") or tags.get("operator") or "").strip()
    if name:
        return name
    return _CATEGORY_LABEL.get(category, "bezpieczne miejsce")


def _parse_elements(
    elements: list[dict[str, Any]],
    *,
    lat: float,
    lon: float,
) -> list[dict[str, Any]]:
    seen: set[tuple[str, int]] = set()
    scored: list[tuple[float, dict[str, Any]]] = []

    for el in elements:
        coords = _element_coords(el)
        if coords is None:
            continue
        plat, plon = coords
        tags = el.get("tags") or {}
        category = _classify(tags)
        name = _display_name(tags, category)
        street = _street_label(tags)
        dist = _haversine_m(lat, lon, plat, plon)
        bearing = _bearing_deg(lat, lon, plat, plon)
        direction = _direction_pl(bearing)
        direction_hint = _direction_hint_pl(bearing)
        dist_m = int(round(dist))
        key = (name.lower(), dist_m // 25)
        if key in seen:
            continue
        seen.add(key)
        scored.append(
            (
                dist,
                {
                    "name": name,
                    "category": category,
                    "street": street,
                    "lat": plat,
                    "lng": plon,
                    "distance_m": dist_m,
                    "direction": direction,
                    "hint": _build_hint(
                        name=name,
                        category=category,
                        street=street,
                        dist_m=dist_m,
                        direction_hint=direction_hint,
                    ),
                },
            )
        )

    scored.sort(key=lambda x: x[0])
    return [item for _, item in scored[:MAX_RESULTS]]


async def get_nearby_safe_havens(
    lat: float,
    lon: float,
    radius: int = 600,
    *,
    overpass_url: str = DEFAULT_OVERPASS_URL,
) -> list[dict[str, Any]]:
    """Query Overpass for nearby safe havens. Returns [] on timeout/error."""
    query = _build_query(lat, lon, radius)
    headers = {
        "User-Agent": "SafeHer/0.1 (hackathon; ImpactHer)",
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=OVERPASS_TIMEOUT_S) as client:
            resp = await client.post(
                overpass_url,
                data={"data": query},
                headers=headers,
            )
            resp.raise_for_status()
            payload = resp.json()
    except Exception:  # noqa: BLE001 — network / Overpass flakiness
        logger.warning(
            "overpass query failed lat=%.5f lon=%.5f radius=%s",
            lat,
            lon,
            radius,
            exc_info=True,
        )
        return []

    elements = payload.get("elements") or []
    if not isinstance(elements, list):
        return []
    return _parse_elements(elements, lat=lat, lon=lon)
