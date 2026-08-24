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

@Entity(tableName = "pending_attendance")
data class PendingAttendance(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    val employeeId: String,
    val deviceId: String,
    val challengeId: String,
    val fingerprintToken: String,
    val latitude: Double,
    val longitude: Double,
    val type: String,
    val timestamp: String,

    val synced: Boolean = false
)

@Dao
interface AttendanceDao {

    @Insert
    suspend fun insert(attendance: PendingAttendance)

    @Query("SELECT * FROM pending_attendance WHERE synced = 0 ORDER BY id ASC")
    suspend fun getUnsynced(): List<PendingAttendance>

    @Query("UPDATE pending_attendance SET synced = 1 WHERE id = :id")
    suspend fun markSynced(id: Long)
}

@Database(
    entities = [PendingAttendance::class],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun attendanceDao(): AttendanceDao

    companion object {

        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "almoraqebpro_database"
                ).build()

                INSTANCE = instance
                instance
            }
        }
    }
}