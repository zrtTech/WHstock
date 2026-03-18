package com.whstock.app.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "documents")
data class DocumentEntity(
    @PrimaryKey val id: String,
    val tab: String,
    val name: String,
    val status: String,
    val createdAt: String,
    val closedAt: String? = null,
    val syncStatus: String? = null,
    val sentAt: String? = null
)
