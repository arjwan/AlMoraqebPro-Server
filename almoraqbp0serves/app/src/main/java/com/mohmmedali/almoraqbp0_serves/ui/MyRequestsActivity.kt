package com.mohmmedali.almoraqebpro.ui

import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.ArrayAdapter
import android.widget.ListView
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.mohmmedali.almoraqebpro.R
import com.mohmmedali.almoraqebpro.data.RetrofitClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MyRequestsActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_simple_list)
        findViewById<TextView>(R.id.tvListTitle).text = "📄 حالة طلباتي"
        load()
    }

    private fun load() {
        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
        val employeeId = prefs.getString("employeeId", "") ?: ""
        val deviceId = prefs.getString("deviceId", "")
            ?: Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: ""
        val progress = findViewById<ProgressBar>(R.id.progressList)
        val empty = findViewById<TextView>(R.id.tvEmptyState)
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val res = RetrofitClient.apiService.getMyRequests(employeeId, deviceId)
                val items = res.body()?.requests ?: emptyList()
                withContext(Dispatchers.Main) {
                    progress.visibility = View.GONE
                    if (!res.isSuccessful || res.body()?.success != true) {
                        empty.text = "❌ " + (res.body()?.message ?: "تعذر جلب الطلبات من السيرفر")
                        empty.visibility = View.VISIBLE
                        return@withContext
                    }
                    if (items.isEmpty()) {
                        empty.text = "ℹ️ لا توجد طلبات مرسلة بعد. أرسل طلب سلفة أو إجازة من صفحة الخدمات."
                        empty.visibility = View.VISIBLE
                        return@withContext
                    }
                    empty.visibility = View.GONE
                    val rows = items.map { r ->
                        val badge = when (r.status) {
                            "approved" -> "✅ مقبول"
                            "rejected" -> "❌ مرفوض"
                            else -> "⏳ قيد الانتظار"
                        }
                        val type = when (r.type) { "loan" -> "💰 سلفة"; "leave" -> "📅 إجازة"; else -> r.type ?: "-" }
                        "$type\n$badge\n${r.reason ?: ""}\n${formatServerDate(r.createdAt)}"
                    }
                    findViewById<ListView>(R.id.listData).adapter = ArrayAdapter(
                        this@MyRequestsActivity, R.layout.item_readable_list, rows)
                }
            } catch (e: java.io.IOException) {
                withContext(Dispatchers.Main) {
                    progress.visibility = View.GONE
                    empty.text = "❌ تعذر الاتصال بالسيرفر، حاول مرة أخرى"
                    empty.visibility = View.VISIBLE
                    Toast.makeText(this@MyRequestsActivity, "تعذر الاتصال بالسيرفر", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    progress.visibility = View.GONE
                    empty.text = "❌ تعذر قراءة بيانات الطلبات: ${e.message ?: "خطأ غير معروف"}"
                    empty.visibility = View.VISIBLE
                }
            }
        }
    }
}
