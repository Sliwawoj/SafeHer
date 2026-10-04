export type SafeHerSettings = {
  contactName: string;
  trustedPhone: string;
  userPin: string;
  /** Scripted presentation dialogue + seeded SMS details. */
  demoMode: boolean;
};

export const DEFAULT_SETTINGS: SafeHerSettings = {
  contactName: "Tomek",
  trustedPhone: "",
  userPin: "1234",
  demoMode: false,
};

export const SETTINGS_STORAGE_KEY = "@safeher/settings/v2";
