package com.whstock.app.data.settings

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import java.io.IOException

private val Context.dataStore by preferencesDataStore(name = "whstock_settings")

class SettingsStore(private val context: Context) {
    private object Keys {
        val baseUrl: Preferences.Key<String> = stringPreferencesKey("base_url")
        val apiKey: Preferences.Key<String> = stringPreferencesKey("api_key")
        val user: Preferences.Key<String> = stringPreferencesKey("user")
        val pass: Preferences.Key<String> = stringPreferencesKey("pass")
        val managerPin: Preferences.Key<String> = stringPreferencesKey("manager_pin")
    }

    val settingsFlow: Flow<AppSettings> = context.dataStore.data
        .catch { ex ->
            if (ex is IOException) emit(emptyPreferences()) else throw ex
        }
        .map { prefs ->
            AppSettings(
                baseUrl = prefs[Keys.baseUrl] ?: "",
                apiKey = prefs[Keys.apiKey] ?: "",
                user = prefs[Keys.user] ?: "",
                pass = prefs[Keys.pass] ?: "",
                managerPin = prefs[Keys.managerPin] ?: "1234"
            )
        }

    suspend fun save(settings: AppSettings) {
        context.dataStore.edit { prefs ->
            prefs[Keys.baseUrl] = settings.baseUrl.trim()
            prefs[Keys.apiKey] = settings.apiKey.trim()
            prefs[Keys.user] = settings.user.trim()
            prefs[Keys.pass] = settings.pass
            prefs[Keys.managerPin] = settings.managerPin.ifBlank { "1234" }
        }
    }
}
