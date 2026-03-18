package com.whstock.app.data.remote

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface BackendApi {
    @GET("health")
    suspend fun health(): Response<Map<String, Any>>

    @GET("product")
    suspend fun product(
        @Query("id") id: String,
        @Query("type") type: String? = null
    ): Response<ProductDto>

    @POST("update-product")
    suspend fun updateProduct(@Body body: Map<String, @JvmSuppressWildcards Any?>): Response<Map<String, Any>>

    @POST("post-document")
    suspend fun postDocument(@Body body: Map<String, @JvmSuppressWildcards Any?>): Response<Map<String, Any>>

    @POST("trigger-sync")
    suspend fun triggerSync(): Response<Map<String, Any>>

    @GET("warehouses")
    suspend fun warehouses(): Response<List<String>>

    @GET("cells")
    suspend fun cells(): Response<List<String>>

    @GET("printers")
    suspend fun printers(): Response<Map<String, Any>>

    @POST("print-label")
    suspend fun printLabel(@Body body: Map<String, @JvmSuppressWildcards Any?>): Response<Map<String, Any>>

    @POST("print-hanger")
    suspend fun printHanger(@Body body: Map<String, @JvmSuppressWildcards Any?>): Response<Map<String, Any>>

    @POST("print-a4")
    suspend fun printA4(@Body body: Map<String, @JvmSuppressWildcards Any?>): Response<Map<String, Any>>
}
