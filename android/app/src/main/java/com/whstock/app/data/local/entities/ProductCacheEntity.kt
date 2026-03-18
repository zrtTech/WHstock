package com.whstock.app.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "products_cache")
data class ProductCacheEntity(
    @PrimaryKey val articul: String,
    val name: String,
    val priceRub: Double,
    val width: String? = null,
    val composition: String? = null,
    val brand: String? = null,
    val density: String? = null,
    val qty: Double? = null,
    val stockJson: String? = null,
    val imagesJson: String? = null,
    val updatedAt: String
)
