package com.whstock.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.whstock.app.data.local.entities.ProductCacheEntity

@Dao
interface ProductCacheDao {
    @Query("SELECT * FROM products_cache WHERE articul = :articul LIMIT 1")
    suspend fun get(articul: String): ProductCacheEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(product: ProductCacheEntity)
}
