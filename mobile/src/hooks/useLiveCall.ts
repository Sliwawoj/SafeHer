import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Location from "expo-location";
import {
  ExpoPlayAudioStream,
  Pipeline,
} from "@edkimmel/expo-audio-stream";

import {
  CONTACT_NAME,
  DEFAULT_MODE,
  INPUT_SAMPLE_RATE,
  MIC_INTERVAL_MS,
  OUTPUT_SAMPLE_RATE,
  WS_URL,
} from "../config";
import type { AgentMode, ClientMessage, GeoLocation, ServerMessage } from "../protocol";
import { base64ToUint8Array, uint8ArrayToBase64 } from "../utils";

export type CallPhase = "incoming" | "connecting" | "active" | "ended";

const FALLBACK_LOCATION: GeoLocation = {
  lat: 52.2297,
  lng: 21.0122,
  accuracy_m: 50,
};

async function resolveLocation(): Promise<GeoLocation> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return FALLBACK_LOCATION;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy_m: pos.coords.accuracy ?? undefined,
    };
  } catch {
    return FALLBACK_LOCATION;
  }
}

export function useLiveCall() {
  const [phase, setPhase] = useState<CallPhase>("incoming");
  const [mode, setMode] = useState<AgentMode>(DEFAULT_MODE);
  const [muted, setMuted] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const turnIdRef = useRef(`turn_${Date.now()}`);
  const firstAudioRef = useRef(true);
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
      await ExpoPlayAudioStream.stopMicrophone();
    } catch {
      // ignore
    }
    try {
      await Pipeline.disconnect();
    } catch {
      // ignore
    }
    try {
      await ExpoPlayAudioStream.destroy();
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
        case "audio.interrupted": {
          const oldTurn = turnIdRef.current;
          turnIdRef.current = `turn_${Date.now()}`;
          firstAudioRef.current = true;
          void Pipeline.invalidateTurn({ turnId: oldTurn });
          break;
        }
        case "session.error":
          setError(msg.message);
          void hangUp();
          break;
        case "session.ended":
          void hangUp();
          break;
        case "tool.sms_payload":
          // Stage 3 will wire expo-sms
          console.log("[sms_payload]", msg.body);
          break;
        default:
          break;
      }
    },
    [clearTimer, hangUp],
  );

  const startAudioPipeline = useCallback(async (ws: WebSocket) => {
    const micPerm = await ExpoPlayAudioStream.requestPermissionsAsync();
    if (!micPerm.granted) {
      throw new Error("Brak uprawnień do mikrofonu");
    }

    await Pipeline.connect({
      sampleRate: OUTPUT_SAMPLE_RATE,
      channelCount: 1,
      targetBufferMs: 60,
      playbackMode: "conversation",
      audioMode: "doNotMix",
    });

    const { subscription } = await ExpoPlayAudioStream.startMicrophone({
      sampleRate: INPUT_SAMPLE_RATE,
      channels: 1,
      encoding: "pcm_16bit",
      interval: MIC_INTERVAL_MS,
      onAudioStream: async (event) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (typeof event.data !== "string") return;
        const pcm = base64ToUint8Array(event.data);
        ws.send(pcm);
      },
    });
    micSubRef.current = subscription ?? null;
  }, []);

  const answer = useCallback(async () => {
    if (phase !== "incoming") return;
    endedRef.current = false;
    setError(null);
    setPhase("connecting");
    firstAudioRef.current = true;
    turnIdRef.current = `turn_${Date.now()}`;

    try {
      const location = await resolveLocation();
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
        Pipeline.pushAudioSync({
          audio: uint8ArrayToBase64(buffer),
          turnId: turnIdRef.current,
          isFirstChunk: firstAudioRef.current,
        });
        firstAudioRef.current = false;
      };

      ws.onclose = () => {
        if (!endedRef.current) {
          void hangUp();
        }
      };

      await startAudioPipeline(ws);

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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      closeSocket();
      await teardownAudio();
      setPhase("incoming");
    }
  }, [phase, handleServerMessage, hangUp, startAudioPipeline, closeSocket, teardownAudio]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        ExpoPlayAudioStream.toggleSilence(next);
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
    contactName: CONTACT_NAME,
    answer,
    decline,
    hangUp,
    toggleMute,
    toggleSpeakerMode,
  };
}
