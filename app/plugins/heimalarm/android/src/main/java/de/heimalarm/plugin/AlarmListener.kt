package de.heimalarm.plugin

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/** Leitet neue Benachrichtigungen an die App weiter; gefiltert wird in der App (A6). */
class AlarmListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName == packageName) return
        val extras = sbn.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        HeimalarmPlugin.instance?.emitNotification(sbn.packageName, title, text)
    }
}
