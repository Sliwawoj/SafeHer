import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import * as Location from "expo-location";
import { SafeherAudio } from "safeher-audio";

import {
  CONTACT_NAME,
  DEFAULT_MODE,
  WS_URL,
} from "../config";
import type { AgentMode, ClientMessage, GeoLocation, ServerMessage } from "../protocol";
import { base64ToUint8Array } from "../utils";

export type CallPhase = "incoming" | "connecting" | "active" | "ended";

export type SmsDraft = {
  level: number;
  body: string;
  toLabel: string;
  liveLocationLink?: string;
  suspectOutfit?: string | null;
  distanceOrBehavior?: string | null;
  landmark?: string | null;
  mode?: AgentMode;
};

/** Kraków centre — used so session.init never waits on GPS (esp. emulator). */
const FALLBACK_LOCATION: GeoLocation = {
  lat: 50.0614,
  lng: 19.9372,
  accuracy_m: 100,
};

const LOCATION_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("location_timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Best-effort GPS; never hangs the call path longer than LOCATION_TIMEOUT_MS. */
async function resolveLocation(): Promise<GeoLocation> {
  try {
    const perm = await withTimeout(
      Location.requestForegroundPermissionsAsync(),
      LOCATION_TIMEOUT_MS,
    );
    if (!perm.granted) return FALLBACK_LOCATION;
    const pos = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      LOCATION_TIMEOUT_MS,
    );
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy_m: pos.coords.accuracy ?? undefined,
    };
  } catch {
    return FALLBACK_LOCATION;
  }
}

async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: "Mikrofon SafeHer",
      message: "SafeHer potrzebuje mikrofonu do rozmowy głosowej.",
      buttonPositive: "OK",
      buttonNegative: "Anuluj",
    },
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export function useLiveCall() {
  const [phase, setPhase] = useState<CallPhase>("incoming");
  const [mode, setMode] = useState<AgentMode>(DEFAULT_MODE);
  const [muted, setMuted] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [smsDraft, setSmsDraft] = useState<SmsDraft | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micSubRef = useRef<{ remove: () => void } | null>(null);
  const modeRef = useRef<AgentMode>(DEFAULT_MODE);
  const endedRef = useRef(false);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const teardownAudio = useCallback(async () => {
    try {
      micSubRef.current?.remove();
      micSubRef.current = null;
    } catch {
      // ignore
    }
    try {
      SafeherAudio.stopRecording();
    } catch {
      // ignore
    }
    try {
      SafeherAudio.stopPlayback();
    } catch {
      // ignore
    }
    try {
      SafeherAudio.release();
    } catch {
      // ignore
    }
  }, []);

  const closeSocket = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (!ws) return;
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    } catch {
      // ignore
    }
  }, []);

  const sendJson = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  const hangUp = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    clearTimer();
    sendJson({ type: "session.end", reason: "user_hangup" });
    closeSocket();
    await teardownAudio();
    setPhase("ended");
  }, [clearTimer, closeSocket, sendJson, teardownAudio]);

  const decline = useCallback(() => {
    endedRef.current = true;
    clearTimer();
    closeSocket();
    void teardownAudio();
    setPhase("ended");
  }, [clearTimer, closeSocket, teardownAudio]);

  const handleServerMessage = useCallback(
    (raw: string) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(raw) as ServerMessage;
      } catch {
        return;
      }

      switch (msg.type) {
        case "session.ready":
          setPhase("active");
          setElapsedSec(0);
          clearTimer();
          timerRef.current = setInterval(() => {
            setElapsedSec((v) => v + 1);
          }, 1000);
          break;
        case "agent.transcript":
          setLastTranscript(`${msg.role}: ${msg.text}`);
          break;
        case "audio.interrupted":
          try {
            SafeherAudio.flushPlayback();
          } catch {
            // ignore
          }
          break;
        case "session.error":
          setError(msg.message);
          void hangUp();
          break;
        case "session.ended":
          void hangUp();
          break;
        case "tool.sms_payload":
          setSmsDraft({
            level: msg.level,
            body: msg.body,
            toLabel: msg.to_label,
            liveLocationLink: msg.meta?.live_location_link,
            suspectOutfit: msg.meta?.suspect_outfit,
            distanceOrBehavior: msg.meta?.distance_or_behavior,
            landmark: msg.meta?.landmark,
            mode: msg.meta?.mode,
          });
          console.log("[sms_payload]", msg.body, msg.meta);
          break;
        default:
          break;
      }
    },
    [clearTimer, hangUp],
  );

  const startLocalAudio = useCallback(async (ws: WebSocket) => {
    const granted = await ensureMicPermission();
    if (!granted) {
      throw new Error("Brak uprawnień do mikrofonu");
    }

    SafeherAudio.startPlayback();

    micSubRef.current?.remove();
    micSubRef.current = SafeherAudio.addAudioChunkListener((event) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (!event?.data) return;
      try {
        const pcm = base64ToUint8Array(event.data);
        ws.send(pcm);
      } catch (err) {
        console.warn("[safeher-audio] mic chunk failed", err);
      }
    });

    SafeherAudio.startRecording();
  }, []);

  const answer = useCallback(async () => {
    if (phase !== "incoming") return;
    endedRef.current = false;
    setError(null);
    setPhase("connecting");

    try {
      // Never block WS on GPS — init with Kraków fallback, refine in background.
      const location = FALLBACK_LOCATION;
      const ws = new WebSocket(WS_URL);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Timeout połączenia WebSocket")),
          12_000,
        );
        ws.onopen = () => {
          clearTimeout(timer);
          resolve();
        };
        ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error(`Nie udało się połączyć z ${WS_URL}`));
        };
      });

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          handleServerMessage(event.data);
          return;
        }
        const buffer =
          event.data instanceof ArrayBuffer
            ? new Uint8Array(event.data)
            : new Uint8Array(event.data as ArrayBuffer);
        try {
          SafeherAudio.writePlaybackBytes(buffer);
        } catch (err) {
          console.warn("[safeher-audio] playback write failed", err);
        }
      };

      ws.onclose = () => {
        if (!endedRef.current) {
          void hangUp();
        }
      };

      await startLocalAudio(ws);

      const init: ClientMessage = {
        type: "session.init",
        mode: modeRef.current,
        location,
        locale: "pl-PL",
        contact_name: CONTACT_NAME,
        client: {
          platform: Platform.OS,
          app_version: "0.1.0",
        },
      };
      ws.send(JSON.stringify(init));

      // Best-effort real GPS after the call is already up.
      void (async () => {
        const fresh = await resolveLocation();
        if (endedRef.current) return;
        if (
          fresh.lat === FALLBACK_LOCATION.lat &&
          fresh.lng === FALLBACK_LOCATION.lng
        ) {
          return;
        }
        sendJson({ type: "session.update_location", location: fresh });
      })();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      closeSocket();
      await teardownAudio();
      setPhase("incoming");
    }
  }, [
    phase,
    handleServerMessage,
    hangUp,
    startLocalAudio,
    closeSocket,
    teardownAudio,
    sendJson,
  ]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        SafeherAudio.setMuted(next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const toggleSpeakerMode = useCallback(() => {
    setMode((prev) => {
      const next: AgentMode = prev === "LOUDSPEAKER" ? "SILENT" : "LOUDSPEAKER";
      modeRef.current = next;
      sendJson({ type: "session.set_mode", mode: next });
      return next;
    });
  }, [sendJson]);

  useEffect(() => {
    return () => {
      endedRef.current = true;
      clearTimer();
      closeSocket();
      void teardownAudio();
    };
  }, [clearTimer, closeSocket, teardownAudio]);

  return {
    phase,
    mode,
    muted,
    elapsedSec,
    error,
    lastTranscript,
    smsDraft,
    contactName: CONTACT_NAME,
    answer,
    decline,
    hangUp,
    toggleMute,
    toggleSpeakerMode,
  };
}
