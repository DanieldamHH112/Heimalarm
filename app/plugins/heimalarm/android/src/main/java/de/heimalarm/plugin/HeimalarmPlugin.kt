package de.heimalarm.plugin

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class ServiceArgs {
    var enabled: Boolean = false
}

@TauriPlugin
class HeimalarmPlugin(private val activity: Activity) : Plugin(activity) {

    companion object {
        var instance: HeimalarmPlugin? = null
    }

    override fun load(webView: WebView) {
        instance = this
    }

    private fun hasNotificationAccess(): Boolean {
        val enabled = Settings.Secure.getString(activity.contentResolver, "enabled_notification_listeners") ?: return false
        val me = ComponentName(activity, AlarmListener::class.java).flattenToString()
        return enabled.split(":").any { it == me }
    }

    @Command
    fun status(invoke: Invoke) {
        val pm = activity.getSystemService(Context.POWER_SERVICE) as PowerManager
        val ret = JSObject()
        ret.put("supported", true)
        ret.put("batteryOptimized", !pm.isIgnoringBatteryOptimizations(activity.packageName))
        ret.put("notificationAccess", hasNotificationAccess())
        ret.put("service", KeepAliveService.running)
        invoke.resolve(ret)
    }

    /** E6 – Ausnahme von der Akku-Optimierung anfragen */
    @Command
    fun openBatterySettings(invoke: Invoke) {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
        intent.data = Uri.parse("package:" + activity.packageName)
        activity.startActivity(intent)
        invoke.resolve(JSObject())
    }

    /** A1/A6 – Zugriff auf Benachrichtigungen freigeben */
    @Command
    fun openNotificationAccess(invoke: Invoke) {
        activity.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        invoke.resolve(JSObject())
    }

    /** Hintergrund-Dienst ein-/ausschalten */
    @Command
    fun setService(invoke: Invoke) {
        val args = invoke.parseArgs(ServiceArgs::class.java)
        val intent = Intent(activity, KeepAliveService::class.java)
        if (args.enabled) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) activity.startForegroundService(intent)
            else activity.startService(intent)
        } else {
            activity.stopService(intent)
        }
        invoke.resolve(JSObject())
    }

    fun emitNotification(app: String, title: String, text: String) {
        val data = JSObject()
        data.put("app", app)
        data.put("title", title)
        data.put("text", text)
        trigger("notification", data)
    }
}
