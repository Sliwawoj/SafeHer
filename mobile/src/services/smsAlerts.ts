import * as SMS from "expo-sms";

import type { GeoLocation } from "../protocol";
import type { SmsDraft } from "../hooks/useLiveCall";

export type AlertKind = "level1" | "level2" | "pin_fail";

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
  if (parts.length === 0 && smsDraft.body) {
    // Fall back to server-composed body details if meta fields empty.
    const idx = smsDraft.body.indexOf("Szczegóły:");
    if (idx >= 0) return smsDraft.body.slice(idx + "Szczegóły:".length).trim();
    return smsDraft.body;
  }
  return parts.length > 0 ? parts.join(" | ") : "brak dodatkowych szczegółów";
}

export function composeAlertSms(params: {
  kind: AlertKind;
  location: GeoLocation | null | undefined;
  smsDraft: SmsDraft | null;
}): string {
  const link = mapsLink(params.location);
  if (params.kind === "level2") {
    return (
      "[SafeHer PILNE] POTRZEBNA NATYCHMIASTOWA POMOC! Zadzwoń pod 112 lub przyjedź po mnie. " +
      `Moja pozycja: ${link}`
    );
  }
  if (params.kind === "pin_fail") {
    return (
      "[SafeHer ALARM] Połączenie zostało przerwane lub wymuszone bez podania poprawnego PIN-u! " +
      `Sprawdź moją lokalizację: ${link}`
    );
  }
  return (
    `[SafeHer Alert] Czuję zagrożenie. Moja pozycja: ${link}. ` +
    `Szczegóły: ${threatDetails(params.smsDraft)}`
  );
}

export async function sendAlertSms(
  phone: string,
  body: string,
): Promise<"sent" | "unavailable" | "cancelled" | "error"> {
  const to = phone.trim();
  if (!to) return "error";
  try {
    const available = await SMS.isAvailableAsync();
    if (!available) {
      console.warn("[sms] SMS unavailable on this device");
      return "unavailable";
    }
    const result = await SMS.sendSMSAsync([to], body);
    if (result.result === "sent") return "sent";
    if (result.result === "cancelled") return "cancelled";
    return "error";
  } catch (err) {
    console.warn("[sms] send failed", err);
    return "error";
  }
}
