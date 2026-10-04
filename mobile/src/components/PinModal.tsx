import { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { CallChrome } from "./CallChrome";

const TOP_PAD =
  (Platform.OS === "android" ? StatusBar.currentHeight ?? 24 : 44) + 36;
const BOTTOM_PAD = Platform.OS === "ios" ? 34 : 20;

type Props = {
  visible: boolean;
  attemptsLeft: number;
  error?: string | null;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
};

const KEYS: { digit: string; letters?: string }[] = [
  { digit: "1" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" },
];

export function PinModal({
  visible,
  attemptsLeft,
  error,
  onSubmit,
  onCancel,
}: Props) {
  const [digits, setDigits] = useState("");
  const { width } = useWindowDimensions();
  const keySize = Math.min(84, Math.round(width * 0.2));
  const keyGap = Math.round(keySize * 0.28);

  useEffect(() => {
    if (visible) setDigits("");
  }, [visible, attemptsLeft, error]);

  const pressDigit = (digit: string) => {
    setDigits((d) => {
      if (d.length >= 4) return d;
      const next = d + digit;
      if (next.length === 4) {
        setTimeout(() => onSubmit(next), 80);
        return next;
      }
      return next;
    });
  };

  const deleteDigit = () => {
    setDigits((d) => d.slice(0, -1));
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
    >
      <CallChrome>
        <View
          style={[
            styles.root,
            {
              paddingTop: TOP_PAD,
              paddingBottom: BOTTOM_PAD,
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Wpisz kod PIN</Text>
            <View style={styles.dots}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[styles.dot, i < digits.length && styles.dotFilled]}
                />
              ))}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.attempts}>
              Pozostałe próby: {attemptsLeft}
            </Text>
          </View>

          <View style={styles.padBlock}>
            <View style={[styles.pad, { gap: keyGap }]}>
              {KEYS.map((key) => (
                <Pressable
                  key={key.digit}
                  onPress={() => pressDigit(key.digit)}
                  style={({ pressed }) => [
                    styles.key,
                    {
                      width: keySize,
                      height: keySize,
                      borderRadius: keySize / 2,
                    },
                    pressed && styles.keyPressed,
                  ]}
                >
                  <Text style={styles.keyDigit}>{key.digit}</Text>
                  {key.letters ? (
                    <Text style={styles.keyLetters}>{key.letters}</Text>
                  ) : (
                    <View style={styles.lettersSpacer} />
                  )}
                </Pressable>
              ))}
            </View>

            <View
              style={[styles.zeroRow, { marginTop: keyGap, gap: keyGap }]}
            >
              <View style={{ width: keySize }} />
              <Pressable
                onPress={() => pressDigit("0")}
                style={({ pressed }) => [
                  styles.key,
                  {
                    width: keySize,
                    height: keySize,
                    borderRadius: keySize / 2,
                  },
                  pressed && styles.keyPressed,
                ]}
              >
                <Text style={[styles.keyDigit, styles.zeroDigit]}>0</Text>
              </Pressable>
              <Pressable
                onPress={deleteDigit}
                disabled={digits.length === 0}
                style={[
                  styles.deleteHit,
                  { width: keySize, height: keySize },
                  digits.length === 0 && styles.deleteHidden,
                ]}
                accessibilityLabel="Usuń"
              >
                <Ionicons
                  name="backspace-outline"
                  size={26}
                  color="rgba(255,255,255,0.9)"
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.footer}>
            <View style={styles.footerSide} />
            <Pressable onPress={onCancel} hitSlop={12} style={styles.footerSide}>
              <Text style={styles.cancelText}>Anuluj</Text>
            </Pressable>
          </View>
        </View>
      </CallChrome>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 28,
  },
  header: {
    alignItems: "center",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "400",
    letterSpacing: 0.2,
  },
  dots: {
    marginTop: 28,
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
  },
  dot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.85)",
    backgroundColor: "transparent",
  },
  dotFilled: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  error: {
    marginTop: 16,
    color: "#FF8B8B",
    fontSize: 14,
    textAlign: "center",
  },
  attempts: {
    marginTop: 10,
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
  },
  padBlock: {
    alignItems: "center",
  },
  pad: {
    width: "100%",
    maxWidth: 320,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  key: {
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  keyPressed: {
    backgroundColor: "rgba(255,255,255,0.26)",
  },
  keyDigit: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "300",
    marginTop: 2,
  },
  zeroDigit: {
    marginTop: 0,
  },
  keyLetters: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.5,
    marginTop: -2,
  },
  lettersSpacer: {
    height: 10,
  },
  zeroRow: {
    width: "100%",
    maxWidth: 320,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteHit: {
    alignItems: "center",
    justifyContent: "center",
  },
  deleteHidden: {
    opacity: 0,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  footerSide: {
    minWidth: 88,
    alignItems: "flex-end",
    paddingVertical: 10,
  },
  cancelText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "400",
  },
});
