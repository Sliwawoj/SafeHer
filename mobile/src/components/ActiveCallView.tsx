import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AgentMode } from "../protocol";
import { formatCallDuration } from "../utils";

type Props = {
  contactName: string;
  elapsedSec: number;
  mode: AgentMode;
  muted: boolean;
  connecting?: boolean;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
  onHangUp: () => void;
};

export function ActiveCallView({
  contactName,
  elapsedSec,
  mode,
  muted,
  connecting,
  onToggleMute,
  onToggleSpeaker,
  onHangUp,
}: Props) {
  const initial = contactName.trim().charAt(0).toUpperCase() || "T";
  const speakerOn = mode === "LOUDSPEAKER";

  return (
    <View style={styles.root}>
      <Text style={styles.label}>
        {connecting ? "Łączenie…" : "Połączenie SafeHer"}
      </Text>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <Text style={styles.name}>{contactName}</Text>
      <Text style={styles.timer}>
        {connecting ? "00:00" : formatCallDuration(elapsedSec)}
      </Text>

      <View style={styles.controls}>
        <ControlButton
          label={muted ? "Wyciszono" : "Wycisz"}
          active={muted}
          onPress={onToggleMute}
          glyph={muted ? "🔇" : "🎤"}
        />
        <ControlButton
          label={speakerOn ? "Głośnik" : "Słuchawka"}
          active={speakerOn}
          onPress={onToggleSpeaker}
          glyph={speakerOn ? "🔊" : "🎧"}
        />
      </View>

      <View style={styles.hangupWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zakończ połączenie"
          onPress={onHangUp}
          style={({ pressed }) => [
            styles.hangup,
            pressed && styles.hangupPressed,
          ]}
        >
          <Text style={styles.hangupIcon}>📞</Text>
        </Pressable>
        <Text style={styles.hangupLabel}>Zakończ</Text>
      </View>
    </View>
  );
}

function ControlButton({
  label,
  glyph,
  active,
  onPress,
}: {
  label: string;
  glyph: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.controlCol}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.controlBtn,
          active && styles.controlBtnActive,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.controlGlyph}>{glyph}</Text>
      </Pressable>
      <Text style={styles.controlLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    paddingTop: 96,
    paddingHorizontal: 24,
    backgroundColor: "#0B1220",
  },
  label: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    marginBottom: 28,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#2A3A55",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarText: {
    color: "#F4F7FB",
    fontSize: 44,
    fontWeight: "600",
  },
  name: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "600",
  },
  timer: {
    marginTop: 10,
    color: "rgba(255,255,255,0.75)",
    fontSize: 20,
    fontVariant: ["tabular-nums"],
  },
  controls: {
    marginTop: 64,
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-evenly",
  },
  controlCol: {
    alignItems: "center",
    gap: 10,
  },
  controlBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  controlBtnActive: {
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  controlGlyph: {
    fontSize: 24,
  },
  controlLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
  },
  hangupWrap: {
    position: "absolute",
    bottom: 72,
    alignItems: "center",
    gap: 10,
  },
  hangup: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#E53935",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "135deg" }],
  },
  hangupPressed: {
    opacity: 0.85,
  },
  hangupIcon: {
    fontSize: 30,
    color: "#fff",
  },
  hangupLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
});
