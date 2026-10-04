package expo.modules.safeheraudio

import android.util.Log

/**
 * Lightweight bridge so [FakeCallGuardService] can emit Expo module events.
 */
object FakeCallBridge {
  private const val TAG = "FakeCallBridge"

  @Volatile
  var emitEvent: ((name: String, body: Map<String, Any?>) -> Unit)? = null

  fun emit(name: String, body: Map<String, Any?>) {
    val emitter = emitEvent
    if (emitter == null) {
      Log.w(TAG, "drop event $name — module not ready")
      return
    }
    try {
      emitter(name, body)
    } catch (e: Exception) {
      Log.w(TAG, "emit $name failed", e)
    }
  }
}
