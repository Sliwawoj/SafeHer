/** Keep in sync with shared/PROTOCOL.md / shared/ws-types.ts */

export type AlertLevel = 1 | 2 | 3;

export interface GeoLocation {
  lat: number;
  lng: number;
  accuracy_m?: number;
}

export type ClientMessage =
  | {
      type: "session.init";
      location: GeoLocation;
      locale?: string;
      contact_name?: string;
      client?: { platform: string; app_version: string };
    }
  | { type: "session.update_location"; location: GeoLocation }
  | {
      type: "alert.trigger";
      level: AlertLevel;
      reason: "power_button_triple" | "duress_pin_fail" | "manual";
    }
  | { type: "session.end"; reason: "user_hangup" | "app_background" };

export type ServerMessage =
  | {
      type: "session.ready";
      session_id: string;
      audio: {
        input_rate: number;
        output_rate: number;
        encoding: "pcm16";
      };
    }
  | {
      type: "agent.transcript";
      role: "user" | "assistant";
      text: string;
    }
  | {
      type: "tool.sms_payload";
      level: AlertLevel;
      to_label: string;
      body: string;
      meta?: {
        summary?: string | null;
        live_location_link?: string;
        suspect_outfit?: string | null;
        distance_or_behavior?: string | null;
        landmark?: string | null;
      };
    }
  | { type: "session.error"; code: string; message: string }
  | { type: "session.ended"; reason: string }
  | { type: "audio.interrupted" };
