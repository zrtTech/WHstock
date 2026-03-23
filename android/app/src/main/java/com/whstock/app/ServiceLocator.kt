package com.whstock.app

import android.content.Context
import com.whstock.app.data.local.AppDatabase
import com.whstock.app.data.remote.ApiFactory
import com.whstock.app.data.remote.BackendApi
import com.whstock.app.data.settings.AppSettings
import com.whstock.app.data.settings.SettingsStore
import com.whstock.app.data.repository.WarehouseRepository

object ServiceLocator {
    private var api: BackendApi? = null

    fun settingsStore(context: Context): SettingsStore = SettingsStore(context.applicationContext)

    fun appDatabase(context: Context): AppDatabase = AppDatabase.get(context.applicationContext)

    fun backendApi(settings: AppSettings): BackendApi {
        val normalizedUrl = settings.baseUrl.trim().ifBlank { "http://10.0.2.2:3000" }
        return api ?: ApiFactory.create(normalizedUrl, settings.apiKey, settings.user, settings.pass).also { api = it }
    }

    fun warehouseRepository(context: Context, settings: AppSettings): WarehouseRepository {
        return WarehouseRepository(
            api = backendApi(settings),
            db = appDatabase(context)
        )
    }

    fun resetApi() {
        api = null
    }
}
