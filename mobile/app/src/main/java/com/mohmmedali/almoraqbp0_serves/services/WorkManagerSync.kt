package com.mohmmedali.almoraqebpro.services

import android.content.Context
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
            val db = AppDatabase.getDatabase(applicationContext)
            val syncManager = SyncManager(db, RetrofitClient.apiService)
            if (syncManager.syncPendingAttendance()) Result.success() else Result.retry()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
