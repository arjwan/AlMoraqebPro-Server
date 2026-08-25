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
                val challenge = api.getChallenge(record.employeeId, record.deviceId)
                val challengeId = challenge.body()?.challengeId
                if (!challenge.isSuccessful || challenge.body()?.success != true || challengeId.isNullOrBlank()) {
                    return false
                }
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
                } else if (response.code() >= 500 || response.code() == 429) {
                    return false
                } else {
                    db.attendanceDao().markSynced(record.id)
                }
            } catch (e: Exception) {
                return false
            }
        }
        return true
    }
}
