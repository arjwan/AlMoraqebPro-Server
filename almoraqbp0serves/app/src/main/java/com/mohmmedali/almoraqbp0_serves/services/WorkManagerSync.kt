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
import com.mohmmedali.almoraqebpro.R
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

            val attendanceResult =
                syncManager.syncPendingAttendance()

            val serviceResult =
                syncManager.syncPendingServiceRequests()

            val synced =
                attendanceResult.syncedCount +
                serviceResult.syncedCount

            val rejected =
                attendanceResult.rejectedCount +
                serviceResult.rejectedCount

            if (
                synced > 0 ||
                rejected > 0
            ) {
                showSyncNotification(
                    synced,
                    rejected
                )
            }

            if (
                attendanceResult.retryNeeded ||
                serviceResult.retryNeeded
            )
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
                    applicationContext.getString(R.string.sync_channel_name),
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
                    applicationContext.getString(R.string.sync_message_both, synced, rejected)

                synced > 0 ->
                    applicationContext.getString(R.string.sync_message_synced, synced)

                else ->
                    applicationContext.getString(R.string.sync_message_rejected, rejected)
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
                    applicationContext.getString(R.string.sync_notification_title)
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
