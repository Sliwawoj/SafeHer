import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { formatPhone } from "../utils/phone";
import { CallChrome } from "./CallChrome";
import { LiquidGlassButton } from "./LiquidGlassButton";

type Props = {
  contactName: string;
  phoneNumber: string;
  onAnswer: () => void;
  onDecline: () => void;
  onOpenSettings?: () => void;
  busy?: boolean;
  ringing?: boolean;
  error?: string | null;
};

export function IncomingCallView({
  contactName,
  phoneNumber,
  onAnswer,
  onDecline,
  onOpenSettings,
  busy,
  ringing = false,
  error,
}: Props) {
  return (
    <CallChrome>
      {onOpenSettings ? (
        <Pressable
          accessibilityLabel="Ustawienia"
          onPress={onOpenSettings}
          hitSlop={18}
          style={styles.gear}
        >
          <Ionicons
            name="settings-outline"
            size={18}
            color="rgba(255,255,255,0.16)"
          />
        </Pressable>
      ) : null}

      <View style={styles.identity}>
        <Text style={styles.name}>{contactName}</Text>
        <Text style={styles.phone}>{formatPhone(phoneNumber)}</Text>
        <Text style={styles.hint}>
          {ringing ? "Dzwoni…" : "Połączenie mobilne…"}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.actions}>
        <LiquidGlassButton
          label="Odrzuć"
          icon="close"
          tone="danger"
          size={80}
          iconSize={32}
          onPress={onDecline}
          disabled={busy}
          accessibilityLabel="Odrzuć"
        />
        <LiquidGlassButton
          label={busy ? "Łączenie…" : "Odbierz"}
          icon="call"
          tone="success"
          size={80}
          iconSize={30}
          onPress={onAnswer}
          disabled={busy}
          accessibilityLabel="Odbierz"
        />
      </View>
    </CallChrome>
  );
}

const styles = StyleSheet.create({
  gear: {
    position: "absolute",
    top: 56,
    right: 20,
    zIndex: 2,
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  identity: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingBottom: 40,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 38,
    fontWeight: "600",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  phone: {
    marginTop: 12,
    color: "rgba(255,255,255,0.55)",
    fontSize: 18,
    fontWeight: "400",
    letterSpacing: 0.5,
  },
  hint: {
    marginTop: 16,
    color: "rgba(255,255,255,0.38)",
    fontSize: 15,
  },
  error: {
    marginTop: 18,
    color: "#FF8B8B",
    textAlign: "center",
    fontSize: 13,
    paddingHorizontal: 16,
  },
  actions: {
    paddingBottom: 64,
    paddingHorizontal: 48,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
