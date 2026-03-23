package com.whstock.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.whstock.app.data.local.entities.OutboxEntity

@Dao
interface OutboxDao {
    @Query("SELECT * FROM outbox ORDER BY addedAt ASC")
    suspend fun getAll(): List<OutboxEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: OutboxEntity)

    @Query("DELETE FROM outbox WHERE documentId = :documentId")
    suspend fun remove(documentId: String)
}
