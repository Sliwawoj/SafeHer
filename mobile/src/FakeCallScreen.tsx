import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";

import { ActiveCallView } from "./components/ActiveCallView";
import { IncomingCallView } from "./components/IncomingCallView";
import { useLiveCall } from "./hooks/useLiveCall";

type Props = {
  onRestart: () => void;
};

export function FakeCallScreen({ onRestart }: Props) {
  const call = useLiveCall();

  if (call.phase === "ended") {
    return (
      <View style={styles.ended}>
        <StatusBar style="light" />
        <Text style={styles.endedTitle}>Połączenie zakończone</Text>
        <Pressable style={styles.restart} onPress={onRestart}>
          <Text style={styles.restartText}>Symuluj kolejne połączenie</Text>
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
        onToggleMute={call.toggleMute}
        onToggleSpeaker={call.toggleSpeakerMode}
        onHangUp={() => {
          void call.hangUp();
        }}
      />
    </>
  );
}

/** Remounts the call hook state after hang-up / decline. */
export function FakeCallApp() {
  const [sessionKey, setSessionKey] = useState(0);
  const restart = useCallback(() => setSessionKey((k) => k + 1), []);
  return <FakeCallScreen key={sessionKey} onRestart={restart} />;
}

const styles = StyleSheet.create({
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
});
