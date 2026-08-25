package com.mohmmedali.almoraqebpro.services

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.mohmmedali.almoraqebpro.data.AppDatabase
import com.mohmmedali.almoraqebpro.data.RetrofitClient

class SyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {

        return try {

            val db =
                AppDatabase.getDatabase(
                    applicationContext
                )

            val syncManager =
                SyncManager(
                    db,
                    RetrofitClient.apiService
                )

            val result =
                syncManager.syncPendingAttendance()

            if (
                result.syncedCount > 0 ||
                result.rejectedCount > 0
            ) {
                showSyncNotification(
                    result.syncedCount,
                    result.rejectedCount
                )
            }

            if (result.retryNeeded)
                Result.retry()
            else
                Result.success()

        } catch (_: Exception) {

            Result.retry()
        }
    }

    private fun showSyncNotification(
        synced: Int,
        rejected: Int
    ) {

        val channelId =
            "attendance_sync"

        val manager =
            applicationContext.getSystemService(
                Context.NOTIFICATION_SERVICE
            ) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {

            val channel =
                NotificationChannel(
                    channelId,
                    "مزامنة الحضور",
                    NotificationManager.IMPORTANCE_DEFAULT
                )

            manager.createNotificationChannel(
                channel
            )
        }

        if (
            Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(
                applicationContext,
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val message =
            when {
                synced > 0 && rejected > 0 ->
                    "تمت مزامنة $synced سجل، ورفض $rejected سجل بواسطة السيرفر"

                synced > 0 ->
                    "تمت مزامنة $synced بصمة حضور/انصراف بنجاح"

                else ->
                    "تم رفض $rejected سجل حضور بواسطة السيرفر"
            }

        val notification =
            NotificationCompat.Builder(
                applicationContext,
                channelId
            )
                .setSmallIcon(
                    android.R.drawable.stat_notify_sync
                )
                .setContentTitle(
                    "المراقب برو"
                )
                .setContentText(message)
                .setStyle(
                    NotificationCompat.BigTextStyle()
                        .bigText(message)
                )
                .setAutoCancel(true)
                .build()

        manager.notify(
            (System.currentTimeMillis() % Int.MAX_VALUE).toInt(),
            notification
        )
    }
}
