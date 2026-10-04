"""Scripted presentation dialogue for SafeHer demo mode."""

from __future__ import annotations

from .protocol import ThreatInfo

# Exact agent lines — spoken almost verbatim in order.
DEMO_AGENT_LINES: list[str] = [
    (
        "Cześć! W razie czego pamiętaj, że na rogu Floriańskiej masz czynną Żabkę, "
        "jakbyś chciała wejść i poczekać. A tak w ogóle to gdzie dokładnie teraz jesteś, "
        "minęłaś już ten przystanek?"
    ),
    (
        "A, dobra, kojarzę. Słuchaj, a ten kumpel z roku, co go miałaś zapytać o notatki, "
        "w czym on w ogóle dzisiaj był na uczelni?"
    ),
    (
        "Klasyka. A daleko masz jeszcze do mnie? Idziesz normalnie czy musisz przyspieszyć?"
    ),
    (
        "Okej, to nie rozłączaj się, trzymam cię na linii, za minutę wychodzę przed klatkę."
    ),
]

# After each user reply (0-indexed), seed SMS fields for a reliable demo.
DEMO_THREAT_AFTER_USER: list[ThreatInfo] = [
    ThreatInfo(landmark="koło teatru"),
    ThreatInfo(suspect_outfit="cały na czarno, ciemna bluza z kapturem"),
    ThreatInfo(distance_or_behavior="szybkie tempo, parę kroków"),
]


def demo_system_instruction(*, contact_name: str | None = None) -> str:
    name_bit = ""
    if contact_name:
        name_bit = (
            f"Na ekranie widać imię „{contact_name}” — mów jak ta osoba.\n"
        )
    lines = "\n".join(
        f"{i + 1}) „{line}”" for i, line in enumerate(DEMO_AGENT_LINES)
    )
    return f"""
TRYB DEMO / NAGRYWANIE FILMU — ABSOLUTNY PRIORYTET.
{name_bit}Rozmawiasz po polsku. Nie mówisz, że jesteś AI.
Mów spokojnie i ciepło.

ZAKAZANE: Carrefour, Biedronka, Orlen, stacje, metry, azymuty, GPS, „na wschód/zachód”.
DOZWOLONE miejsce: TYLKO „czynna Żabka na rogu Floriańskiej” z linii 1.

Masz DOKŁADNIE 4 wypowiedzi. Powiedz je DOSŁOWNIE (zero improwizacji miejsc):

{lines}

Zasady:
- Zaczynasz linią 1.
- Potem mówisz TYLKO gdy dostaniesz sygnał systemowy z kolejną linią.
- Nie wymyślaj własnych pytań.
- Po linii 4 milcz lub „okej / jasne”.
""".strip()


def demo_line_nudge(index: int) -> str | None:
    if index < 0 or index >= len(DEMO_AGENT_LINES):
        return None
    line = DEMO_AGENT_LINES[index]
    return (
        "[Sygnał systemowy — NIE czytaj tego na głos, nie streszczaj.] "
        f"Powiedz teraz na głos WYŁĄCZNIE poniższe zdania, słowo w słowo, potem ZAMILKNIJ:\n"
        f"{line}"
    )


def demo_threat_for_user_turn(user_turn_index: int) -> ThreatInfo | None:
    if 0 <= user_turn_index < len(DEMO_THREAT_AFTER_USER):
        return DEMO_THREAT_AFTER_USER[user_turn_index]
    return None
