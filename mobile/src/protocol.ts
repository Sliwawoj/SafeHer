/** Keep in sync with shared/PROTOCOL.md / shared/ws-types.ts */

export type AgentMode = "LOUDSPEAKER" | "SILENT";

export type AlertLevel = 1 | 2 | 3;

export interface GeoLocation {
  lat: number;
  lng: number;
  accuracy_m?: number;
}

export type ClientMessage =
  | {
      type: "session.init";
      mode: AgentMode;
      location: GeoLocation;
      locale?: string;
      contact_name?: string;
      client?: { platform: string; app_version: string };
    }
  | { type: "session.update_location"; location: GeoLocation }
  | { type: "session.set_mode"; mode: AgentMode }
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
      type: "tool.safe_haven";
      place: {
        name: string;
        category: string;
        lat: number;
        lng: number;
        distance_m: number;
        hint: string;
      };
    }
  | {
      type: "tool.sms_payload";
      level: AlertLevel;
      to_label: string;
      body: string;
      meta?: {
        mode?: AgentMode;
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
