import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";

import { ActiveCallView } from "./components/ActiveCallView";
import { CallChrome } from "./components/CallChrome";
import { IncomingCallView } from "./components/IncomingCallView";
import { PinModal } from "./components/PinModal";
import { useFakeCallTrigger } from "./hooks/useFakeCallTrigger";
import { useLiveCall } from "./hooks/useLiveCall";
import { SettingsScreen } from "./screens/SettingsScreen";
import { useSettings } from "./settings/SettingsContext";
import { SafeherAudio } from "safeher-audio";

type Props = {
  onRestart: () => void;
  ringing: boolean;
  onStopRinging: () => void;
};

const MAX_PIN_ATTEMPTS = 3;

export function FakeCallScreen({ onRestart, ringing, onStopRinging }: Props) {
  const { settings, save } = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  const [pinAttemptsLeft, setPinAttemptsLeft] = useState(MAX_PIN_ATTEMPTS);
  const [pinError, setPinError] = useState<string | null>(null);

  const call = useLiveCall({
    contactName: settings?.contactName ?? "Tomek",
    trustedPhone: settings?.trustedPhone ?? "",
    demoMode: Boolean(settings?.demoMode),
  });

  // After hang-up / decline → immediately back to incoming-call home.
  useEffect(() => {
    if (call.phase === "ended") {
      onStopRinging();
      onRestart();
    }
  }, [call.phase, onRestart, onStopRinging]);

  const requestHangUp = useCallback(() => {
    // Stop agent speech immediately so End / PIN stay usable mid-talk.
    call.setPlaybackPaused(true);
    try {
      SafeherAudio.setMuted(true);
    } catch {
      // ignore
    }
    setPinAttemptsLeft(MAX_PIN_ATTEMPTS);
    setPinError(null);
    setPinVisible(true);
  }, [call]);

  const closePinModal = useCallback(() => {
    setPinVisible(false);
    setPinError(null);
    call.setPlaybackPaused(false);
    try {
      SafeherAudio.setMuted(call.muted);
    } catch {
      // ignore
    }
  }, [call]);

  const handlePinSubmit = useCallback(
    (pin: string) => {
      const expected = settings?.userPin ?? "";
      if (pin === expected) {
        setPinVisible(false);
        setPinError(null);
        // Correct PIN = quiet exit, no SMS.
        void call.hangUp();
        return;
      }

      setPinAttemptsLeft((left) => {
        const next = left - 1;
        if (next <= 0) {
          setPinVisible(false);
          void call.hangUp({
            sendSms: true,
            alertReason: "duress_pin_fail",
          });
        } else {
          setPinError(`Błędny PIN. Pozostało prób: ${next}`);
        }
        return next;
      });
    },
    [settings?.userPin, call],
  );

  const handleAnswer = useCallback(() => {
    onStopRinging();
    void call.answer();
  }, [call, onStopRinging]);

  const handleDecline = useCallback(() => {
    onStopRinging();
    call.decline();
  }, [call, onStopRinging]);

  if (showSettings && settings) {
    return (
      <SettingsScreen
        initial={settings}
        onCancel={() => setShowSettings(false)}
        onSave={async (next) => {
          await save(next);
          setShowSettings(false);
        }}
      />
    );
  }

  if (call.phase === "ended") {
    return (
      <CallChrome>
        <View style={styles.boot}>
          <StatusBar style="light" />
          <ActivityIndicator color="rgba(255,255,255,0.45)" />
        </View>
      </CallChrome>
    );
  }

  if (call.phase === "incoming") {
    return (
      <>
        <StatusBar style="light" />
        <IncomingCallView
          contactName={call.contactName}
          phoneNumber={settings?.trustedPhone ?? ""}
          ringing={ringing}
          onAnswer={handleAnswer}
          onDecline={handleDecline}
          onOpenSettings={ringing ? undefined : () => setShowSettings(true)}
          error={call.error}
        />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <ActiveCallView
        contactName={call.contactName}
        phoneNumber={settings?.trustedPhone ?? ""}
        elapsedSec={call.elapsedSec}
        muted={call.muted}
        connecting={call.phase === "connecting"}
        smsSent={call.smsSent}
        onToggleMute={call.toggleMute}
        onHangUp={requestHangUp}
        onSendAlert={() => {
          void call.triggerAlert();
        }}
      />
      <PinModal
        visible={pinVisible}
        attemptsLeft={pinAttemptsLeft}
        error={pinError}
        onSubmit={handlePinSubmit}
        onCancel={closePinModal}
      />
    </>
  );
}

/** Remounts the call hook state after hang-up / decline. */
export function FakeCallApp() {
  const { ready, configured, settings, save } = useSettings();
  const [sessionKey, setSessionKey] = useState(0);
  const restart = useCallback(() => setSessionKey((k) => k + 1), []);
  const trigger = useFakeCallTrigger(Boolean(ready && configured));

  // Bring UI back to incoming home when the delayed lockscreen trigger fires.
  useEffect(() => {
    if (!trigger.ringing) return;
    setSessionKey((k) => k + 1);
  }, [trigger.ringing]);

  if (!ready) {
    return (
      <CallChrome>
        <View style={styles.boot}>
          <StatusBar style="light" />
          <ActivityIndicator color="rgba(255,255,255,0.45)" />
          <Text style={styles.bootText}>SafeHer…</Text>
        </View>
      </CallChrome>
    );
  }

  if (!configured || !settings) {
    return (
      <SettingsScreen
        onSave={async (next) => {
          await save(next);
        }}
      />
    );
  }

  return (
    <FakeCallScreen
      key={sessionKey}
      onRestart={restart}
      ringing={trigger.ringing}
      onStopRinging={trigger.stopRinging}
    />
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  bootText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 14,
  },
});
