# SafeHer — Stage checklist

## Stage 0 — done
- [x] Monorepo: `backend/`, `mobile/`, `shared/`
- [x] Backend venv + deps
- [x] `.env` (gitignored) + `.env.example`
- [x] WebSocket contract + TS types
- [x] Expo SDK 57 scaffold + `expo-av` / `expo-sms` / `expo-location`

## Stage 1 — done
- [x] FastAPI `/ws/live` ↔ Gemini Live PCM bridge
- [x] `session.init` / `session.ready` / transcripts / `audio.interrupted`
- [x] Mode prompts (LOUDSPEAKER / SILENT) + alert SMS stub payload
- [x] `backend/test_client.py` (desktop mic ↔ speaker realtime)

## Next
- [ ] Stage 2: mobile dialer camouflage + raw PCM in development build
