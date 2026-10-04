package expo.modules.safeheraudio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.os.Bundle
import android.os.Process
import android.util.Base64
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean

class SafeherAudioModule : Module() {
  companion object {
    private const val TAG = "SafeherAudio"
    private const val INPUT_RATE = 16_000
    private const val OUTPUT_RATE = 24_000
    private const val CHANNEL_IN = AudioFormat.CHANNEL_IN_MONO
    private const val CHANNEL_OUT = AudioFormat.CHANNEL_OUT_MONO
    private const val ENCODING = AudioFormat.ENCODING_PCM_16BIT
    // Chunk size sent to JS/WS: 1280 B = 640 samples = 40 ms @ 16 kHz PCM16 mono.
    // Keep reads small so Gemini VAD sees end-of-speech promptly.
    private const val READ_BYTES = 1280
    // AudioRecord ring buffer: at least 2 chunks, never oversized beyond ~64 ms * 8.
    private const val RING_CHUNKS = 2
  }

  private var recorder: AudioRecord? = null
  private var track: AudioTrack? = null
  private var recordThread: Thread? = null
  private val recording = AtomicBoolean(false)
  private val muted = AtomicBoolean(false)

  override fun definition() = ModuleDefinition {
    Name("SafeherAudio")

    Events("onAudioChunk")

    Function("startPlayback") {
      startPlaybackInternal()
    }

    Function("stopPlayback") {
      stopPlaybackInternal()
    }

    Function("writePlaybackBase64") { base64: String ->
      writePlaybackInternal(base64)
    }

    Function("flushPlayback") {
      try {
        track?.pause()
        track?.flush()
        track?.play()
      } catch (e: Exception) {
        Log.w(TAG, "flushPlayback failed", e)
      }
    }

    Function("startRecording") {
      startRecordingInternal()
    }

    Function("stopRecording") {
      stopRecordingInternal()
    }

    Function("setMuted") { value: Boolean ->
      muted.set(value)
    }

    Function("release") {
      stopRecordingInternal()
      stopPlaybackInternal()
    }

    OnDestroy {
      stopRecordingInternal()
      stopPlaybackInternal()
    }
  }

  private fun startPlaybackInternal() {
    if (track != null) return

    val minBuf = AudioTrack.getMinBufferSize(OUTPUT_RATE, CHANNEL_OUT, ENCODING)
    val bufSize = minBuf.coerceAtLeast(OUTPUT_RATE / 5)

    val attrs = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()

    val format = AudioFormat.Builder()
      .setSampleRate(OUTPUT_RATE)
      .setEncoding(ENCODING)
      .setChannelMask(CHANNEL_OUT)
      .build()

    val created = AudioTrack.Builder()
      .setAudioAttributes(attrs)
      .setAudioFormat(format)
      .setBufferSizeInBytes(bufSize)
      .setTransferMode(AudioTrack.MODE_STREAM)
      .build()

    if (created.state != AudioTrack.STATE_INITIALIZED) {
      created.release()
      throw IllegalStateException("AudioTrack init failed")
    }

    created.play()
    track = created
    Log.i(TAG, "playback started @ ${OUTPUT_RATE}Hz buf=$bufSize")
  }

  private fun stopPlaybackInternal() {
    val t = track ?: return
    track = null
    try {
      t.pause()
      t.flush()
      t.stop()
    } catch (_: Exception) {
    }
    try {
      t.release()
    } catch (_: Exception) {
    }
    Log.i(TAG, "playback stopped")
  }

  private fun writePlaybackInternal(base64: String) {
    val t = track ?: return
    if (base64.isEmpty()) return
    val pcm = Base64.decode(base64, Base64.DEFAULT)
    if (pcm.isEmpty()) return
    var offset = 0
    while (offset < pcm.size) {
      val written = t.write(pcm, offset, pcm.size - offset)
      if (written <= 0) break
      offset += written
    }
  }

  private fun startRecordingInternal() {
    if (recording.get()) return

    val minBuf = AudioRecord.getMinBufferSize(INPUT_RATE, CHANNEL_IN, ENCODING)
    val bufSize = minBuf.coerceAtLeast(READ_BYTES * RING_CHUNKS)

    val created = AudioRecord(
      MediaRecorder.AudioSource.VOICE_COMMUNICATION,
      INPUT_RATE,
      CHANNEL_IN,
      ENCODING,
      bufSize
    )

    if (created.state != AudioRecord.STATE_INITIALIZED) {
      created.release()
      throw IllegalStateException("AudioRecord init failed")
    }

    recorder = created
    recording.set(true)
    created.startRecording()

    recordThread = Thread({
      Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
      // Fixed small reads (~40 ms) regardless of ring buffer size.
      val buffer = ByteArray(READ_BYTES)
      while (recording.get()) {
        val rec = recorder ?: break
        val n = rec.read(buffer, 0, READ_BYTES)
        if (n <= 0) continue

        // While muted: keep draining the mic, but do not emit chunks to JS/WS.
        // Sending silence still looks like activity to Gemini VAD.
        if (muted.get()) continue

        val payload = buffer.copyOf(n)
        val b64 = Base64.encodeToString(payload, Base64.NO_WRAP)
        try {
          val body = Bundle()
          body.putString("data", b64)
          sendEvent("onAudioChunk", body)
        } catch (e: Exception) {
          Log.w(TAG, "sendEvent failed", e)
        }
      }
    }, "SafeherAudioRecord")

    recordThread?.start()
    Log.i(TAG, "recording started @ ${INPUT_RATE}Hz read=$READ_BYTES ring=$bufSize")
  }

  private fun stopRecordingInternal() {
    recording.set(false)
    try {
      recordThread?.join(500)
    } catch (_: Exception) {
    }
    recordThread = null

    val rec = recorder ?: return
    recorder = null
    try {
      rec.stop()
    } catch (_: Exception) {
    }
    try {
      rec.release()
    } catch (_: Exception) {
    }
    Log.i(TAG, "recording stopped")
  }
}
