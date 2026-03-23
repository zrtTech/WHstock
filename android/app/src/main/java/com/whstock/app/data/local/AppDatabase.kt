package com.whstock.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.whstock.app.data.local.dao.AppLogDao
import com.whstock.app.data.local.dao.DocumentDao
import com.whstock.app.data.local.dao.OutboxDao
import com.whstock.app.data.local.dao.ProductCacheDao
import com.whstock.app.data.local.entities.AppLogEntity
import com.whstock.app.data.local.entities.DocumentEntity
import com.whstock.app.data.local.entities.DocumentItemEntity
import com.whstock.app.data.local.entities.OutboxEntity
import com.whstock.app.data.local.entities.ProductCacheEntity

@Database(
    entities = [
        DocumentEntity::class,
        DocumentItemEntity::class,
        OutboxEntity::class,
        ProductCacheEntity::class,
        AppLogEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun documentDao(): DocumentDao
    abstract fun outboxDao(): OutboxDao
    abstract fun productCacheDao(): ProductCacheDao
    abstract fun appLogDao(): AppLogDao

    companion object {
        @Volatile
        private var instance: AppDatabase? = null

        fun get(context: Context): AppDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                "whstock.db"
            ).fallbackToDestructiveMigration().build().also { instance = it }
        }
    }
}
