# SafeHer — shared WebSocket protocol (mobile ↔ backend)
# Version: 0.1 (Stage 0)

## Transport
- URL: `ws://<host>:8000/ws/live`
- Frames:
  - **Text** → JSON control / events
  - **Binary** → raw PCM audio (int16 LE)

## Audio contract
| Direction | Format | Rate | Channels |
|-----------|--------|------|----------|
| Mobile → Backend → Gemini | PCM 16-bit LE | 16000 Hz | mono |
| Gemini → Backend → Mobile | PCM 16-bit LE | 24000 Hz | mono |

Binary frames have **no envelope**. Session must be initialized before audio.

---

## Client → Server (JSON text)

### 1. `session.init`
Sent once after WebSocket open.

```json
{
  "type": "session.init",
  "mode": "LOUDSPEAKER",
  "location": { "lat": 52.2297, "lng": 21.0122, "accuracy_m": 12 },
  "locale": "pl-PL",
  "contact_name": "Tata",
  "client": { "platform": "android", "app_version": "0.1.0" }
}
```

`mode`: `"LOUDSPEAKER"` | `"SILENT"`

### 2. `session.update_location`
Periodic GPS updates during call.

```json
{
  "type": "session.update_location",
  "location": { "lat": 52.2301, "lng": 21.0130, "accuracy_m": 8 }
}
```

### 3. `session.set_mode`
Switch loudspeaker ↔ silent mid-call if needed.

```json
{
  "type": "session.set_mode",
  "mode": "SILENT"
}
```

### 4. `alert.trigger`
Hardware trigger / duress fail-safe from the device.

```json
{
  "type": "alert.trigger",
  "level": 1,
  "reason": "power_button_triple"
}
```

`level`: `1` (silent SMS) | `2` (escalation) | `3` (duress / bad PIN)

### 5. `session.end`
Graceful hang-up after correct Duress PIN.

```json
{
  "type": "session.end",
  "reason": "user_hangup"
}
```

---

## Server → Client (JSON text)

### 1. `session.ready`
Backend connected to Gemini Live; client may start mic stream.

```json
{
  "type": "session.ready",
  "session_id": "sh_01HXYZ...",
  "audio": {
    "input_rate": 16000,
    "output_rate": 24000,
    "encoding": "pcm16"
  }
}
```

### 2. `agent.transcript` (optional, debug / SMS aggregation)
```json
{
  "type": "agent.transcript",
  "role": "user",
  "text": "Mijam Żabkę na Mickiewicza"
}
```

### 3. `tool.safe_haven`
Function-calling result: nearest safe place.

```json
{
  "type": "tool.safe_haven",
  "place": {
    "name": "Orlen",
    "category": "fuel",
    "lat": 52.2310,
    "lng": 21.0142,
    "distance_m": 180,
    "hint": "Skręć w prawo — stacja Orlen po lewej"
  }
}
```

### 4. `tool.sms_payload`
Structured data for `expo-sms` (device sends SMS natively).

```json
{
  "type": "tool.sms_payload",
  "level": 1,
  "to_label": "trusted_contact",
  "body": "Rozmawiam w trybie głośnomówiącym... Śledź lokalizację: https://maps.google.com/?q=52.23,21.01",
  "meta": {
    "mode": "LOUDSPEAKER",
    "summary": "Facet w czarnej kurtce z kapturem, kierunek park"
  }
}
```

### 5. `session.error`
```json
{
  "type": "session.error",
  "code": "gemini_unavailable",
  "message": "Live session failed to start"
}
```

### 6. `session.ended`
```json
{
  "type": "session.ended",
  "reason": "user_hangup"
}
```

### 7. `audio.interrupted`
Gemini barge-in / user interruption — client **must flush** playback buffer.

```json
{
  "type": "audio.interrupted"
}
```

---

## Binary audio

```
Client mic PCM16 @16kHz  ──binary──►  Backend  ──►  Gemini Live
Gemini voice PCM16 @24kHz ◄──binary──  Backend  ◄──  Gemini Live
```

No base64 in MVP binary path. If a debugger needs text, use optional:
`{ "type": "audio.chunk", "data_b64": "..." }` (not used in production path).

---

## Minimal happy path

1. Client opens WS → sends `session.init`
2. Server replies `session.ready`
3. Client streams mic binary; plays incoming binary
4. On power×3 → `alert.trigger` → server replies `tool.sms_payload` → `expo-sms`
5. Client `session.end` → server `session.ended` → close
