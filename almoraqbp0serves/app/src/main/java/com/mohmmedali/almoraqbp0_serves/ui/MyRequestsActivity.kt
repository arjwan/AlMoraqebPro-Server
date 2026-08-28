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
        findViewById<TextView>(R.id.tvListTitle).text = getString(R.string.requests_title)
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
                        empty.text = "❌ " + (res.body()?.message ?: getString(R.string.requests_fetch_failed))
                        empty.visibility = View.VISIBLE
                        return@withContext
                    }
                    if (items.isEmpty()) {
                        empty.text = getString(R.string.requests_empty)
                        empty.visibility = View.VISIBLE
                        return@withContext
                    }
                    empty.visibility = View.GONE
                    val rows = items.map { r ->
                        val badge = when (r.status) {
                            "approved" -> getString(R.string.requests_approved)
                            "rejected" -> getString(R.string.requests_rejected)
                            else -> getString(R.string.requests_pending)
                        }
                        val type = when (r.type) { "loan" -> getString(R.string.requests_loan); "leave" -> getString(R.string.requests_leave); else -> r.type ?: "-" }
                        "$type\n$badge\n${r.reason ?: ""}\n${formatServerDate(r.createdAt)}"
                    }
                    findViewById<ListView>(R.id.listData).adapter = ArrayAdapter(
                        this@MyRequestsActivity, R.layout.item_readable_list, rows)
                }
            } catch (e: java.io.IOException) {
                withContext(Dispatchers.Main) {
                    progress.visibility = View.GONE
                    empty.text = getString(R.string.requests_server_unreachable)
                    empty.visibility = View.VISIBLE
                    Toast.makeText(this@MyRequestsActivity, getString(R.string.requests_connection_toast), Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    progress.visibility = View.GONE
                    empty.text = getString(R.string.requests_read_failed, e.message ?: getString(R.string.requests_unknown_error))
                    empty.visibility = View.VISIBLE
                }
            }
        }
    }
}
