# KONTEKST PROJEKTU: SafeHer (Zadanie Hackathonowe: ImpactHer)

## 1. WPROWADZENIE I MISJA
- **Nazwa projektu:** SafeHer
- **Główny cel:** Dyskretna ochrona kobiet powracających samotnie do domu lub znajdujących się w sytuacji poczucia zagrożenia, poprzez połączenie zaawansowanego agenta głosowego AI (RTC) z kamuflażem interfejsu (imitacja naturalnej rozmowy telefonicznej) oraz wielopoziomowym systemem cichego powiadamiania zaufanych kontaktów (hardware triggers & SMS).

---

## 2. PROBLEM I GRUPA DOCELOWA
- **Problem:** Kobiety często czują lęk poruszając się nocą, przez nieoświetlone ulice, parki czy puste zaułki. Tradycyjne aplikacje alarmowe (tzw. "panic buttons") bywają zawodne lub wręcz niebezpieczne, ponieważ:
  1. Wyciągnięcie telefonu i wciskanie widocznego czerwonego przycisku alarmowego prowokuje napastnika.
  2. Ofiara często nie wie, czy sytuacja jest już bezpośrednim atakiem, czy "tylko" podejrzaną osobą idącą za nią – obawia się niepotrzebnego dzwonienia pod 112.
  3. Powszechną strategią obronną kobiet jest "udawanie rozmowy przez telefon" ("Tak, kochanie, już wchodzę w naszą uliczkę, wyjdź po mnie"), aby odstraszyć potencjalnego sprawcę.
- **Rozwiązanie SafeHer:** Automatyzacja i technologiczne wzmocnienie tej naturalnej taktyki. Aplikacja zamienia smartfon w autentycznie wyglądający i brzmiący ekran połączenia telefonicznego, w którym rozmówcą jest inteligentny, adaptacyjny Agent AI.

---

## 3. KLUCZOWE FUNKCJONALNOŚCI SYSTEMU

### 3.1. Kamuflaż Połączenia (UI/UX Dialer Camouflage)
- Interfejs aplikacji do złudzenia przypomina natywny ekran przychodzącego lub trwającego połączenia (iOS/Android) od bliskiej osoby (np. „Tata”, „Kuba”, „Marta”).
- Po odebraniu połączenia uruchamia się dwukierunkowy potok audio z asystentem głosowym w czasie rzeczywistym.

### 3.2. Dwa Kontekstowe Tryby Pracy Agenta AI

Zarówno w trybie głośnomówiącym, jak i cichym, nadrzędnym celem jest sprawienie, by ewentualny napastnik/obserwator słyszał wyłącznie naturalne, pewne odpowiedzi kobiety sugerujące, że zaraz spotka się z kimś bliskim (np. *„Tak, widzę cię”, „Zaraz będę przy klatce”, „Czekaj na mnie na rogu”*).

1. **Tryb Głośnomówiący (Deterrent / Bezpośrednie Odstraszanie Otoczenia):**
   - **Przeznaczenie:** Sytuacja, w której kobieta chce, aby otoczenie głośno i wyraźnie słyszało, że ktoś na nią czeka i ma z nią stały kontakt.
   - **Zachowanie AI (Głos w głośniku):** Agent mówi głośno, pewnym i dynamicznym tonem. Symuluje np. partnera, brata lub współlokatora (np. *„Wyszedłem już przed blok z psem, gdzie jesteś?”, „Widzę cię z balkonu, macham ci”, „Zaraz skręcisz w naszą uliczkę, czekam na rogu”*).
   - **Rola wypowiedzi kobiety:** Agent tak formułuje swoje wypowiedzi, aby kobieta naturalnie odpowiadała na głos: *„Tak, już cię widzę!”, „Dobra, zaraz będę, zejdź na dół”, „Okej, poczekaj chwilę przy bramie”* – co bezpośrednio odstrasza śledzącą osobę.
   - **Bezpieczeństwo AI:** Agent bezwzględnie **nie pyta** o strach, nie używa słów: „pomoc”, „zagrożenie”, „policja”, nie zdradza, że jest aplikacją.
   - **SMS w tle:** Jeśli zostanie wyzwolony alarm fizyczny (pkt 3.4), automatyczny SMS zawiera adnotację dla bliskiego: *„Rozmawiam w trybie głośnomówiącym, aby odstraszyć osobę w pobliżu. Śledź moją lokalizację: [LINK]”*.

2. **Tryb Cichy / Słuchawkowy (Discreet Tactical Triage & Trojan Questions):**
   - **Przeznaczenie:** Gdy kobieta trzyma telefon przy uchu lub ma słuchawki, a nikt z zewnątrz nie słyszy głosu agenta AI.
   - **Zachowanie AI (Tylko w uchu użytkowniczki):** Agent jest opanowany i spokojny, ale zadaje pytania w sprytny sposób („pytania trojańskie”). Instruuje kobietę, co ma powiedzieć na głos, lub zadaje pytania tak, aby jej odpowiedzi brzmiały dla napastnika jak zwykła rozmowa towarzyska, jednocześnie przekazując AI kluczowe dane:
     - *Przykład 1 (Pozyskanie lokalizacji/odstraszenie):* Agent pyta w uchu: *„Powiedz na głos, obok jakiego sklepu jesteś, dodając, że zaraz tam będziesz”*. Kobieta mówi na głos: *„Okej, mijam właśnie tę Żabkę na rogu Mickiewicza, zaraz tam do ciebie dojdę!”*.
     - *Przykład 2 (Opis sprawcy/sytuacji):* Agent instruuje: *„Powiedz mi, jak ubrany jest ten facet za tobą, udając, że opisujesz znajomego”*. Kobieta odpowiada: *„Nie, ten w czarnej kurtce z kapturem to nie on, idzie za mną w stronę parku”*.
     - *Przykład 3 (Potwierdzenie zagrożenia):* Agent pyta: *„Jeśli widzisz, że on nadal za tobą idzie, powiedz po prostu: 'Zaraz będę'”*. Kobieta odpowiada: *„Zaraz będę”*.
   - **Agregacja danych do SMS:** Agent w tle analizuje transkrypcję słów kobiety, wyciąga z nich fakty (lokalizację, wygląd podejrzanego, kierunek marszu) i aktualizuje gotowy szablon SMS-a ratunkowego, podczas gdy dla otoczenia rozmowa brzmi jak niewinne umawianie się na spotkanie.

### 3.3. Inteligentna Nawigacja do Bezpiecznych Miejsc (Safe Havens)
- Agent AI na bieżąco monitoruje geolokalizację (GPS) telefonu.
- Przeszukuje otoczenie pod kątem „bezpiecznych przystani” (otwarte 24/7 stacje benzynowe, apteki całodobowe, oświetlone główne arterie, restauracje, posterunki policji).
- Agent głosowo, w naturalny sposób kieruje użytkowniczkę: *„Skręć w prawo za 50 metrów w ulicę Mickiewicza – po lewej stronie masz otwartą stację Orlen, tam jest bezpiecznie i są ludzie”*.

### 3.4. Dyskretne Wyzwalanie Alarmów Fizycznym Przyciskiem (Hardware Triggers)
Użytkowniczka nie musi patrzeć na ekran ani odblokowywać telefonu, by wezwać wsparcie:
- **1. Poziom (3x kliknięcie przycisku zasilania/Power Button):**
  - Ciche wysłanie pierwszego SMS-a do wcześniej zdefiniowanej zaufanej osoby (Trusted Contact).
  - Treść SMS: Link do śledzenia lokalizacji na żywo (Live GPS), aktualny status, tryb (głośnomówiący/cichy) oraz zwięzłe podsumowanie informacji zebranych przez AI (np. opis podejrzanej osoby lub lokalizacji).
- **2. Poziom (Ponowne 3x kliknięcie przycisku zasilania w trakcie trwania zagrożenia):**
  - Natychmiastowy SMS eskalacyjny: **„POTRZEBNA PILNA POMOC! Zadzwoń pod 112 lub natychmiast do mnie. Moja aktualna pozycja: [LINK]”**.

### 3.5. Zabezpieczenie przed Wymuszonym Rozłączeniem (Duress PIN & Anti-Termination)
- Jeśli kobieta kliknie przycisk „Zakończ połączenie”, na ekranie pojawia się dyskretny monit o wpisanie 4-cyfrowego kodu PIN.
- Cel: Ochrona na wypadek, gdyby napastnik wyrwał telefon i próbował rozłączyć aplikację.
- **Fail-safe:** Jeśli PIN zostanie wpisany 3 razy błędnie (lub minie określony timeout bez podania kodu):
  - Aplikacja automatycznie wysyła krytyczny SMS do zaufanego kontaktu o treści: *„UWAGA: Połączenie SafeHer zostało przerwane bez poprawnego kodu PIN. Istnieje ryzyko ataku. Sprawdź lokalizację: [LINK]”*.

---

### 4.1. Wybrany Stos Technologiczny (Tech Stack)
- **Frontend / Mobile Client:** React Native + Expo (TypeScript).
- **Backend & Orkiestracja:** Python (FastAPI + WebSockets).
- **Silnik Audio / Rozmowa w Czasie Rzeczywistym:** Gemini Multimodal Live API (dwukierunkowe przesyłanie strumienia audio mowa-do-mowy po WebSocket).
- **Wyszukiwanie Bezpiecznych Miejsc (POI):** Overpass API (OpenStreetMap) — bezpłatne zapytania geolokalizacyjne bez konieczności podpinania kart płatniczych.
- **Wysyłka Alertów:** Natywny moduł telefonu (`expo-sms` / Android SMS Intent).

---

## 5. WARTOŚĆ INNOWACYJNA I WPŁYW (IMPACT)
- **Psychologiczny komfort ofiary:** Redukcja paniki dzięki prowadzeniu za rękę przez inteligentnego asystenta.
- **Czynnik odstraszający (Deterrence):** Napastnicy rzadziej atakują osoby, które aktywnie rozmawiają przez telefon i informują kogoś, że są blisko.
- **Ochrona linii alarmowych przed fałszywymi zgłoszeniami:** Aplikacja nigdy nie dzwoni automatycznie pod 112. Cała komunikacja odbywa się wyłącznie ze wskazaną bliską osobą (stopniowanie: od cichego monitoringu trasy po prośbę do bliskiego o wezwanie służb w skrajnym zagrożeniu).
- **Zgodność z kryteriami jury HackYeah / ImpactHer:** Innowacja (30%), Użyteczność w realnym życiu (20%), Design/Kamuflaż (20%), Gotowość wdrożeniowa (10%).