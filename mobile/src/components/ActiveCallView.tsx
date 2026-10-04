import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatCallDuration } from "../utils";
import { formatPhone } from "../utils/phone";
import { CallChrome } from "./CallChrome";
import { LiquidGlassButton } from "./LiquidGlassButton";

type Props = {
  contactName: string;
  phoneNumber: string;
  elapsedSec: number;
  muted: boolean;
  connecting?: boolean;
  alertLevel?: 0 | 1 | 2;
  onToggleMute: () => void;
  onHangUp: () => void;
  onSecretTrigger: () => void;
};

const TAP_WINDOW_MS = 900;

export function ActiveCallView({
  contactName,
  phoneNumber,
  elapsedSec,
  muted,
  connecting,
  alertLevel = 0,
  onToggleMute,
  onHangUp,
  onSecretTrigger,
}: Props) {
  const tapsRef = useRef({ count: 0, lastAt: 0 });

  const handleNameTap = () => {
    const now = Date.now();
    const taps = tapsRef.current;
    if (now - taps.lastAt > TAP_WINDOW_MS) {
      taps.count = 0;
    }
    taps.lastAt = now;
    taps.count += 1;
    if (taps.count >= 3) {
      taps.count = 0;
      onSecretTrigger();
    }
  };

  return (
    <CallChrome>
      <View style={styles.top} pointerEvents="box-none">
        <Text style={styles.timer}>
          {connecting ? "łączenie…" : formatCallDuration(elapsedSec)}
        </Text>

        <Pressable
          onPress={handleNameTap}
          accessibilityLabel="Kontakt — naciśnij 3× aby wysłać alert"
          style={styles.identity}
        >
          <Text style={styles.name} numberOfLines={2}>
            {contactName}
          </Text>
          <Text style={styles.phone}>{formatPhone(phoneNumber)}</Text>
        </Pressable>

        {alertLevel > 0 ? (
          <Text style={styles.alertHint}>
            {alertLevel === 1 ? "Alert L1 wysłany" : "Alert L2 wysłany"}
          </Text>
        ) : null}
      </View>

      <View style={styles.grid}>
        <View style={styles.row}>
          <LiquidGlassButton label="Głośnik" icon="volume-high-outline" dimmed />
          <LiquidGlassButton label="FaceTime" icon="videocam-outline" dimmed />
          <LiquidGlassButton
            label="Wycisz"
            icon={muted ? "mic-off-outline" : "mic-outline"}
            tone={muted ? "active" : "glass"}
            onPress={onToggleMute}
            accessibilityLabel={muted ? "Włącz mikrofon" : "Wycisz"}
          />
        </View>
        <View style={styles.row}>
          <LiquidGlassButton label="Dodaj" icon="person-add-outline" dimmed />
          <LiquidGlassButton
            label="Zakończ"
            icon="call"
            tone="danger"
            iconRotateDeg={135}
            onPress={onHangUp}
            accessibilityLabel="Zakończ połączenie"
          />
          <LiquidGlassButton label="Klawiatura" icon="keypad-outline" dimmed />
        </View>
      </View>
    </CallChrome>
  );
}

const styles = StyleSheet.create({
  top: {
    flex: 1,
    alignItems: "center",
    paddingTop: 64,
    paddingHorizontal: 24,
  },
  timer: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 17,
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.4,
    textTransform: "lowercase",
  },
  identity: {
    marginTop: 28,
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: "92%",
  },
  name: {
    color: "#FFFFFF",
    fontSize: 40,
    fontWeight: "600",
    letterSpacing: 0.2,
    textAlign: "center",
    lineHeight: 46,
  },
  phone: {
    marginTop: 12,
    color: "rgba(255,255,255,0.5)",
    fontSize: 18,
    fontWeight: "400",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  alertHint: {
    marginTop: 14,
    color: "rgba(255,180,120,0.85)",
    fontSize: 12,
  },
  grid: {
    paddingBottom: 52,
    paddingHorizontal: 26,
    gap: 30,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
