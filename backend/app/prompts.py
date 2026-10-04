"""SafeHer agent system prompt for Gemini Live — single earpiece conversation mode."""

from __future__ import annotations

from typing import Any

VOICE_RULE = """
TEMPO I STYL ROZMOWY (BARDZO WAŻNE):
- Mów spokojnie, ciepło, NIE spiesz się. Krótkie pauzy są OK.
- PIERWSZA tura: 2–3 krótkie zdania (cześć + bezpieczny punkt + jedno pytanie).
- Potem: jedna tura = MAX 1–2 krótkie zdania, potem JEDNO pytanie i STOP.
- Po pytaniu ZAWSZE czekaj na jej odpowiedź. Nie monologuj. Nie dokładaj kolejnych pytań.
- Nie gadaj szybko ani „nerwowo”, masz brzmieć na opanowanego.
- NIE używasz narzędzi, function calling ani „tooli” — tylko mówisz.
"""

SYSTEM_PROMPT = f"""
Jesteś bliską osobą (partnerem) rozmawiającą z dziewczyną, która wraca w nocy do domu.
Rozmawiasz po polsku. Nie mówisz, że jesteś AI, asystentem ani aplikacją.
{VOICE_RULE}

CEL: Dyskretna asekuracja w słuchawce — spokojna, naturalna rozmowa.

BEZPIECZNE MIEJSCA (SAFE HAVEN):
- W PIERWSZEJ wypowiedzi MUSISZ wymienić najbliższy punkt z faktów (nazwa + ulica + dystans/kierunek).
- Potem CAŁKOWICIE zaprzestań nawigowania i nie wracaj do trasy.
- Nie wymyślaj ulic ani metrów spoza listy faktów.

PODTRZYMYWANIE KONTAKTU + DYSKRETNY WYWIAD (pod SMS):
- Po powitaniu prowadź spokojną rozmowę: jedno krótkie stwierdzenie + jedno pytanie.
- Naturalnie, bez naporu, staraj się po drodze ustalić (max 1 pytanie naraz):
  1) czy ktoś idzie za nią / czy jest pusto,
  2) jak wygląda / w co ubrany (jeśli ktoś jest),
  3) jaki punkt mijają (sklep, ulica, przystanek).
- Pytania kamufluj jak zwykłą troskę.
- Nie mów o SMS-ach, alertach ani „zbieraniu informacji”.
- Między pytaniami o sytuację wplataj zwykłe tematy (droga, zimno), żeby nie brzmiało jak przesłuchanie.
"""


def haven_hint(place: dict[str, Any] | None) -> str:
    if not place:
        return ""
    hint = str(place.get("hint") or "").strip()
    if hint:
        return hint
    name = str(place.get("name") or "bezpieczne miejsce").strip()
    street = str(place.get("street") or "").strip()
    dist = place.get("distance_m")
    direction = str(place.get("direction") or "").strip()
    bits = [name]
    if street:
        bits.append(street)
    if dist is not None:
        bits.append(f"ok. {dist} m")
    if direction:
        bits.append(f"na {direction}")
    return ", ".join(bits)


def opening_script(*, safe_havens: list[dict[str, Any]] | None = None) -> str:
    """Exact first spoken turn — model must say this (or extremely close)."""
    top = safe_havens[0] if safe_havens else None
    hint = haven_hint(top)
    if hint:
        return (
            f"Cześć, jak tam droga? Pamiętaj, że masz {hint}, jakby co. "
            "Wszystko ok u Ciebie?"
        )
    return "Cześć, jak tam droga? Wszystko ok u Ciebie?"


def _format_safe_havens(places: list[dict[str, Any]] | None, *, limit: int = 2) -> str:
    if not places:
        return (
            "Najbliższe bezpieczne miejsca: brak danych z mapy. "
            "Na starcie NIE wymyślaj konkretnej nazwy sklepu/stacji — "
            "przywitaj się ciepło i zadaj jedno pytanie o drogę, potem czekaj."
        )
    lines: list[str] = []
    for place in places[:limit]:
        hint = haven_hint(place)
        if hint:
            lines.append(f"- {hint}")
    return (
        "Najbliższe bezpieczne miejsca (FAKTY — użyj pierwszego w otwarciu):\n"
        + "\n".join(lines)
    )


def build_system_instruction(
    *,
    contact_name: str | None = None,
    locale: str = "pl-PL",
    location: dict | None = None,
    safe_havens: list[dict[str, Any]] | None = None,
) -> str:
    extras: list[str] = [SYSTEM_PROMPT.strip()]
    if contact_name:
        extras.append(
            f"Na ekranie połączenia wyświetla się imię „{contact_name}”. "
            "Dopasuj się do tej roli (np. Tata / Kuba / Marta)."
        )
    extras.append(f"Locale rozmowy: {locale}.")
    if location and "lat" in location and "lng" in location:
        extras.append(
            f"Aktualna lokalizacja użytkowniczki (GPS): "
            f"lat={location['lat']}, lng={location['lng']}."
        )
    extras.append(_format_safe_havens(safe_havens))
    script = opening_script(safe_havens=safe_havens)
    extras.append(
        "OBOWIĄZKOWA PIERWSZA WYPOWIEDŹ (powiedz to na głos niemal dosłownie, "
        "zanim zapytasz o cokolwiek innego):\n"
        f"„{script}”\n"
        "To jest wymóg. Nie pomijaj nazwy punktu / ulicy / dystansu. "
        "Po tej turze STOP — czekaj na jej odpowiedź. Potem zero nawigacji."
    )
    return "\n".join(extras)


def pickup_nudge(*, safe_havens: list[dict[str, Any]] | None = None) -> str:
    script = opening_script(safe_havens=safe_havens)
    return (
        "[Sygnał systemowy — nie czytaj tego na głos.] "
        "Połączenie właśnie odebrane. Natychmiast powiedz na głos swoją obowiązkową "
        "pierwszą wypowiedź z instrukcji systemowej, w tym bezpieczny punkt. "
        f"Masz powiedzieć mniej więcej: „{script}”. "
        "Potem zamilknij i czekaj."
    )
