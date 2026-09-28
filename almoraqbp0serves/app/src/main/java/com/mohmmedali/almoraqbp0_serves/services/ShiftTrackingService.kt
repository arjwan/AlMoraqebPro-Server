package com.mohmmedali.almoraqebpro.services

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.LocationManager as SystemLocationManager
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.mohmmedali.almoraqebpro.R
import com.mohmmedali.almoraqebpro.data.LocationUpdateRequest
import com.mohmmedali.almoraqebpro.data.RetrofitClient
import com.mohmmedali.almoraqebpro.data.TrackingInterruptionRequest
import com.mohmmedali.almoraqebpro.ui.NotificationActivity
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** يرسل موقع الشفت فقط؛ لا يقرأ الموقع خارج فترة العمل. */
class ShiftTrackingService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var polling: Job? = null
    private var interruptionShown = false
    private val location by lazy { LocationManager(this) }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("shift_tracking", "تتبع شفت العمل", NotificationManager.IMPORTANCE_LOW))
        val link = PendingIntent.getActivity(this, 0,
            Intent(this, NotificationActivity::class.java).putExtra("tracking_only", true),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification: Notification = NotificationCompat.Builder(this, "shift_tracking")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("المراقب برو")
            .setContentText("التحقق من شفت العمل وتنبيهات الموقع")
            .setContentIntent(link)
            .setOngoing(true).build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(202, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        else startForeground(202, notification)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (polling?.isActive != true) polling = scope.launch {
            while (true) {
                try { tick() } catch (_: Exception) { /* يعاد الفحص عند توفر الشبكة */ }
                delay(60_000)
            }
        }
        return START_STICKY
    }

    private fun batteryPercent(): Int? {
        val battery = getSystemService(BATTERY_SERVICE) as BatteryManager
        return battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).takeIf { it in 0..100 }
    }

    private fun gpsAvailable(): Boolean {
        val system = getSystemService(LOCATION_SERVICE) as SystemLocationManager
        return location.hasPermission() && (system.isProviderEnabled(SystemLocationManager.GPS_PROVIDER) ||
            system.isProviderEnabled(SystemLocationManager.NETWORK_PROVIDER))
    }

    private fun showInterruption() {
        if (interruptionShown) return
        interruptionShown = true
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("tracking_alerts", "تنبيهات موقع العمل", NotificationManager.IMPORTANCE_HIGH))
        val message = "أنت الآن ضمن فترة العمل. يرجى تشغيل الموقع للاستمرار في تسجيل الدوام."
        val link = PendingIntent.getActivity(this, 1,
            Intent(this, NotificationActivity::class.java).putExtra("tracking_only", true),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        manager.notify(203, NotificationCompat.Builder(this, "tracking_alerts")
            .setSmallIcon(R.mipmap.ic_launcher).setContentTitle("تنبيه موقع العمل")
            .setContentText(message).setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setContentIntent(link).setAutoCancel(true).build())
    }

    private suspend fun tick() {
        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
        val employeeId = prefs.getString("employeeId", "").orEmpty()
        val companyId = prefs.getString("companyId", "").orEmpty()
        val deviceId = prefs.getString("deviceId", "").orEmpty()
        if (!prefs.getBoolean("authenticated", false) || employeeId.isEmpty() || companyId.isEmpty() || deviceId.isEmpty()) {
            stopSelf()
            return
        }
        val status = RetrofitClient.apiService.getTrackingStatus(employeeId, deviceId)
        if (!status.isSuccessful || status.body()?.trackingRequired != true) return
        val battery = batteryPercent()
        if (!gpsAvailable()) {
            showInterruption()
            RetrofitClient.apiService.reportTrackingInterruption(
                TrackingInterruptionRequest(employeeId, companyId, deviceId, battery))
            return
        }
        val point = CompletableDeferred<android.location.Location?>()
        location.getCurrentLocation { point.complete(it) }
        val current = withTimeoutOrNull(15_000) { point.await() }
        if (current == null) {
            showInterruption()
            RetrofitClient.apiService.reportTrackingInterruption(
                TrackingInterruptionRequest(employeeId, companyId, deviceId, battery))
            return
        }
        val date = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
        RetrofitClient.apiService.sendLocation(LocationUpdateRequest(employeeId, companyId, deviceId,
            current.latitude, current.longitude, date, battery))
        interruptionShown = false
    }

    override fun onDestroy() {
        polling?.cancel()
        scope.cancel()
        super.onDestroy()
    }
}
