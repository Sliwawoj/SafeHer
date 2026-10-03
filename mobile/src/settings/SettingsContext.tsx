import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { loadSettings, saveSettings } from "./storage";
import type { SafeHerSettings } from "./types";

type SettingsContextValue = {
  ready: boolean;
  configured: boolean;
  settings: SafeHerSettings | null;
  save: (next: SafeHerSettings) => Promise<void>;
  refresh: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<SafeHerSettings | null>(null);

  const refresh = useCallback(async () => {
    const loaded = await loadSettings();
    setSettings(loaded);
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (next: SafeHerSettings) => {
    const saved = await saveSettings(next);
    setSettings(saved);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      configured: settings !== null,
      settings,
      save,
      refresh,
    }),
    [ready, settings, save, refresh],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return ctx;
}
