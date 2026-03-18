package com.whstock.app.data.remote

data class ProductDto(
    val articul: String? = null,
    val name: String? = null,
    val priceRub: Double? = null,
    val width: String? = null,
    val composition: String? = null,
    val brand: String? = null,
    val density: String? = null,
    val qty: Double? = null,
    val uid: String? = null,
    val stockRows: List<Map<String, Any?>>? = null,
    val images: List<String>? = null
)
