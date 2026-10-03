# SafeHer

Dyskretna ochrona głosowa (Gemini Live) + kamuflaż ekranu połączenia + natywny SMS.

## Struktura monorepo (MVP)

```
SafeHer/
├── SPEC.md                 # Specyfikacja produktowa
├── shared/
│   ├── PROTOCOL.md         # Kontrakt WebSocket (źródło prawdy)
│   └── ws-types.ts         # Typy TS dla mobile
├── backend/
│   ├── .env / .env.example
│   ├── requirements.txt
│   ├── venv/               # lokalny virtualenv (gitignored)
│   └── app/                # FastAPI + WS (od Etapu 1)
└── mobile/                 # Expo + React Native (TypeScript)
    ├── .env / .env.example
    └── ...
```

## Setup (Etap 0)

### Backend

```powershell
cd backend
py -3 -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env   # uzupełnij GEMINI_API_KEY
```

### Mobile

```powershell
cd mobile
npm install
npx expo install expo-av expo-sms expo-location
copy .env.example .env   # ustaw EXPO_PUBLIC_WS_URL na IP hosta
npx expo start
```

## Etapy implementacji

1. **Backend Live bridge** ✅ — FastAPI `/ws/live` ↔ Gemini Live, PCM in/out
2. **Mobile dialer + audio** ✅ — kamuflaż połączenia + raw PCM (dev build)
3. **Tools** — Overpass safe havens + `tool.sms_payload` + `expo-sms` + location
4. **Triggers & duress** — power×3, eskalacja SMS, Duress PIN / anti-termination

### Etap 1 — backend Live

```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000
python test_client.py
```

### Etap 2 — mobile (Development Build)

Instrukcja: [`mobile/STAGE2.md`](mobile/STAGE2.md)

```powershell
cd mobile
# Ustaw EXPO_PUBLIC_WS_URL w .env (emulator: 10.0.2.2, telefon: LAN IP PC)
npx expo run:android
```

Szczegóły protokołu: [`shared/PROTOCOL.md`](shared/PROTOCOL.md)


