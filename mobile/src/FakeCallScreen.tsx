import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
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
        title="Ustawienia SafeHer"
        subtitle="Zmień imię kontaktu, numer alertów SMS lub PIN."
        submitLabel="Zapisz ustawienia"
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
      <View style={styles.ended}>
        <StatusBar style="light" />
        <Text style={styles.endedTitle}>Połączenie zakończone</Text>
        {call.smsStatus ? (
          <Text style={styles.endedMeta}>SMS: {call.smsStatus}</Text>
        ) : null}
        <Pressable style={styles.restart} onPress={onRestart}>
          <Text style={styles.restartText}>Symuluj kolejne połączenie</Text>
        </Pressable>
        <Pressable style={styles.settingsLink} onPress={() => setShowSettings(true)}>
          <Text style={styles.settingsLinkText}>Ustawienia</Text>
        </Pressable>
      </View>
    );
  }

  if (call.phase === "incoming") {
    return (
      <>
        <StatusBar style="light" />
        <IncomingCallView
          contactName={call.contactName}
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
        elapsedSec={call.elapsedSec}
        mode={call.mode}
        muted={call.muted}
        connecting={call.phase === "connecting"}
        alertLevel={call.alertLevel}
        onToggleMute={call.toggleMute}
        onToggleSpeaker={call.toggleSpeakerMode}
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
        <ActivityIndicator color="#7EB6FF" />
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
    backgroundColor: "#0B1220",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  bootText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
  },
  ended: {
    flex: 1,
    backgroundColor: "#0B1220",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  endedTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 16,
  },
  endedMeta: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    marginBottom: 12,
    textAlign: "center",
  },
  restart: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  restartText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
  },
  settingsLink: {
    marginTop: 16,
    padding: 10,
  },
  settingsLinkText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
  },
});
