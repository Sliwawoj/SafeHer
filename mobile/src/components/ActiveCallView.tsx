import { Linking, StyleSheet, Text, View } from "react-native";

import { formatCallDuration } from "../utils";
import { formatPhone } from "../utils/phone";
import { CallChrome } from "./CallChrome";
import { LiquidGlassButton } from "./LiquidGlassButton";

/** Demo emergency number — swap to 112 for production. */
const SOS_NUMBER = "113";

type Props = {
  contactName: string;
  phoneNumber: string;
  elapsedSec: number;
  muted: boolean;
  connecting?: boolean;
  smsSent?: boolean;
  onToggleMute: () => void;
  onHangUp: () => void;
  onSendAlert: () => void;
};

export function ActiveCallView({
  contactName,
  phoneNumber,
  elapsedSec,
  muted,
  connecting,
  smsSent = false,
  onToggleMute,
  onHangUp,
  onSendAlert,
}: Props) {
  const callSos = () => {
    void Linking.openURL(`tel:${SOS_NUMBER}`);
  };

  return (
    <CallChrome>
      <View style={styles.top} pointerEvents="box-none">
        <Text style={styles.timer}>
          {connecting ? "łączenie…" : formatCallDuration(elapsedSec)}
        </Text>

        <View style={styles.identity}>
          <Text style={styles.name} numberOfLines={2}>
            {contactName}
          </Text>
          <Text style={styles.phone}>{formatPhone(phoneNumber)}</Text>
        </View>

        {smsSent ? (
          <Text style={styles.alertHint}>SMS wysłany</Text>
        ) : null}
      </View>

      <View style={styles.grid}>
        <View style={styles.row}>
          <LiquidGlassButton label="Głośnik" icon="volume-high-outline" dimmed />
          <LiquidGlassButton
            label="SMS"
            icon="chatbubble-ellipses-outline"
            onPress={onSendAlert}
            accessibilityLabel="Wyślij alert SMS"
          />
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
          <LiquidGlassButton
            label="SOS"
            icon="warning-outline"
            onPress={callSos}
            accessibilityLabel={`Zadzwoń na numer alarmowy ${SOS_NUMBER}`}
          />
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
