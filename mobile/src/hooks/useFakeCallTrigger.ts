import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, PermissionsAndroid, Platform } from "react-native";
import { SafeherAudio } from "safeher-audio";

import { ensureSendSmsPermission } from "../services/smsAlerts";

async function ensureStartupPermissions(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    if (Platform.Version >= 33) {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
    }
    // Ask early so alert SMS can send silently without opening Messages.
    await ensureSendSmsPermission();
  } catch (err) {
    console.warn("[safeher] startup permissions failed", err);
  }
}

/**
 * Starts the sticky lockscreen guard notification and wires the 30s delayed
 * fake-call trigger. Opening the app while armed cancels the countdown.
 */
export function useFakeCallTrigger(enabled: boolean) {
  const [armed, setArmed] = useState(false);
  const [ringing, setRinging] = useState(false);
  const firingRef = useRef(false);

  const stopRinging = useCallback(() => {
    setRinging(false);
    firingRef.current = false;
    SafeherAudio.stopIncomingCallAlert();
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const subs = [
      SafeherAudio.addFakeCallArmedListener(() => {
        if (!cancelled) setArmed(true);
      }),
      SafeherAudio.addFakeCallCancelledListener(() => {
        if (!cancelled) setArmed(false);
      }),
      SafeherAudio.addFakeCallFireListener(() => {
        firingRef.current = true;
        if (!cancelled) {
          setArmed(false);
          setRinging(true);
        }
      }),
    ];

    const appSub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      if (SafeherAudio.isFakeCallArmed()) {
        SafeherAudio.cancelArmedFakeCall();
      }
    });

    void (async () => {
      await ensureStartupPermissions();
      if (cancelled) return;
      SafeherAudio.startFakeCallGuard();
    })();

    return () => {
      cancelled = true;
      for (const sub of subs) sub.remove();
      appSub.remove();
      SafeherAudio.stopIncomingCallAlert();
    };
  }, [enabled]);

  return { armed, ringing, stopRinging };
}
