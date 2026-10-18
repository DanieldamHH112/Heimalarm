package de.heimalarm.plugin

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/**
 * Was ohne laufende App gebraucht wird: Filter für Alarm-Benachrichtigungen (kommen aus den
 * Einstellungen der App, `configure`) und ein Puffer für Alarme, die erkannt wurden, bevor die
 * App offen war (z. B. nach einem Neustart). Die App holt sie beim Start ab.
 */
object Native {
    private const val PREFS = "heimalarm"
    private const val MAX_AGE_MS = 10 * 60 * 1000L   // ältere Alarme verfallen

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun configure(ctx: Context, packages: List<String>, words: List<String>, service: Boolean, silent: Boolean = false) {
        prefs(ctx).edit()
            .putString("packages", JSONArray(packages.map { it.lowercase() }).toString())
            .putString("words", JSONArray(words.map { it.lowercase() }).toString())
            .putBoolean("service", service)
            .putBoolean("silent", silent)
            .apply()
    }

    fun silent(ctx: Context) = prefs(ctx).getBoolean("silent", false)

    fun serviceWanted(ctx: Context) = prefs(ctx).getBoolean("service", true)

    private fun list(ctx: Context, key: String): List<String> {
        val a = JSONArray(prefs(ctx).getString(key, "[]"))
        return (0 until a.length()).map { a.getString(it) }.filter { it.isNotBlank() }
    }

    /** Gleiche Regel wie alarmFromNotification in engine.js (grob vorab, genau prüft die App). */
    fun matches(ctx: Context, app: String, title: String, text: String): Boolean {
        val pkgs = list(ctx, "packages")
        if (pkgs.isEmpty() || pkgs.none { app.lowercase().contains(it) }) return false
        val words = list(ctx, "words")
        val body = "$title $text".lowercase()
        return words.isEmpty() || words.any { body.contains(it) }
    }

    @Synchronized
    fun buffer(ctx: Context, app: String, title: String, text: String) {
        val now = System.currentTimeMillis()
        val old = JSONArray(prefs(ctx).getString("pending", "[]"))
        val keep = JSONArray()
        for (i in 0 until old.length()) {
            val o = old.getJSONObject(i)
            if (now - o.optLong("ts") < MAX_AGE_MS) keep.put(o)
        }
        keep.put(JSONObject().put("app", app).put("title", title).put("text", text).put("ts", now))
        prefs(ctx).edit().putString("pending", keep.toString()).apply()
    }

    /** Gepufferte Alarme abholen und leeren. */
    @Synchronized
    fun takePending(ctx: Context): JSONArray {
        val now = System.currentTimeMillis()
        val all = JSONArray(prefs(ctx).getString("pending", "[]"))
        prefs(ctx).edit().remove("pending").apply()
        val out = JSONArray()
        for (i in 0 until all.length()) {
            val o = all.getJSONObject(i)
            if (now - o.optLong("ts") < MAX_AGE_MS) out.put(o)
        }
        return out
    }

    fun startService(ctx: Context) {
        val intent = Intent(ctx, KeepAliveService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent) else ctx.startService(intent)
    }
}

/** Nach dem Einschalten des Handys: Hintergrund-Dienst wieder starten (wenn er an war). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val a = intent.action ?: return
        if (a != Intent.ACTION_BOOT_COMPLETED && a != Intent.ACTION_MY_PACKAGE_REPLACED && a != "android.intent.action.QUICKBOOT_POWERON") return
        if (!Native.serviceWanted(context)) return
        try { Native.startService(context) } catch (_: Exception) { /* Android verbietet es manchmal – App öffnet sich dann beim Alarm */ }
    }
}
