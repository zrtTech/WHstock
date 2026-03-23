package com.whstock.app.ui

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.whstock.app.R
import com.whstock.app.ServiceLocator
import com.whstock.app.data.settings.AppSettings
import com.whstock.app.databinding.ActivitySettingsBinding
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class SettingsActivity : AppCompatActivity() {
    private lateinit var binding: ActivitySettingsBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        title = getString(R.string.settings_title)

        lifecycleScope.launch {
            val store = ServiceLocator.settingsStore(this@SettingsActivity)
            val settings = store.settingsFlow.first()
            bindData(settings)
        }

        binding.btnSaveSettings.setOnClickListener {
            lifecycleScope.launch {
                val payload = readData()
                ServiceLocator.settingsStore(this@SettingsActivity).save(payload)
                ServiceLocator.resetApi()
                Toast.makeText(this@SettingsActivity, R.string.settings_saved, Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnTestConnection.setOnClickListener {
            lifecycleScope.launch {
                val payload = readData()
                ServiceLocator.settingsStore(this@SettingsActivity).save(payload)
                ServiceLocator.resetApi()
                val repo = ServiceLocator.warehouseRepository(this@SettingsActivity, payload)
                val result = repo.checkHealth()
                val message = if (result.isSuccess) getString(R.string.connection_ok) else getString(R.string.connection_fail)
                Toast.makeText(this@SettingsActivity, message, Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun bindData(settings: AppSettings) {
        binding.inputBaseUrl.setText(settings.baseUrl)
        binding.inputApiKey.setText(settings.apiKey)
        binding.inputUser.setText(settings.user)
        binding.inputPass.setText(settings.pass)
        binding.inputManagerPin.setText(settings.managerPin)
    }

    private fun readData(): AppSettings {
        return AppSettings(
            baseUrl = binding.inputBaseUrl.text?.toString().orEmpty(),
            apiKey = binding.inputApiKey.text?.toString().orEmpty(),
            user = binding.inputUser.text?.toString().orEmpty(),
            pass = binding.inputPass.text?.toString().orEmpty(),
            managerPin = binding.inputManagerPin.text?.toString().orEmpty()
        )
    }
}
