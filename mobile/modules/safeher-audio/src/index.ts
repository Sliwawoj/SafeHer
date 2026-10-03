import { NativeModule, requireNativeModule, type EventSubscription } from "expo-modules-core";

type AudioChunkEvent = {
  data: string; // base64 PCM16 LE @ 16 kHz mono
};

type SafeherAudioEvents = {
  onAudioChunk: (event: AudioChunkEvent) => void;
};

declare class SafeherAudioModule extends NativeModule<SafeherAudioEvents> {
  startPlayback(): void;
  stopPlayback(): void;
  writePlaybackBase64(base64: string): void;
  flushPlayback(): void;
  startRecording(): void;
  stopRecording(): void;
  setMuted(muted: boolean): void;
  release(): void;
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
    Native.writePlaybackBase64(uint8ToBase64(bytes));
  },

  flushPlayback(): void {
    Native.flushPlayback();
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

  addAudioChunkListener(
    listener: (event: AudioChunkEvent) => void,
  ): EventSubscription {
    return Native.addListener("onAudioChunk", listener);
  },
};

export default SafeherAudio;
