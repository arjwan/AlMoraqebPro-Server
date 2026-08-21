package com.mohmmedali.almoraqebpro

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query

@Dao
interface LocationDao {
    @Insert
    suspend fun insertLocation(record: LocationRecord)

    @Query("SELECT * FROM locations_table ORDER BY id DESC")
    suspend fun getAllLocations(): List<LocationRecord>
}