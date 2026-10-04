/**
 * Vertical call background: deep amethyst at the top → near-black slate at the bottom.
 * Dense stop ladder keeps the transition soft on Android (less banding).
 */
export const CALL_GRADIENT = [
  "#5C2A7A", // rich amethyst (top)
  "#542670",
  "#4B2266",
  "#421E5C",
  "#391A52",
  "#301648",
  "#27123C",
  "#1E0F30",
  "#160C24",
  "#100A1A",
  "#0C0814",
  "#09070F", // near-black slate (bottom)
] as const;

export const CALL_GRADIENT_LOCATIONS = [
  0, 0.09, 0.18, 0.27, 0.36, 0.45, 0.55, 0.64, 0.73, 0.82, 0.91, 1,
] as const;

/** Fallback / solid boot screens — mid-dark of the same family. */
export const CALL_BG_FALLBACK = "#1A0F2A";
