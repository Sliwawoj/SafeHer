import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  visible: boolean;
  attemptsLeft: number;
  error?: string | null;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"] as const;

export function PinModal({
  visible,
  attemptsLeft,
  error,
  onSubmit,
  onCancel,
}: Props) {
  const [digits, setDigits] = useState("");

  useEffect(() => {
    if (visible) setDigits("");
  }, [visible, attemptsLeft, error]);

  const press = (key: string) => {
    if (!key) return;
    if (key === "⌫") {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    setDigits((d) => {
      if (d.length >= 4) return d;
      const next = d + key;
      if (next.length === 4) {
        setTimeout(() => onSubmit(next), 0);
        return "";
      }
      return next;
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Podaj PIN</Text>
          <Text style={styles.sub}>
            Aby zakończyć połączenie, wpisz 4-cyfrowy kod.
          </Text>
          <View style={styles.dots}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[styles.dot, i < digits.length && styles.dotFilled]}
              />
            ))}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.attempts}>Pozostałe próby: {attemptsLeft}</Text>

          <View style={styles.pad}>
            {KEYS.map((key, idx) => (
              <Pressable
                key={`${key}-${idx}`}
                disabled={!key}
                onPress={() => press(key)}
                style={({ pressed }) => [
                  styles.key,
                  !key && styles.keyEmpty,
                  pressed && key ? styles.keyPressed : null,
                ]}
              >
                <Text style={styles.keyText}>{key}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={onCancel} style={styles.cancel}>
            <Text style={styles.cancelText}>Anuluj</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 22,
    backgroundColor: "#152238",
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  sub: {
    marginTop: 8,
    color: "rgba(255,255,255,0.62)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  dots: {
    marginTop: 22,
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
  },
  dotFilled: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  error: {
    marginTop: 12,
    color: "#FF8B8B",
    textAlign: "center",
    fontSize: 13,
  },
  attempts: {
    marginTop: 8,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    fontSize: 12,
  },
  pad: {
    marginTop: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  key: {
    width: "30%",
    aspectRatio: 1.4,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  keyEmpty: {
    backgroundColor: "transparent",
  },
  keyPressed: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  keyText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "600",
  },
  cancel: {
    marginTop: 4,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 15,
  },
});
