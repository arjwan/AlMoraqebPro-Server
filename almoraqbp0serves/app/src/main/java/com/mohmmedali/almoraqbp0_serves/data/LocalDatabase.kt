package com.mohmmedali.almoraqebpro.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Entity(tableName = "pending_attendance")
data class PendingAttendance(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    val employeeId: String,
    val companyId: String,
    val deviceId: String,
    val challengeId: String,
    val fingerprintToken: String,
    val latitude: Double,
    val longitude: Double,
    val type: String,
    val timestamp: String,

    val synced: Boolean = false
)


@Entity(tableName = "pending_service_requests")
data class PendingServiceRequest(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val employeeId: String,
    val deviceId: String,
    val companyId: String?,
    val type: String,
    val amount: Double?,
    val reason: String?,
    val requestedDate: String?,
    val fromDate: String?,
    val toDate: String?,
    val leavePaymentType: String?,
    val createdAt: Long = System.currentTimeMillis(),
    val synced: Boolean = false
)

@Dao
interface ServiceRequestDao {

    @Insert
    suspend fun insert(request: PendingServiceRequest)

    @Query("SELECT * FROM pending_service_requests WHERE synced = 0 ORDER BY id ASC")
    suspend fun getUnsynced(): List<PendingServiceRequest>

    @Query("SELECT COUNT(*) FROM pending_service_requests WHERE employeeId = :employeeId AND synced = 0")
    suspend fun countUnsynced(employeeId: String): Int

    @Query("UPDATE pending_service_requests SET synced = 1 WHERE id = :id")
    suspend fun markSynced(id: Long)
}

@Dao
interface AttendanceDao {

    @Insert
    suspend fun insert(attendance: PendingAttendance)

    @Query("SELECT * FROM pending_attendance WHERE synced = 0 ORDER BY id ASC")
    suspend fun getUnsynced(): List<PendingAttendance>

    @Query("SELECT * FROM pending_attendance WHERE employeeId = :employeeId ORDER BY timestamp DESC")
    suspend fun getForEmployee(employeeId: String): List<PendingAttendance>

    @Query("SELECT COUNT(*) FROM pending_attendance WHERE employeeId = :employeeId AND synced = 0")
    suspend fun countUnsynced(employeeId: String): Int

    @Query("UPDATE pending_attendance SET synced = 1 WHERE id = :id")
    suspend fun markSynced(id: Long)
}

@Database(
    entities = [
        PendingAttendance::class,
        PendingServiceRequest::class
    ],
    version = 3,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun attendanceDao(): AttendanceDao
    abstract fun serviceRequestDao(): ServiceRequestDao

    companion object {

        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val migration1To2 =
                    object : Migration(1, 2) {
                        override fun migrate(db: SupportSQLiteDatabase) {
                            db.execSQL(
                                """
                                CREATE TABLE IF NOT EXISTS pending_service_requests (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                    employeeId TEXT NOT NULL,
                                    deviceId TEXT NOT NULL,
                                    companyId TEXT,
                                    type TEXT NOT NULL,
                                    amount REAL,
                                    reason TEXT,
                                    requestedDate TEXT,
                                    fromDate TEXT,
                                    toDate TEXT,
                                    leavePaymentType TEXT,
                                    createdAt INTEGER NOT NULL,
                                    synced INTEGER NOT NULL
                                )
                                """.trimIndent()
                            )
                        }
                    }

                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "almoraqebpro_database"
                )
                    .addMigrations(migration1To2, object : Migration(2, 3) {
                        override fun migrate(db: SupportSQLiteDatabase) {
                            db.execSQL("ALTER TABLE pending_attendance ADD COLUMN companyId TEXT NOT NULL DEFAULT ''")
                        }
                    })
                    .build()

                INSTANCE = instance
                instance
            }
        }
    }
}
