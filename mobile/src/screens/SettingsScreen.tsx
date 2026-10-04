import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { StatusBar } from "expo-status-bar";

import { CallChrome } from "../components/CallChrome";
import { DEFAULT_SETTINGS, type SafeHerSettings } from "../settings/types";

type Props = {
  initial?: SafeHerSettings | null;
  onSave: (settings: SafeHerSettings) => Promise<void>;
  onCancel?: () => void;
};

export function SettingsScreen({ initial, onSave, onCancel }: Props) {
  const seed = initial ?? DEFAULT_SETTINGS;
  const [contactName, setContactName] = useState(seed.contactName);
  const [trustedPhone, setTrustedPhone] = useState(seed.trustedPhone);
  const [userPin, setUserPin] = useState(seed.userPin);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      contactName.trim().length > 0 &&
      trustedPhone.trim().length >= 6 &&
      /^\d{4}$/.test(userPin.trim())
    );
  }, [contactName, trustedPhone, userPin]);

  const handleSave = async () => {
    setError(null);
    if (!canSubmit) {
      setError("Uzupełnij wszystkie pola.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        contactName: contactName.trim(),
        trustedPhone: trustedPhone.trim(),
        userPin: userPin.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <CallChrome>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Ustawienia</Text>

          <Field
            label="Imię kontaktu"
            value={contactName}
            onChangeText={setContactName}
            placeholder="Tomek"
            autoCapitalize="words"
          />
          <Field
            label="Numer telefonu"
            value={trustedPhone}
            onChangeText={setTrustedPhone}
            placeholder="+48 123 456 789"
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
          <Field
            label="PIN"
            value={userPin}
            onChangeText={(t) => setUserPin(t.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••"
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={() => {
              void handleSave();
            }}
            disabled={saving || !canSubmit}
            style={({ pressed }) => [
              styles.primary,
              (!canSubmit || saving) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryText}>
              {saving ? "Zapisywanie…" : "Zapisz"}
            </Text>
          </Pressable>

          {onCancel ? (
            <Pressable onPress={onCancel} style={styles.secondary}>
              <Text style={styles.secondaryText}>Anuluj</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </CallChrome>
  );
}

function Field({ label, ...inputProps }: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="rgba(255,255,255,0.3)"
        style={styles.input}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 72,
    paddingBottom: 40,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "600",
    marginBottom: 36,
    letterSpacing: 0.2,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: "#FFFFFF",
    fontSize: 17,
  },
  error: {
    color: "#FF8B8B",
    marginBottom: 12,
    fontSize: 13,
  },
  primary: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "500",
  },
  secondary: {
    marginTop: 14,
    alignItems: "center",
    paddingVertical: 12,
  },
  secondaryText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 16,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.88,
  },
});
