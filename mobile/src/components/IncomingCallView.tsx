import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  contactName: string;
  onAnswer: () => void;
  onDecline: () => void;
  onOpenSettings?: () => void;
  busy?: boolean;
  error?: string | null;
};

export function IncomingCallView({
  contactName,
  onAnswer,
  onDecline,
  onOpenSettings,
  busy,
  error,
}: Props) {
  const initial = contactName.trim().charAt(0).toUpperCase() || "T";

  return (
    <View style={styles.root}>
      {onOpenSettings ? (
        <Pressable
          accessibilityLabel="Ustawienia"
          onPress={onOpenSettings}
          hitSlop={12}
          style={styles.gear}
        >
          <Text style={styles.gearText}>⚙</Text>
        </Pressable>
      ) : null}

      <Text style={styles.label}>Połączenie przychodzące…</Text>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <Text style={styles.name}>{contactName}</Text>
      <Text style={styles.sub}>telefon komórkowy</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <View style={styles.actionCol}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Odrzuć"
            onPress={onDecline}
            disabled={busy}
            style={({ pressed }) => [
              styles.circle,
              styles.decline,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.icon}>✕</Text>
          </Pressable>
          <Text style={styles.actionLabel}>Odrzuć</Text>
        </View>

        <View style={styles.actionCol}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Odbierz"
            onPress={onAnswer}
            disabled={busy}
            style={({ pressed }) => [
              styles.circle,
              styles.answer,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            <Text style={styles.icon}>📞</Text>
          </Pressable>
          <Text style={styles.actionLabel}>
            {busy ? "Łączenie…" : "Odbierz"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    backgroundColor: "#0B1220",
  },
  gear: {
    position: "absolute",
    top: 54,
    right: 22,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  gearText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 18,
  },
  label: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 15,
    letterSpacing: 0.4,
    marginBottom: 36,
  },
  avatar: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: "#2A3A55",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  avatarText: {
    color: "#F4F7FB",
    fontSize: 48,
    fontWeight: "600",
  },
  name: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "600",
  },
  sub: {
    marginTop: 8,
    color: "rgba(255,255,255,0.55)",
    fontSize: 16,
  },
  error: {
    marginTop: 18,
    color: "#FF8B8B",
    textAlign: "center",
    fontSize: 13,
  },
  actions: {
    position: "absolute",
    bottom: 72,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  actionCol: {
    alignItems: "center",
    gap: 10,
  },
  circle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: "center",
    justifyContent: "center",
  },
  decline: {
    backgroundColor: "#E53935",
  },
  answer: {
    backgroundColor: "#2EAD5B",
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  icon: {
    fontSize: 28,
    color: "#fff",
  },
  actionLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
  },
});
