package com.whstock.app.data.repository

import com.whstock.app.data.local.AppDatabase
import com.whstock.app.data.local.entities.DocumentEntity
import com.whstock.app.data.local.entities.OutboxEntity
import com.whstock.app.data.remote.BackendApi
import com.whstock.app.data.remote.ProductDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class WarehouseRepository(
    private val api: BackendApi,
    private val db: AppDatabase
) {
    suspend fun checkHealth(): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val response = api.health()
            require(response.isSuccessful) { "Health check failed: ${response.code()}" }
        }
    }

    suspend fun findProductByCode(rawCode: String): Result<ProductDto> = withContext(Dispatchers.IO) {
        runCatching {
            val code = rawCode.trim()
            require(code.isNotBlank()) { "Пустой код" }

            if (UID_REGEX.matches(code)) {
                val uidRes = api.product(code, "uid")
                if (uidRes.isSuccessful && uidRes.body() != null) return@runCatching uidRes.body()!!
            }

            val chain = listOf("barcode", "char_articul", "articul")
            for (type in chain) {
                val response = api.product(code, type)
                if (response.isSuccessful && response.body() != null) {
                    return@runCatching response.body()!!
                }
            }

            error("Товар не найден")
        }
    }

    suspend fun updateProduct(product: ProductDto): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val articul = product.articul?.trim().orEmpty()
            require(articul.isNotBlank()) { "Артикул не задан" }

            val payload = mapOf(
                "articul" to articul,
                "name" to (product.name ?: ""),
                "priceRub" to (product.priceRub ?: 0.0),
                "width" to (product.width ?: ""),
                "composition" to (product.composition ?: ""),
                "brand" to (product.brand ?: ""),
                "density" to (product.density ?: "")
            )
            val response = api.updateProduct(payload)
            require(response.isSuccessful) { "Ошибка update-product: ${response.code()}" }
        }
    }

    suspend fun enqueueDocument(docId: String, tab: String, name: String = "Документ") = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis().toString()
        db.documentDao().upsert(
            DocumentEntity(
                id = docId,
                tab = tab,
                name = name,
                status = "active",
                createdAt = now,
                syncStatus = "pending"
            )
        )
        db.outboxDao().upsert(
            OutboxEntity(
                documentId = docId,
                tab = tab,
                addedAt = now
            )
        )
    }

    companion object {
        private val UID_REGEX = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    }
}
