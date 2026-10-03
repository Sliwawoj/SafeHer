# SafeHer — Etap 2: Mobile Dialer + lokalne PCM

## Audio

Lokalny moduł Expo: `modules/safeher-audio`
- Mic: `AudioRecord` PCM16 mono @ 16 kHz → event `onAudioChunk` (base64) → WebSocket binary
- Speaker: `AudioTrack` PCM16 mono @ 24 kHz ← WebSocket binary

**Bez** `@edkimmel/expo-audio-stream`. Wymagany Development Build.

## JDK 17

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:Path"
java -version   # 17.x
```

## Clean rebuild

```powershell
cd mobile
npm install

# wyczyść natywny cache (po zmianie lokalnego modułu — obowiązkowe)
Remove-Item -Recurse -Force android\.gradle, android\app\build, android\build -ErrorAction SilentlyContinue

npx expo run:android
```

## Backend

```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`.env` mobile: emulator `ws://10.0.2.2:8000/ws/live`, telefon `ws://<IP_PC>:8000/ws/live`.
