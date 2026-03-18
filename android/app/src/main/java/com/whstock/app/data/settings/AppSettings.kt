package com.whstock.app.data.settings

data class AppSettings(
    val baseUrl: String = "",
    val apiKey: String = "",
    val user: String = "",
    val pass: String = "",
    val managerPin: String = "1234"
)
