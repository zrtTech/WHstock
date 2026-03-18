package com.whstock.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.whstock.app.data.local.entities.DocumentEntity

@Dao
interface DocumentDao {
    @Query("SELECT * FROM documents WHERE tab = :tab ORDER BY createdAt DESC")
    suspend fun getByTab(tab: String): List<DocumentEntity>

    @Query("SELECT * FROM documents WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): DocumentEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(document: DocumentEntity)

    @Query("UPDATE documents SET syncStatus = :syncStatus, sentAt = :sentAt WHERE id = :id")
    suspend fun updateSyncStatus(id: String, syncStatus: String, sentAt: String? = null)

    @Query("DELETE FROM documents WHERE id = :id")
    suspend fun deleteById(id: String)
}
