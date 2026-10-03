export type SafeHerSettings = {
  contactName: string;
  trustedPhone: string;
  userPin: string;
};

export const DEFAULT_SETTINGS: SafeHerSettings = {
  contactName: "Tomek",
  trustedPhone: "",
  userPin: "1234",
};

export const SETTINGS_STORAGE_KEY = "@safeher/settings/v1";
