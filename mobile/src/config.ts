export const WS_URL =
  process.env.EXPO_PUBLIC_WS_URL ?? "ws://10.0.2.2:8000/ws/live";

export const CONTACT_NAME =
  process.env.EXPO_PUBLIC_CONTACT_NAME ?? "Tomek";

export const DEFAULT_MODE =
  (process.env.EXPO_PUBLIC_DEFAULT_MODE as "LOUDSPEAKER" | "SILENT") ??
  "LOUDSPEAKER";

/** Mic → Gemini */
export const INPUT_SAMPLE_RATE = 16_000;
/** Gemini → speaker */
export const OUTPUT_SAMPLE_RATE = 24_000;

/** Mic chunk emit interval (ms) */
export const MIC_INTERVAL_MS = 80;
