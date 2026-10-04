package expo.modules.safeheraudio

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.Process
import android.telephony.SmsManager
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
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
  private val playbackPaused = AtomicBoolean(false)

  override fun definition() = ModuleDefinition {
    Name("SafeherAudio")

    Events(
      "onAudioChunk",
      "onFakeCallArmed",
      "onFakeCallCancelled",
      "onFakeCallFire",
    )

    OnCreate {
      FakeCallBridge.emitEvent = { name, body ->
        sendEvent(name, body)
      }
    }

    Function("startPlayback") {
      startPlaybackInternal()
    }

    Function("stopPlayback") {
      stopPlaybackInternal()
    }

    Function("writePlaybackBase64") { base64: String ->
      writePlaybackInternal(base64)
    }

    Function("writePlaybackPcm") { data: ByteArray ->
      writePlaybackPcmInternal(data)
    }

    Function("flushPlayback") {
      try {
        track?.pause()
        track?.flush()
        if (!playbackPaused.get()) {
          track?.play()
        }
      } catch (e: Exception) {
        Log.w(TAG, "flushPlayback failed", e)
      }
    }

    Function("setPlaybackPaused") { value: Boolean ->
      playbackPaused.set(value)
      try {
        if (value) {
          track?.pause()
          track?.flush()
          Log.i(TAG, "playback paused")
        } else if (track != null) {
          track?.play()
          Log.i(TAG, "playback resumed")
        }
      } catch (e: Exception) {
        Log.w(TAG, "setPlaybackPaused failed", e)
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
      playbackPaused.set(false)
      stopRecordingInternal()
      stopPlaybackInternal()
    }

    Function("startFakeCallGuard") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        FakeCallGuardService.start(ctx)
      }
      null
    }

    Function("stopFakeCallGuard") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        FakeCallGuardService.stop(ctx)
      }
      null
    }

    Function("cancelArmedFakeCall") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        FakeCallGuardService.cancelArmed(ctx)
      }
      null
    }

    Function("stopIncomingCallAlert") {
      val ctx = appContext.reactContext
      if (ctx != null) {
        FakeCallGuardService.stopRing(ctx)
      }
      null
    }

    Function("isFakeCallArmed") {
      FakeCallGuardService.isArmed
    }

    AsyncFunction("sendSmsDirect") { phone: String, body: String ->
      sendSmsDirectInternal(phone, body)
    }

    OnDestroy {
      FakeCallBridge.emitEvent = null
      stopRecordingInternal()
      stopPlaybackInternal()
    }
  }

  /** Returns "sent" | "denied" | "error:<reason>" */
  private fun sendSmsDirectInternal(phone: String, body: String): String {
    val ctx =
      appContext.reactContext
        ?: appContext.currentActivity
        ?: return "error:no_context"
    val appCtx = ctx.applicationContext
    val to = normalizePhone(phone)
    if (to.isEmpty()) {
      Log.w(TAG, "sendSmsDirect empty phone raw='$phone'")
      return "error:bad_phone"
    }
    if (body.isBlank()) {
      return "error:empty_body"
    }

    val grantedSms =
      ContextCompat.checkSelfPermission(appCtx, Manifest.permission.SEND_SMS) ==
        PackageManager.PERMISSION_GRANTED
    if (!grantedSms) {
      Log.w(TAG, "SEND_SMS not granted")
      return "denied"
    }
    val grantedPhone =
      ContextCompat.checkSelfPermission(appCtx, Manifest.permission.READ_PHONE_STATE) ==
        PackageManager.PERMISSION_GRANTED
    if (!grantedPhone) {
      Log.w(TAG, "READ_PHONE_STATE not granted — send may SecurityException")
    }

    val tm =
      appCtx.getSystemService(android.content.Context.TELEPHONY_SERVICE)
        as? android.telephony.TelephonyManager
    try {
      if (tm != null && !tm.isSmsCapable) {
        Log.w(TAG, "device is not SMS capable")
        return "error:not_sms_capable"
      }
    } catch (e: Exception) {
      Log.w(TAG, "isSmsCapable check failed", e)
    }

    val managers = buildSmsManagers(appCtx)
    if (managers.isEmpty()) {
      return "error:no_sms_manager"
    }

    var lastError: String = "unknown"
    for ((label, smsManager) in managers) {
      try {
        val parts = ArrayList(smsManager.divideMessage(body))
        Log.i(TAG, "SMS try via=$label to=$to parts=${parts.size} bodyLen=${body.length}")
        if (parts.size <= 1) {
          smsManager.sendTextMessage(to, null, body, null, null)
        } else {
          smsManager.sendMultipartTextMessage(to, null, parts, null, null)
        }
        Log.i(TAG, "SMS accepted by framework via=$label to=$to")
        return "sent"
      } catch (e: SecurityException) {
        lastError = "security:${e.message}"
        Log.w(TAG, "SMS security via=$label", e)
      } catch (e: IllegalArgumentException) {
        lastError = "illegal_arg:${e.message}"
        Log.w(TAG, "SMS illegal via=$label", e)
      } catch (e: Exception) {
        lastError = "${e.javaClass.simpleName}:${e.message}"
        Log.w(TAG, "SMS failed via=$label", e)
      }
    }
    return "error:$lastError"
  }

  private fun normalizePhone(raw: String): String {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return ""
    val digits =
      if (trimmed.startsWith("+")) {
        "+" + trimmed.drop(1).filter { it.isDigit() }
      } else {
        trimmed.filter { it.isDigit() }
      }
    // Polish domestic 9-digit → E.164 (helps some carriers / Pixel telephony).
    if (!digits.startsWith("+") && digits.length == 9 && digits.first() in '4'..'8') {
      return "+48$digits"
    }
    if (!digits.startsWith("+") && digits.length == 11 && digits.startsWith("48")) {
      return "+$digits"
    }
    return digits
  }

  private fun buildSmsManagers(
    ctx: android.content.Context,
  ): List<Pair<String, SmsManager>> {
    val out = LinkedHashMap<String, SmsManager>()
    fun add(label: String, manager: SmsManager?) {
      if (manager != null) out.putIfAbsent(label, manager)
    }

    try {
      @Suppress("DEPRECATION")
      add("default", SmsManager.getDefault())
    } catch (e: Exception) {
      Log.w(TAG, "getDefault failed", e)
    }

    val subId = try {
      SmsManager.getDefaultSmsSubscriptionId()
    } catch (_: Exception) {
      -1
    }

    if (subId != android.telephony.SubscriptionManager.INVALID_SUBSCRIPTION_ID && subId != -1) {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          add(
            "sub_$subId",
            ctx.getSystemService(SmsManager::class.java)?.createForSubscriptionId(subId),
          )
        }
        @Suppress("DEPRECATION")
        add("sub_legacy_$subId", SmsManager.getSmsManagerForSubscriptionId(subId))
      } catch (e: Exception) {
        Log.w(TAG, "subscription SmsManager failed", e)
      }
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        add("system_service", ctx.getSystemService(SmsManager::class.java))
      } catch (e: Exception) {
        Log.w(TAG, "SMS_SERVICE failed", e)
      }
    }

    return out.toList()
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
    if (playbackPaused.get()) return
    val t = track ?: return
    if (base64.isEmpty()) return
    val pcm = Base64.decode(base64, Base64.DEFAULT)
    if (pcm.isEmpty()) return
    writePlaybackPcmInternal(pcm)
  }

  private fun writePlaybackPcmInternal(pcm: ByteArray) {
    if (playbackPaused.get()) return
    val t = track ?: return
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
