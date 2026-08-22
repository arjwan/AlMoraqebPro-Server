package com.mohmmedali.almoraqebpro

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [LocationRecord::class, PendingEmployeeRequest::class], version = 2, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun locationDao(): LocationDao

    abstract fun pendingRequestDao(): PendingRequestDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "almoraqeb_database"
                )
                .addMigrations(object : androidx.room.migration.Migration(1, 2) {
                    override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                        db.execSQL(
                            "CREATE TABLE IF NOT EXISTS `pending_employee_requests` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `payloadJson` TEXT NOT NULL, `createdAt` INTEGER NOT NULL)"
                        )
                    }
                })
                .build()
                INSTANCE = instance
                instance
            }
        }
    }
}