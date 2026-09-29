package com.mohmmedali.almoraqebpro.data

import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitClient {

    // ✅ رابط السيرفر الفعلي على Oracle Cloud
    private const val BASE_URL = "https://almoraqebpro.duckdns.org/"

    fun absoluteUrl(path: String): String =
        if (path.startsWith("http://") || path.startsWith("https://")) path
        else BASE_URL.trimEnd('/') + "/" + path.trimStart('/')

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .callTimeout(20, TimeUnit.SECONDS)
        .build()

    val apiService: ApiService by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
}
