package com.whstock.app.data.remote

import android.util.Base64
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

object ApiFactory {
    fun create(baseUrl: String, apiKey: String, user: String = "", pass: String = ""): BackendApi {
        val authInterceptor = Interceptor { chain ->
            val req = chain.request().newBuilder().apply {
                if (apiKey.isNotBlank()) header("x-api-key", apiKey)
                if (user.isNotBlank()) {
                    val token = Base64.encodeToString("$user:$pass".toByteArray(), Base64.NO_WRAP)
                    header("Authorization", "Basic $token")
                }
            }.build()
            chain.proceed(req)
        }

        val client = OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC })
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build()

        return Retrofit.Builder()
            .baseUrl(if (baseUrl.endsWith('/')) baseUrl else "$baseUrl/")
            .addConverterFactory(MoshiConverterFactory.create())
            .client(client)
            .build()
            .create(BackendApi::class.java)
    }
}
