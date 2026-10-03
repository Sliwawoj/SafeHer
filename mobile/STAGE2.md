# SafeHer — Etap 2: Mobile Dialer + PCM Streaming

## Stack audio (Development Build)

Używamy `@edkimmel/expo-audio-stream` zamiast nieutrzymywanego `react-native-live-audio-stream`:

| Kierunek | API | Format |
|----------|-----|--------|
| Mikrofon → WS | `ExpoPlayAudioStream.startMicrophone` @ 16 kHz | PCM16 LE (base64 → binary frame) |
| WS → głośnik | `Pipeline` (native AudioTrack / AVAudioEngine) @ 24 kHz | surowy `Uint8Array` PCM16 LE |

**Expo Go nie wystarczy** — wymagany jest Development Build (`expo-dev-client`).

## Uruchomienie

### 0. Backend (osobny terminal)

```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 1. Skonfiguruj adres WebSocket

Edytuj `mobile/.env`:

- **Emulator Android:** `EXPO_PUBLIC_WS_URL=ws://10.0.2.2:8000/ws/live`
- **Telefon fizyczny (ta sama sieć Wi‑Fi):** `EXPO_PUBLIC_WS_URL=ws://<IP_TWOJEGO_PC>:8000/ws/live`  
  (np. `ws://192.168.0.42:8000/ws/live`)

### 2. Development Build (Android)

Wymagane: Android Studio + SDK / emulator lub USB debugging.

```powershell
cd mobile
npm install

# Pierwszy build natywny (wygeneruje android/ i zainstaluje appkę)
npx expo run:android
```

To samo co:

```powershell
npm run android
```

### 3. Kolejne uruchomienia (JS-only)

Gdy native build już jest na urządzeniu:

```powershell
cd mobile
npx expo start --dev-client
```

Otwórz appkę SafeHer na telefonie/emulatorze (nie Expo Go).

### iOS (macOS)

```powershell
cd mobile
npx expo run:ios
```

## Flow UI

1. **Incoming** — dzwoni „Tomek”, zielona = odbierz, czerwona = odrzuć  
2. **Active** — WS `session.init` + stream PCM, timer, Mute, Speaker (LOUDSPEAKER ↔ SILENT), czerwona = koniec  

## Pliki

```
mobile/src/
  FakeCallScreen.tsx
  hooks/useLiveCall.ts
  components/IncomingCallView.tsx
  components/ActiveCallView.tsx
  config.ts
  protocol.ts
  utils.ts
```
