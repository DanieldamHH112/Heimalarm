package de.heimalarm.plugin

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/** Leitet neue Benachrichtigungen an die App weiter; gefiltert wird in der App (A6).
 *  Alarm-Apps legen den vollständigen Einsatztext oft nur in den ausgeklappten Teil
 *  (Langtext, mehrere Zeilen) – darum alles mitlesen, was die Benachrichtigung enthält. */
class AlarmListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName == packageName) return
        val extras = sbn.notification.extras
        fun str(key: String) = extras.getCharSequence(key)?.toString()?.trim() ?: ""
        val title = str(Notification.EXTRA_TITLE_BIG).ifEmpty { str(Notification.EXTRA_TITLE) }
        val short = str(Notification.EXTRA_TEXT)
        val big = str(Notification.EXTRA_BIG_TEXT)
        val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.joinToString("\n") { it.toString().trim() } ?: ""
        // Langtext enthält meist auch die Kurzzeile – dann nicht doppelt
        val body = listOf(if (big.length >= short.length && big.contains(short)) big else listOf(short, big).filter { it.isNotEmpty() }.joinToString("\n"), lines)
            .filter { it.isNotEmpty() }.distinct().joinToString("\n")
        val extra = listOf(str(Notification.EXTRA_SUB_TEXT), str(Notification.EXTRA_SUMMARY_TEXT), str(Notification.EXTRA_INFO_TEXT))
            .filter { it.isNotEmpty() && !body.contains(it) }.distinct().joinToString(" · ")
        val text = if (extra.isEmpty()) body else "$body\n$extra"
        val plugin = HeimalarmPlugin.instance?.takeIf { it.alive() }
        if (plugin != null) {
            plugin.emitNotification(sbn.packageName, title, text)
        } else if (Native.matches(this, sbn.packageName, title, text)) {
            // App läuft nicht (z. B. nach Neustart): merken und Heimalarm über die Vollbild-Meldung öffnen
            Native.buffer(this, sbn.packageName, title, text)
            // „Bei Alarm aus“: nur leise Mitteilung, damit der Alarm beim Öffnen weitergeleitet werden kann
            AlarmSound.notifyAlarm(this, "Heimalarm: Alarm erkannt", title.ifEmpty { "Tippen zum Öffnen" }, !Native.silent(this))
        }
    }
}
