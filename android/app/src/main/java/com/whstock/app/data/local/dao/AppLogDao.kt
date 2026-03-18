package com.whstock.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.whstock.app.data.local.entities.AppLogEntity

@Dao
interface AppLogDao {
    @Insert
    suspend fun add(log: AppLogEntity)

    @Query("SELECT * FROM app_logs ORDER BY id DESC LIMIT :limit")
    suspend fun recent(limit: Int = 300): List<AppLogEntity>
}
