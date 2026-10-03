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

import { DEFAULT_SETTINGS, type SafeHerSettings } from "../settings/types";

type Props = {
  initial?: SafeHerSettings | null;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  onSave: (settings: SafeHerSettings) => Promise<void>;
  onCancel?: () => void;
};

export function SettingsScreen({
  initial,
  title = "Konfiguracja SafeHer",
  subtitle = "Ustaw kontakt dzwoniący, numer alertów SMS i PIN bezpieczeństwa.",
  submitLabel = "Zapisz i aktywuj SafeHer",
  onSave,
  onCancel,
}: Props) {
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
      setError("Uzupełnij imię, numer telefonu i 4-cyfrowy PIN.");
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
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>SafeHer</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <Field
          label="Imię kontaktu dzwoniącego"
          value={contactName}
          onChangeText={setContactName}
          placeholder="np. Tomek"
          autoCapitalize="words"
        />
        <Field
          label="Numer zaufany (SMS)"
          value={trustedPhone}
          onChangeText={setTrustedPhone}
          placeholder="np. +48123456789"
          keyboardType="phone-pad"
          autoCapitalize="none"
        />
        <Field
          label="PIN bezpieczeństwa (4 cyfry)"
          value={userPin}
          onChangeText={(t) => setUserPin(t.replace(/\D/g, "").slice(0, 4))}
          placeholder="1234"
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
            {saving ? "Zapisywanie…" : submitLabel}
          </Text>
        </Pressable>

        {onCancel ? (
          <Pressable onPress={onCancel} style={styles.secondary}>
            <Text style={styles.secondaryText}>Anuluj</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  ...inputProps
}: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="rgba(255,255,255,0.35)"
        style={styles.input}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B1220",
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 40,
  },
  brand: {
    color: "#7EB6FF",
    fontSize: 13,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 10,
    fontWeight: "600",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 28,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: "#FFFFFF",
    fontSize: 16,
  },
  error: {
    color: "#FF8B8B",
    marginBottom: 12,
    fontSize: 13,
  },
  primary: {
    marginTop: 8,
    backgroundColor: "#2E6BFF",
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  secondary: {
    marginTop: 14,
    alignItems: "center",
    paddingVertical: 10,
  },
  secondaryText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 15,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.88,
  },
});
