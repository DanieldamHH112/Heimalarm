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
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class UpdateArgs {
    var url: String = ""
    var shaUrl: String = ""
}

@InvokeArg
class ServiceArgs {
    var enabled: Boolean = false
}

@TauriPlugin
class HeimalarmPlugin(private val activity: Activity) : Plugin(activity) {

    companion object {
        var instance: HeimalarmPlugin? = null
    }

    // Abstand zu Status- und Navigationsleiste in CSS-Pixeln (Android-WebView liefert env(safe-area-inset-*) oft als 0)
    private var insetTop = 0
    private var insetBottom = 0

    override fun load(webView: WebView) {
        instance = this
        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val d = activity.resources.displayMetrics.density
            insetTop = Math.round(bars.top / d)
            insetBottom = Math.round(bars.bottom / d)
            applyInsets(webView)
            insets
        }
        ViewCompat.requestApplyInsets(webView)
    }

    private fun applyInsets(webView: WebView) {
        val js = "document.documentElement.style.setProperty('--inset-top','${insetTop}px');" +
            "document.documentElement.style.setProperty('--inset-bottom','${insetBottom}px');"
        webView.post { webView.evaluateJavascript(js, null) }
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
        ret.put("insetTop", insetTop)
        ret.put("insetBottom", insetBottom)
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

    /**
     * Update: APK aus dem GitHub-Release laden, SHA256 mit <datei>.sha256 vergleichen und den
     * Android-Installationsdialog öffnen. Fehlt die Erlaubnis „Apps aus dieser Quelle“, öffnet
     * sich zuerst diese Einstellung ({ needsPermission: true }).
     */
    @Command
    fun installApk(invoke: Invoke) {
        val args = invoke.parseArgs(UpdateArgs::class.java)
        val prefix = "https://github.com/DanieldamHH112/Heimalarm/releases/download/"
        if (!args.url.startsWith(prefix) || !args.shaUrl.startsWith(prefix)) {
            invoke.reject("Update nur aus den Heimalarm-Releases auf GitHub (mit Prüfsumme)")
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.packageManager.canRequestPackageInstalls()) {
            val i = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.packageName))
            activity.startActivity(i)
            val ret = JSObject(); ret.put("needsPermission", true); invoke.resolve(ret)
            return
        }
        Thread {
            try {
                val dir = java.io.File(activity.cacheDir, "update").apply { mkdirs() }
                val apk = java.io.File(dir, "Heimalarm-update.apk")
                download(args.url, apk)
                val expected = String(fetchBytes(args.shaUrl)).trim().split(Regex("\\s+"))[0]
                val actual = sha256(apk)
                if (!actual.equals(expected, ignoreCase = true)) {
                    apk.delete()
                    invoke.reject("Prüfsumme stimmt nicht – Download verworfen")
                    return@Thread
                }
                val uri = androidx.core.content.FileProvider.getUriForFile(activity, activity.packageName + ".heimalarm.update", apk)
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.runOnUiThread { activity.startActivity(intent) }
                val ret = JSObject(); ret.put("needsPermission", false); invoke.resolve(ret)
            } catch (e: Exception) {
                invoke.reject("Download fehlgeschlagen: " + (e.message ?: e.javaClass.simpleName))
            }
        }.start()
    }

    private fun open(url: String): java.net.HttpURLConnection {
        val c = java.net.URL(url).openConnection() as java.net.HttpURLConnection
        c.instanceFollowRedirects = true
        c.connectTimeout = 15000
        c.readTimeout = 60000
        c.setRequestProperty("User-Agent", "Heimalarm-Updater")
        if (c.responseCode !in 200..299) throw java.io.IOException("HTTP " + c.responseCode)
        return c
    }

    private fun fetchBytes(url: String): ByteArray = open(url).inputStream.use { it.readBytes() }

    private fun download(url: String, target: java.io.File) {
        open(url).inputStream.use { input -> target.outputStream().use { input.copyTo(it) } }
    }

    private fun sha256(file: java.io.File): String {
        val md = java.security.MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(64 * 1024)
            while (true) { val n = input.read(buf); if (n <= 0) break; md.update(buf, 0, n) }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    fun emitNotification(app: String, title: String, text: String) {
        val data = JSObject()
        data.put("app", app)
        data.put("title", title)
        data.put("text", text)
        trigger("notification", data)
    }
}
