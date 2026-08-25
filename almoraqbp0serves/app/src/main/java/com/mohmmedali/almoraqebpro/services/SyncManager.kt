package com.mohmmedali.almoraqebpro.services

import com.mohmmedali.almoraqebpro.data.ApiService
import com.mohmmedali.almoraqebpro.data.AppDatabase
import com.mohmmedali.almoraqebpro.data.AttendanceRequest

data class SyncResult(
    val syncedCount: Int,
    val rejectedCount: Int,
    val retryNeeded: Boolean
)

class SyncManager(
    private val db: AppDatabase,
    private val api: ApiService
) {

    suspend fun syncPendingAttendance(): SyncResult {

        val pending = db.attendanceDao().getUnsynced()

        var syncedCount = 0
        var rejectedCount = 0

        for (record in pending) {

            try {

                /*
                 * مهم:
                 * لا نستخدم challengeId القديم المخزن Offline.
                 * عند عودة الإنترنت نطلب Challenge جديدًا من السيرفر.
                 */
                val challengeResponse =
                    api.getChallenge(
                        record.employeeId,
                        record.deviceId
                    )

                val challengeId =
                    challengeResponse.body()?.challengeId

                if (
                    !challengeResponse.isSuccessful ||
                    challengeId.isNullOrBlank()
                ) {

                    if (challengeResponse.code() in 400..499) {
                        /*
                         * رفض دائم مثل جهاز غير مصرح.
                         * لا نعيد المحاولة إلى الأبد.
                         */
                        db.attendanceDao().markSynced(record.id)
                        rejectedCount++
                        continue
                    }

                    return SyncResult(
                        syncedCount,
                        rejectedCount,
                        true
                    )
                }

                val request =
                    AttendanceRequest(
                        employeeId = record.employeeId,
                        deviceId = record.deviceId,
                        challengeId = challengeId,
                        fingerprintToken = record.fingerprintToken,
                        latitude = record.latitude,
                        longitude = record.longitude,
                        type = record.type,
                        timestamp = record.timestamp
                    )

                val response =
                    api.sendAttendance(request)

                if (
                    response.isSuccessful &&
                    response.body()?.success == true
                ) {

                    db.attendanceDao()
                        .markSynced(record.id)

                    syncedCount++

                } else if (
                    response.code() in 400..499
                ) {

                    /*
                     * رفض نهائي من السيرفر:
                     * خارج الشفت، خارج الموقع،
                     * جهاز غير مصرح، إلخ.
                     */
                    db.attendanceDao()
                        .markSynced(record.id)

                    rejectedCount++

                } else {

                    return SyncResult(
                        syncedCount,
                        rejectedCount,
                        true
                    )
                }

            } catch (_: Exception) {

                return SyncResult(
                    syncedCount,
                    rejectedCount,
                    true
                )
            }
        }

        return SyncResult(
            syncedCount,
            rejectedCount,
            false
        )
    }
}
