package com.mohmmedali.almoraqebpro

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query

/**
 * طلب تسجيل موظف محفوظ محلياً عند انقطاع الاتصال،
 * يُعاد إرساله تلقائياً عند توفر الاتصال.
 */
@Entity(tableName = "pending_employee_requests")
data class PendingEmployeeRequest(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val payloadJson: String,
    val createdAt: Long = System.currentTimeMillis()
)

@Dao
interface PendingRequestDao {
    @Insert
    suspend fun insert(request: PendingEmployeeRequest)

    @Query("SELECT * FROM pending_employee_requests ORDER BY id ASC")
    suspend fun getAll(): List<PendingEmployeeRequest>

    @Query("DELETE FROM pending_employee_requests WHERE id = :id")
    suspend fun deleteById(id: Int)

    @Query("SELECT COUNT(*) FROM pending_employee_requests")
    suspend fun count(): Int
}
