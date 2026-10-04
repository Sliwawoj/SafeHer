package expo.modules.safeheraudio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Sticky foreground guard: lockscreen-visible notification + 30s delayed fake-call trigger.
 */
class FakeCallGuardService : Service() {
  companion object {
    private const val TAG = "FakeCallGuard"
    const val CHANNEL_ID = "safeher_guard_v2"
    const val NOTIFICATION_ID = 42001
    private const val LEGACY_CHANNEL_ID = "safeher_guard"

    const val ACTION_START = "expo.modules.safeheraudio.GUARD_START"
    const val ACTION_STOP = "expo.modules.safeheraudio.GUARD_STOP"
    const val ACTION_TRIGGER = "expo.modules.safeheraudio.GUARD_TRIGGER"
    const val ACTION_CANCEL_ARMED = "expo.modules.safeheraudio.GUARD_CANCEL_ARMED"
    const val ACTION_STOP_RING = "expo.modules.safeheraudio.GUARD_STOP_RING"

    const val EXTRA_FAKE_CALL = "safeher_fake_call"

    private const val DELAY_MS = 30_000L

    @Volatile
    var isRunning: Boolean = false
      private set

    @Volatile
    var isArmed: Boolean = false
      private set

    fun start(context: Context) {
      val intent = Intent(context, FakeCallGuardService::class.java).setAction(ACTION_START)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context.startService(
        Intent(context, FakeCallGuardService::class.java).setAction(ACTION_STOP),
      )
    }

    fun cancelArmed(context: Context) {
      context.startService(
        Intent(context, FakeCallGuardService::class.java).setAction(ACTION_CANCEL_ARMED),
      )
    }

    fun stopRing(context: Context) {
      context.startService(
        Intent(context, FakeCallGuardService::class.java).setAction(ACTION_STOP_RING),
      )
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private var fireRunnable: Runnable? = null
  private var ringtone: Ringtone? = null
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        cancelCountdown(emit = false)
        stopIncomingAlert()
        isRunning = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        return START_NOT_STICKY
      }
      ACTION_TRIGGER -> onTriggerTap()
      ACTION_CANCEL_ARMED -> cancelCountdown(emit = true)
      ACTION_STOP_RING -> stopIncomingAlert()
      else -> {
        // ACTION_START or null (system restart)
        promoteForeground()
        isRunning = true
      }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    cancelCountdown(emit = false)
    stopIncomingAlert()
    isRunning = false
    isArmed = false
    releaseWakeLock()
    super.onDestroy()
  }

  private fun promoteForeground() {
    ensureChannel()
    val notification = buildNotification(armed = isArmed)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val mgr = getSystemService(NotificationManager::class.java) ?: return
    // Drop the old LOW/silent channel — Android won't raise importance after creation.
    try {
      mgr.deleteNotificationChannel(LEGACY_CHANNEL_ID)
    } catch (_: Exception) {
    }
    if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
    val channel =
      NotificationChannel(
        CHANNEL_ID,
        "SafeHer Active",
        NotificationManager.IMPORTANCE_DEFAULT,
      ).apply {
        description = "Ochrona w tle — widoczna na ekranie blokady"
        setShowBadge(false)
        setSound(null, null)
        enableVibration(false)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }
    mgr.createNotificationChannel(channel)
  }

  private fun triggerPendingIntent(): PendingIntent {
    val intent =
      Intent(this, FakeCallGuardService::class.java).setAction(ACTION_TRIGGER)
    val flags =
      PendingIntent.FLAG_UPDATE_CURRENT or
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    return PendingIntent.getService(this, 1, intent, flags)
  }

  private fun buildNotification(armed: Boolean): Notification {
    val title = "SafeHer Active"
    val text =
      if (armed) {
        "Sprawdzanie statusu…"
      } else {
        "Ochrona w tle aktywna"
      }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(android.R.drawable.ic_menu_info_details)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setContentIntent(triggerPendingIntent())
      .addAction(
        0,
        "Sprawdź status",
        triggerPendingIntent(),
      )
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .build()
  }

  private fun refreshNotification() {
    val mgr = getSystemService(NotificationManager::class.java) ?: return
    mgr.notify(NOTIFICATION_ID, buildNotification(armed = isArmed))
  }

  private fun onTriggerTap() {
    if (isArmed) {
      shortVibrate()
      cancelCountdown(emit = true)
      return
    }
    shortVibrate()
    armCountdown()
  }

  private fun armCountdown() {
    cancelCountdown(emit = false)
    isArmed = true
    refreshNotification()
    FakeCallBridge.emit("onFakeCallArmed", mapOf("delayMs" to DELAY_MS))
    Log.i(TAG, "armed — firing in ${DELAY_MS}ms")

    val runnable =
      Runnable {
        fireRunnable = null
        fireFakeCall()
      }
    fireRunnable = runnable
    handler.postDelayed(runnable, DELAY_MS)
  }

  private fun cancelCountdown(emit: Boolean) {
    fireRunnable?.let { handler.removeCallbacks(it) }
    fireRunnable = null
    val wasArmed = isArmed
    isArmed = false
    if (isRunning) {
      refreshNotification()
    }
    if (emit && wasArmed) {
      FakeCallBridge.emit("onFakeCallCancelled", emptyMap())
      Log.i(TAG, "countdown cancelled")
    }
  }

  private fun fireFakeCall() {
    isArmed = false
    refreshNotification()
    acquireWakeLock()
    startIncomingAlert()
    FakeCallBridge.emit("onFakeCallFire", emptyMap())
    bringAppToFront()
    Log.i(TAG, "fake call fired")
  }

  private fun bringAppToFront() {
    val launch =
      packageManager.getLaunchIntentForPackage(packageName)?.apply {
        addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_SINGLE_TOP or
            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
            Intent.FLAG_ACTIVITY_CLEAR_TOP,
        )
        putExtra(EXTRA_FAKE_CALL, true)
      } ?: return
    startActivity(launch)
  }

  private fun startIncomingAlert() {
    stopIncomingAlert()
    try {
      val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      ringtone =
        RingtoneManager.getRingtone(applicationContext, uri)?.also { tone ->
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            tone.isLooping = true
          }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            tone.audioAttributes =
              AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
          }
          tone.play()
        }
    } catch (e: Exception) {
      Log.w(TAG, "ringtone failed", e)
    }
    startRingVibrate()
  }

  private fun stopIncomingAlert() {
    try {
      ringtone?.stop()
    } catch (_: Exception) {
    }
    ringtone = null
    stopRingVibrate()
    releaseWakeLock()
  }

  private fun shortVibrate() {
    try {
      val vibrator = vibrator()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator.vibrate(VibrationEffect.createOneShot(45, VibrationEffect.DEFAULT_AMPLITUDE))
      } else {
        @Suppress("DEPRECATION")
        vibrator.vibrate(45)
      }
    } catch (e: Exception) {
      Log.w(TAG, "vibrate failed", e)
    }
  }

  private fun startRingVibrate() {
    try {
      val vibrator = vibrator()
      val pattern = longArrayOf(0, 800, 400, 800, 400)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0))
      } else {
        @Suppress("DEPRECATION")
        vibrator.vibrate(pattern, 0)
      }
    } catch (e: Exception) {
      Log.w(TAG, "ring vibrate failed", e)
    }
  }

  private fun stopRingVibrate() {
    try {
      vibrator().cancel()
    } catch (_: Exception) {
    }
  }

  private fun vibrator(): Vibrator {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val mgr = getSystemService(VibratorManager::class.java)
      mgr.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      getSystemService(VIBRATOR_SERVICE) as Vibrator
    }
  }

  private fun acquireWakeLock() {
    releaseWakeLock()
    try {
      val pm = getSystemService(PowerManager::class.java) ?: return
      @Suppress("DEPRECATION")
      val wl =
        pm.newWakeLock(
          PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
          "safeher:fakecall",
        )
      wl.setReferenceCounted(false)
      wl.acquire(60_000)
      wakeLock = wl
    } catch (e: Exception) {
      Log.w(TAG, "wakelock failed", e)
    }
  }

  private fun releaseWakeLock() {
    try {
      wakeLock?.let { if (it.isHeld) it.release() }
    } catch (_: Exception) {
    }
    wakeLock = null
  }
}
