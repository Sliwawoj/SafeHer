import { NativeModule, requireNativeModule, type EventSubscription } from "expo-modules-core";

type AudioChunkEvent = {
  data: string; // base64 PCM16 LE @ 16 kHz mono
};

type FakeCallArmedEvent = {
  delayMs?: number;
};

type SafeherAudioEvents = {
  onAudioChunk: (event: AudioChunkEvent) => void;
  onFakeCallArmed: (event: FakeCallArmedEvent) => void;
  onFakeCallCancelled: (event: Record<string, never>) => void;
  onFakeCallFire: (event: Record<string, never>) => void;
};

declare class SafeherAudioModule extends NativeModule<SafeherAudioEvents> {
  startPlayback(): void;
  stopPlayback(): void;
  writePlaybackBase64(base64: string): void;
  writePlaybackPcm(data: Uint8Array): void;
  flushPlayback(): void;
  setPlaybackPaused(paused: boolean): void;
  startRecording(): void;
  stopRecording(): void;
  setMuted(muted: boolean): void;
  release(): void;
  startFakeCallGuard(): void;
  stopFakeCallGuard(): void;
  cancelArmedFakeCall(): void;
  stopIncomingCallAlert(): void;
  isFakeCallArmed(): boolean;
  sendSmsDirect(phone: string, body: string): Promise<string>;
}

const Native = requireNativeModule<SafeherAudioModule>("SafeherAudio");

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return globalThis.btoa(binary);
}

export const SafeherAudio = {
  startPlayback(): void {
    Native.startPlayback();
  },

  stopPlayback(): void {
    Native.stopPlayback();
  },

  writePlaybackBase64(base64: string): void {
    Native.writePlaybackBase64(base64);
  },

  writePlaybackBytes(bytes: Uint8Array): void {
    try {
      // Prefer raw PCM path (no JS base64 loop) when native module supports it.
      Native.writePlaybackPcm(bytes);
    } catch {
      Native.writePlaybackBase64(uint8ToBase64(bytes));
    }
  },

  flushPlayback(): void {
    Native.flushPlayback();
  },

  setPlaybackPaused(paused: boolean): void {
    try {
      Native.setPlaybackPaused(paused);
    } catch {
      if (paused) {
        try {
          Native.flushPlayback();
        } catch {
          // ignore
        }
      }
    }
  },

  startRecording(): void {
    Native.startRecording();
  },

  stopRecording(): void {
    Native.stopRecording();
  },

  setMuted(muted: boolean): void {
    Native.setMuted(muted);
  },

  release(): void {
    Native.release();
  },

  startFakeCallGuard(): void {
    try {
      Native.startFakeCallGuard();
    } catch (err) {
      console.warn("[safeher] startFakeCallGuard failed", err);
    }
  },

  stopFakeCallGuard(): void {
    try {
      Native.stopFakeCallGuard();
    } catch (err) {
      console.warn("[safeher] stopFakeCallGuard failed", err);
    }
  },

  cancelArmedFakeCall(): void {
    try {
      Native.cancelArmedFakeCall();
    } catch {
      // ignore
    }
  },

  stopIncomingCallAlert(): void {
    try {
      Native.stopIncomingCallAlert();
    } catch {
      // ignore
    }
  },

  isFakeCallArmed(): boolean {
    try {
      return Native.isFakeCallArmed();
    } catch {
      return false;
    }
  },

  addAudioChunkListener(
    listener: (event: AudioChunkEvent) => void,
  ): EventSubscription {
    return Native.addListener("onAudioChunk", listener);
  },

  addFakeCallArmedListener(
    listener: (event: FakeCallArmedEvent) => void,
  ): EventSubscription {
    return Native.addListener("onFakeCallArmed", listener);
  },

  addFakeCallCancelledListener(listener: () => void): EventSubscription {
    return Native.addListener("onFakeCallCancelled", listener);
  },

  addFakeCallFireListener(listener: () => void): EventSubscription {
    return Native.addListener("onFakeCallFire", listener);
  },

  async sendSmsDirect(
    phone: string,
    body: string,
  ): Promise<"sent" | "denied" | "error"> {
    try {
      const result = await Native.sendSmsDirect(phone, body);
      if (result === "sent") return "sent";
      if (result === "denied") return "denied";
      console.warn("[safeher] sendSmsDirect result", result);
      return "error";
    } catch (err) {
      console.warn("[safeher] sendSmsDirect failed", err);
      return "error";
    }
  },
};

export default SafeherAudio;
