package com.mohmmedali.almoraqebpro.services

import com.mohmmedali.almoraqebpro.data.ApiService
import com.mohmmedali.almoraqebpro.data.AppDatabase
import com.mohmmedali.almoraqebpro.data.AttendanceRequest

class SyncManager(
    private val db: AppDatabase,
    private val api: ApiService
) {

    suspend fun syncPendingAttendance() {
        val pending = db.attendanceDao().getUnsynced()
        for (record in pending) {
            val request = AttendanceRequest(
                employeeId = record.employeeId,
                deviceId = record.deviceId,
                challengeId = record.challengeId,
                fingerprintToken = record.fingerprintToken,
                latitude = record.latitude,
                longitude = record.longitude,
                type = record.type,
                timestamp = record.timestamp
            )
            try {
                val response = api.sendAttendance(request)
                if (response.isSuccessful && response.body()?.success == true) {
                    db.attendanceDao().markSynced(record.id)
                }
            } catch (e: Exception) {
                break
            }
        }
    }
}