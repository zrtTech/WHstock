package com.whstock.app.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "outbox")
data class OutboxEntity(
    @PrimaryKey val documentId: String,
    val tab: String,
    val addedAt: String,
    val attempts: Int = 0,
    val lastError: String? = null,
    val lastAttemptAt: String? = null
)
