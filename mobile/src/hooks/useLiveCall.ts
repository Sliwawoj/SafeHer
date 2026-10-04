import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, PermissionsAndroid, Platform } from "react-native";
import * as Location from "expo-location";
import { SafeherAudio } from "safeher-audio";

import { WS_URL } from "../config";
import type { ClientMessage, GeoLocation, ServerMessage } from "../protocol";
import { composeAlertSms, sendAlertSms } from "../services/smsAlerts";
import { base64ToUint8Array } from "../utils";

export type CallPhase = "incoming" | "connecting" | "active" | "ended";

export type HangUpOptions = {
  /** SMS only for duress / forced end — never for a correct PIN hang-up. */
  sendSms?: boolean;
  alertReason?: "manual" | "duress_pin_fail" | "power_button_triple";
  endReason?: "user_hangup" | "app_background";
};

export type SmsDraft = {
  body: string;
  toLabel: string;
  liveLocationLink?: string;
  summary?: string | null;
  suspectOutfit?: string | null;
  distanceOrBehavior?: string | null;
  landmark?: string | null;
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

type UseLiveCallOptions = {
  contactName: string;
  trustedPhone: string;
  demoMode?: boolean;
};

export function useLiveCall({
  contactName,
  trustedPhone,
  demoMode = false,
}: UseLiveCallOptions) {
  const [phase, setPhase] = useState<CallPhase>("incoming");
  const [muted, setMuted] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [smsDraft, setSmsDraft] = useState<SmsDraft | null>(null);
  const [smsSent, setSmsSent] = useState(false);
  const [smsStatus, setSmsStatus] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micSubRef = useRef<{ remove: () => void } | null>(null);
  const mutedRef = useRef(false);
  const playbackPausedRef = useRef(false);
  const endedRef = useRef(false);
  const callStartedRef = useRef(false);
  const locationRef = useRef<GeoLocation>(FALLBACK_LOCATION);
  const smsDraftRef = useRef<SmsDraft | null>(null);
  const contactNameRef = useRef(contactName);
  const trustedPhoneRef = useRef(trustedPhone);
  const demoModeRef = useRef(demoMode);
  const pendingSmsResolveRef = useRef<((body: string) => void) | null>(null);

  useEffect(() => {
    smsDraftRef.current = smsDraft;
  }, [smsDraft]);

  useEffect(() => {
    contactNameRef.current = contactName;
  }, [contactName]);

  useEffect(() => {
    trustedPhoneRef.current = trustedPhone;
  }, [trustedPhone]);

  useEffect(() => {
    demoModeRef.current = demoMode;
  }, [demoMode]);

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

  const waitForServerSmsBody = useCallback((timeoutMs = 1600) => {
    return new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        pendingSmsResolveRef.current = null;
        resolve(null);
      }, timeoutMs);
      pendingSmsResolveRef.current = (body: string) => {
        clearTimeout(timer);
        pendingSmsResolveRef.current = null;
        resolve(body);
      };
    });
  }, []);

  const dispatchSms = useCallback(async (bodyOverride?: string) => {
    const body =
      bodyOverride ??
      composeAlertSms({
        location: locationRef.current,
        smsDraft: smsDraftRef.current,
      });
    try {
      const result = await sendAlertSms(trustedPhoneRef.current, body);
      if (result === "sent") {
        setSmsSent(true);
      }
      setSmsStatus(`sms:${result}`);
      console.log("[sms]", result, body);
      return result;
    } catch (err) {
      console.warn("[sms] dispatch failed", err);
      setSmsStatus("sms:error");
      return "error" as const;
    }
  }, []);

  const hangUp = useCallback(
    async (opts?: HangUpOptions) => {
      if (endedRef.current) return;
      endedRef.current = true;
      clearTimer();

      const shouldSms = Boolean(opts?.sendSms) && callStartedRef.current;
      if (shouldSms) {
        try {
          sendJson({
            type: "alert.trigger",
            level: 1,
            reason: opts?.alertReason ?? "manual",
          });
        } catch {
          // ignore — compose locally if server unreachable
        }
        const serverBody = await waitForServerSmsBody(1200);
        await dispatchSms(serverBody ?? undefined);
      }

      sendJson({
        type: "session.end",
        reason: opts?.endReason ?? "user_hangup",
      });
      closeSocket();
      await teardownAudio();
      setPhase("ended");
    },
    [
      clearTimer,
      closeSocket,
      sendJson,
      teardownAudio,
      waitForServerSmsBody,
      dispatchSms,
    ],
  );

  const decline = useCallback(() => {
    endedRef.current = true;
    callStartedRef.current = false;
    clearTimer();
    closeSocket();
    void teardownAudio();
    setPhase("ended");
  }, [clearTimer, closeSocket, teardownAudio]);

  const triggerAlert = useCallback(async () => {
    if (phase !== "connecting" && phase !== "active") return;

    const serverBodyPromise = waitForServerSmsBody();
    sendJson({
      type: "alert.trigger",
      level: 1,
      reason: "manual",
    });

    const serverBody = await serverBodyPromise;
    await dispatchSms(serverBody ?? undefined);
  }, [phase, sendJson, dispatchSms, waitForServerSmsBody]);

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
          callStartedRef.current = true;
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
        case "tool.sms_payload": {
          const draft: SmsDraft = {
            body: msg.body,
            toLabel: msg.to_label,
            liveLocationLink: msg.meta?.live_location_link,
            summary: msg.meta?.summary,
            suspectOutfit: msg.meta?.suspect_outfit,
            distanceOrBehavior: msg.meta?.distance_or_behavior,
            landmark: msg.meta?.landmark,
          };
          smsDraftRef.current = draft;
          setSmsDraft(draft);
          pendingSmsResolveRef.current?.(msg.body);
          pendingSmsResolveRef.current = null;
          break;
        }
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
      if (mutedRef.current || playbackPausedRef.current) return;
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
    callStartedRef.current = false;
    mutedRef.current = false;
    playbackPausedRef.current = false;
    setMuted(false);
    setSmsSent(false);
    setSmsStatus(null);
    try {
      SafeherAudio.setMuted(false);
      SafeherAudio.setPlaybackPaused(false);
    } catch {
      // ignore
    }
    setSmsDraft(null);
    smsDraftRef.current = null;
    setError(null);
    setPhase("connecting");

    try {
      const location = FALLBACK_LOCATION;
      locationRef.current = location;
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
        // Drop agent audio while PIN / hang-up UI is open so keypad stays responsive.
        if (playbackPausedRef.current) return;
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
          // Unexpected drop (process kill / network) — treat as forced end.
          void hangUp({ sendSms: true, endReason: "app_background" });
        }
      };

      await startLocalAudio(ws);

      const init: ClientMessage = {
        type: "session.init",
        location,
        locale: "pl-PL",
        contact_name: contactNameRef.current,
        demo_mode: demoModeRef.current,
        client: {
          platform: Platform.OS,
          app_version: "0.1.0",
        },
      };
      ws.send(JSON.stringify(init));

      void (async () => {
        const fresh = await resolveLocation();
        if (endedRef.current) return;
        locationRef.current = fresh;
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
    const next = !mutedRef.current;
    mutedRef.current = next;
    try {
      SafeherAudio.setMuted(next);
    } catch (err) {
      console.warn("[safeher-audio] setMuted failed", err);
    }
    setMuted(next);
  }, []);

  const setPlaybackPaused = useCallback((paused: boolean) => {
    playbackPausedRef.current = paused;
    try {
      SafeherAudio.setPlaybackPaused(paused);
    } catch (err) {
      console.warn("[safeher-audio] setPlaybackPaused failed", err);
      if (paused) {
        try {
          SafeherAudio.flushPlayback();
        } catch {
          // ignore
        }
      }
    }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "background") return;
      if (endedRef.current || !callStartedRef.current) return;
      void hangUp({ sendSms: true, endReason: "app_background" });
    });
    return () => sub.remove();
  }, [hangUp]);

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
    muted,
    elapsedSec,
    error,
    lastTranscript,
    smsDraft,
    smsStatus,
    smsSent,
    contactName,
    answer,
    decline,
    hangUp,
    triggerAlert,
    toggleMute,
    setPlaybackPaused,
  };
}
