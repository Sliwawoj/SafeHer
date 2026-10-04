import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";

import { ActiveCallView } from "./components/ActiveCallView";
import { IncomingCallView } from "./components/IncomingCallView";
import { PinModal } from "./components/PinModal";
import { useLiveCall } from "./hooks/useLiveCall";
import { SettingsScreen } from "./screens/SettingsScreen";
import { useSettings } from "./settings/SettingsContext";

type Props = {
  onRestart: () => void;
};

const MAX_PIN_ATTEMPTS = 3;

export function FakeCallScreen({ onRestart }: Props) {
  const { settings, save } = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  const [pinAttemptsLeft, setPinAttemptsLeft] = useState(MAX_PIN_ATTEMPTS);
  const [pinError, setPinError] = useState<string | null>(null);

  const call = useLiveCall({
    contactName: settings?.contactName ?? "Tomek",
    trustedPhone: settings?.trustedPhone ?? "",
  });

  // After hang-up / decline → immediately back to incoming-call home.
  useEffect(() => {
    if (call.phase === "ended") {
      onRestart();
    }
  }, [call.phase, onRestart]);

  const requestHangUp = useCallback(() => {
    setPinAttemptsLeft(MAX_PIN_ATTEMPTS);
    setPinError(null);
    setPinVisible(true);
  }, []);

  const handlePinSubmit = useCallback(
    (pin: string) => {
      const expected = settings?.userPin ?? "";
      if (pin === expected) {
        setPinVisible(false);
        setPinError(null);
        void call.hangUp();
        return;
      }

      setPinAttemptsLeft((left) => {
        const next = left - 1;
        if (next <= 0) {
          setPinVisible(false);
          void (async () => {
            await call.sendPinFailAlert();
            await call.hangUp();
          })();
        } else {
          setPinError(`Błędny PIN. Pozostało prób: ${next}`);
        }
        return next;
      });
    },
    [settings?.userPin, call],
  );

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
      <View style={styles.boot}>
        <StatusBar style="light" />
        <ActivityIndicator color="rgba(255,255,255,0.35)" />
      </View>
    );
  }

  if (call.phase === "incoming") {
    return (
      <>
        <StatusBar style="light" />
        <IncomingCallView
          contactName={call.contactName}
          phoneNumber={settings?.trustedPhone ?? ""}
          onAnswer={() => {
            void call.answer();
          }}
          onDecline={call.decline}
          onOpenSettings={() => setShowSettings(true)}
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
        alertLevel={call.alertLevel}
        onToggleMute={call.toggleMute}
        onHangUp={requestHangUp}
        onSecretTrigger={() => {
          void call.triggerAlert();
        }}
      />
      <PinModal
        visible={pinVisible}
        attemptsLeft={pinAttemptsLeft}
        error={pinError}
        onSubmit={handlePinSubmit}
        onCancel={() => {
          setPinVisible(false);
          setPinError(null);
        }}
      />
    </>
  );
}

/** Remounts the call hook state after hang-up / decline. */
export function FakeCallApp() {
  const { ready, configured, settings, save } = useSettings();
  const [sessionKey, setSessionKey] = useState(0);
  const restart = useCallback(() => setSessionKey((k) => k + 1), []);

  if (!ready) {
    return (
      <View style={styles.boot}>
        <StatusBar style="light" />
        <ActivityIndicator color="rgba(255,255,255,0.45)" />
        <Text style={styles.bootText}>SafeHer…</Text>
      </View>
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

  return <FakeCallScreen key={sessionKey} onRestart={restart} />;
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: "#2A3038",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  bootText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 14,
  },
});
