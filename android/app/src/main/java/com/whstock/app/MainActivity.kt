package com.whstock.app

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.whstock.app.data.remote.ProductDto
import com.whstock.app.data.settings.AppSettings
import com.whstock.app.databinding.ActivityMainBinding
import com.whstock.app.domain.SyncScheduler
import com.whstock.app.ui.SettingsActivity
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private var settings: AppSettings = AppSettings()
    private var currentProduct: ProductDto? = null
    private var isManagerMode = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        refreshSettings()
        setupUi()
        applyModeUi()
    }

    override fun onResume() {
        super.onResume()
        refreshSettings()
    }

    private fun refreshSettings() {
        lifecycleScope.launch {
            settings = ServiceLocator.settingsStore(this@MainActivity).settingsFlow.first()
        }
    }

    private fun setupUi() {
        binding.btnOpenSettings.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        binding.btnManagerMode.setOnClickListener {
            if (isManagerMode) {
                isManagerMode = false
                applyModeUi()
                return@setOnClickListener
            }
            askManagerPinAndLogin()
        }

        binding.btnSearch.setOnClickListener {
            performSearch()
        }

        binding.inputScanCode.setOnKeyListener { _, keyCode, event ->
            if (keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN) {
                performSearch()
                true
            } else {
                false
            }
        }

        binding.btnUpdateProduct.setOnClickListener {
            if (!isManagerMode) {
                toast("Только для менеджера")
                return@setOnClickListener
            }
            pushProductUpdate()
        }

        binding.btnCreateDemoDoc.setOnClickListener {
            lifecycleScope.launch {
                val repo = ServiceLocator.warehouseRepository(this@MainActivity, settings)
                val id = "demo-${System.currentTimeMillis()}"
                repo.enqueueDocument(id, "receive", "Demo document")
                toast("Документ $id добавлен в outbox")
            }
        }

        binding.btnRunSync.setOnClickListener {
            SyncScheduler.enqueueNow(this)
            toast("Sync worker запланирован")
        }
    }

    private fun askManagerPinAndLogin() {
        val input = EditText(this).apply {
            hint = "PIN"
        }

        AlertDialog.Builder(this)
            .setTitle("Вход менеджера")
            .setView(input)
            .setNegativeButton("Отмена", null)
            .setPositiveButton("Войти") { _, _ ->
                val pin = input.text?.toString().orEmpty()
                if (pin == settings.managerPin) {
                    isManagerMode = true
                    applyModeUi()
                    toast("Режим менеджера включен")
                } else {
                    toast("Неверный PIN")
                }
            }
            .show()
    }

    private fun applyModeUi() {
        binding.tvMode.text = if (isManagerMode) "Режим: менеджер" else "Режим: клиент"
        binding.btnManagerMode.text = if (isManagerMode) "Выйти" else "Менеджер"
        binding.inputPrice.isEnabled = isManagerMode
        binding.btnUpdateProduct.isEnabled = isManagerMode && currentProduct != null
    }

    private fun performSearch() {
        val code = binding.inputScanCode.text?.toString().orEmpty().trim()
        if (code.isBlank()) {
            binding.tvStatus.text = "Введите код"
            return
        }
        if (settings.baseUrl.isBlank()) {
            binding.tvStatus.text = "Сначала заполните URL в настройках"
            return
        }

        binding.tvStatus.text = "Поиск товара..."

        lifecycleScope.launch {
            val repo = ServiceLocator.warehouseRepository(this@MainActivity, settings)
            val result = repo.findProductByCode(code)
            result.onSuccess { product ->
                currentProduct = product
                renderProduct(product)
                binding.tvStatus.text = "Товар найден"
            }.onFailure { ex ->
                binding.tvStatus.text = ex.message ?: "Товар не найден"
            }
            applyModeUi()
        }
    }

    private fun renderProduct(product: ProductDto) {
        binding.tvArticul.text = "Артикул: ${product.articul ?: "-"}"
        binding.tvName.text = "Название: ${product.name ?: "-"}"
        binding.tvBrand.text = "Бренд: ${product.brand ?: "-"}"
        binding.tvWidth.text = "Ширина: ${product.width ?: "-"}"
        binding.tvComp.text = "Состав: ${product.composition ?: "-"}"
        binding.tvDensity.text = "Плотность: ${product.density ?: "-"}"
        binding.inputPrice.setText((product.priceRub ?: 0.0).toString())
    }

    private fun pushProductUpdate() {
        val base = currentProduct ?: return
        val price = binding.inputPrice.text?.toString()?.replace(',', '.')?.toDoubleOrNull()
        if (price == null) {
            toast("Некорректная цена")
            return
        }

        val updated = base.copy(priceRub = price)
        lifecycleScope.launch {
            val repo = ServiceLocator.warehouseRepository(this@MainActivity, settings)
            val result = repo.updateProduct(updated)
            if (result.isSuccess) {
                currentProduct = updated
                binding.tvStatus.text = "Изменения отправлены в 1С"
            } else {
                binding.tvStatus.text = "Ошибка update-product"
            }
        }
    }

    private fun toast(text: String) {
        Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
    }
}
