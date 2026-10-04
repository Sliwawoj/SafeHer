import { PermissionsAndroid, Platform } from "react-native";
import { SafeherAudio } from "safeher-audio";

import type { GeoLocation } from "../protocol";
import type { SmsDraft } from "../hooks/useLiveCall";

function mapsLink(location: GeoLocation | null | undefined): string {
  if (!location) {
    return "https://maps.google.com/?q=50.0614,19.9372";
  }
  return `https://maps.google.com/?q=${location.lat},${location.lng}`;
}

function threatDetails(smsDraft: SmsDraft | null): string {
  if (!smsDraft) return "brak dodatkowych szczegółów";
  const parts: string[] = [];
  if (smsDraft.suspectOutfit) parts.push(`ubiór: ${smsDraft.suspectOutfit}`);
  if (smsDraft.distanceOrBehavior) {
    parts.push(`zachowanie: ${smsDraft.distanceOrBehavior}`);
  }
  if (smsDraft.landmark) parts.push(`punkt: ${smsDraft.landmark}`);
  if (smsDraft.summary) parts.push(smsDraft.summary);
  if (parts.length === 0 && smsDraft.body) {
    const idx = smsDraft.body.indexOf("Szczegóły:");
    if (idx >= 0) return smsDraft.body.slice(idx + "Szczegóły:".length).trim();
  }
  return parts.length > 0 ? parts.join(" | ") : "brak dodatkowych szczegółów";
}

/** Digits / + only — SmsManager rejects spaces and dashes. */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return "";
  let digits = trimmed.startsWith("+")
    ? `+${trimmed.slice(1).replace(/\D/g, "")}`
    : trimmed.replace(/\D/g, "");
  // Polish 9-digit mobile → +48…
  if (!digits.startsWith("+") && digits.length === 9) {
    digits = `+48${digits}`;
  } else if (!digits.startsWith("+") && digits.length === 11 && digits.startsWith("48")) {
    digits = `+${digits}`;
  }
  return digits;
}

/** Single SafeHer SMS — fear signal + chat details + live location. */
export function composeAlertSms(params: {
  location: GeoLocation | null | undefined;
  smsDraft: SmsDraft | null;
}): string {
  const link = mapsLink(params.location);
  return (
    "[SafeHer] Czuję niepokój / lęk. " +
    `Szczegóły z rozmowy: ${threatDetails(params.smsDraft)}. ` +
    `Moja lokalizacja: ${link}`
  );
}

export async function ensureSendSmsPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    // Pixel/Android 10+: SmsManager touches subscription info (getGroupIdLevel1)
    // and throws SecurityException without READ_PHONE_STATE.
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.SEND_SMS,
      PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
    ]);
    const smsOk =
      result[PermissionsAndroid.PERMISSIONS.SEND_SMS] ===
      PermissionsAndroid.RESULTS.GRANTED;
    const phoneOk =
      result[PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE] ===
      PermissionsAndroid.RESULTS.GRANTED;
    if (!smsOk) {
      console.warn("[sms] SEND_SMS denied");
      return false;
    }
    if (!phoneOk) {
      console.warn(
        "[sms] READ_PHONE_STATE denied — silent SMS may fail on this device",
      );
    }
    return true;
  } catch (err) {
    console.warn("[sms] permission request failed", err);
    return false;
  }
}

/**
 * Silent native SmsManager only — never opens the system SMS composer.
 */
export async function sendAlertSms(
  phone: string,
  body: string,
): Promise<"sent" | "unavailable" | "cancelled" | "error" | "denied"> {
  const to = normalizePhone(phone);
  if (!to) {
    console.warn("[sms] empty / invalid trusted phone");
    return "error";
  }
  if (Platform.OS !== "android") {
    console.warn("[sms] silent send only supported on Android");
    return "unavailable";
  }

  const allowed = await ensureSendSmsPermission();
  if (!allowed) {
    console.warn("[sms] SEND_SMS denied — cannot send silently");
    return "denied";
  }

  const direct = await SafeherAudio.sendSmsDirect(to, body);
  if (direct === "sent") {
    console.log("[sms] sent silently via SmsManager", to);
    return "sent";
  }
  console.warn("[sms] native send failed", direct, "to=", to);
  return direct === "denied" ? "denied" : "error";
}
