const {
  withAndroidManifest,
  AndroidConfig,
  createRunOncePlugin,
} = require("expo/config-plugins");

/**
 * Ensure MainActivity can present the fake incoming call over the lockscreen.
 */
function withSafeHerLockscreen(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    const activities = app.activity ?? [];
    for (const activity of activities) {
      const name = activity.$?.["android:name"] ?? "";
      if (!name.endsWith(".MainActivity") && name !== "MainActivity") continue;
      activity.$["android:showWhenLocked"] = "true";
      activity.$["android:turnScreenOn"] = "true";
    }

    const permissions = [
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.VIBRATE",
      "android.permission.WAKE_LOCK",
      "android.permission.USE_FULL_SCREEN_INTENT",
      "android.permission.SEND_SMS",
      "android.permission.READ_PHONE_STATE",
    ];
    for (const permission of permissions) {
      AndroidConfig.Permissions.ensurePermission(manifest, permission);
    }

    return cfg;
  });
}

module.exports = createRunOncePlugin(
  withSafeHerLockscreen,
  "with-safeher-lockscreen",
  "1.0.0",
);
