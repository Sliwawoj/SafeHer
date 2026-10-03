import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  type SafeHerSettings,
} from "./types";

function normalize(raw: Partial<SafeHerSettings> | null): SafeHerSettings | null {
  if (!raw) return null;
  const contactName = (raw.contactName ?? "").trim();
  const trustedPhone = (raw.trustedPhone ?? "").trim();
  const userPin = (raw.userPin ?? "").trim();
  if (!contactName || !trustedPhone || !/^\d{4}$/.test(userPin)) {
    return null;
  }
  return { contactName, trustedPhone, userPin };
}

export async function loadSettings(): Promise<SafeHerSettings | null> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw) as Partial<SafeHerSettings>);
  } catch {
    return null;
  }
}

export async function saveSettings(
  settings: SafeHerSettings,
): Promise<SafeHerSettings> {
  const normalized = normalize(settings);
  if (!normalized) {
    throw new Error("Niepoprawne ustawienia SafeHer");
  }
  await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export { DEFAULT_SETTINGS };
