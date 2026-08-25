package com.mohmmedali.almoraqebpro.services

import com.mohmmedali.almoraqebpro.data.ApiService
import com.mohmmedali.almoraqebpro.data.AppDatabase
import com.mohmmedali.almoraqebpro.data.AttendanceRequest

class SyncManager(
    private val db: AppDatabase,
    private val api: ApiService
) {

    suspend fun syncPendingAttendance(): Boolean {
        val pending = db.attendanceDao().getUnsynced()
        for (record in pending) {
            try {
                val challengeResponse = api.getChallenge(record.employeeId, record.deviceId)
                val challengeId = challengeResponse.body()?.challengeId
                if (!challengeResponse.isSuccessful || challengeId.isNullOrBlank()) return false
            val request = AttendanceRequest(
                employeeId = record.employeeId,
                deviceId = record.deviceId,
                challengeId = challengeId,
                fingerprintToken = record.fingerprintToken,
                latitude = record.latitude,
                longitude = record.longitude,
                type = record.type,
                timestamp = record.timestamp
            )
                val response = api.sendAttendance(request)
                if (response.isSuccessful && response.body()?.success == true) {
                    db.attendanceDao().markSynced(record.id)
                } else if (response.code() in 400..499) {
                    // Invalid records must not block later valid fingerprints forever.
                    db.attendanceDao().markSynced(record.id)
                } else {
                    return false
                }
            } catch (e: Exception) {
                return false
            }
        }
        return true
    }
}
