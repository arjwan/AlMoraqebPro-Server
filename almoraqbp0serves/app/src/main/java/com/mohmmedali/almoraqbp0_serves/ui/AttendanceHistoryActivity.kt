package com.mohmmedali.almoraqebpro.ui

import android.os.Bundle
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
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AttendanceHistoryActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_simple_list)
        findViewById<TextView>(R.id.tvListTitle).text = getString(R.string.history_title)
        load()
    }

    private fun load() {
        val employeeId = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
            .getString("employeeId", "") ?: ""
        val progress = findViewById<ProgressBar>(R.id.progressList)
        val empty = findViewById<TextView>(R.id.tvEmptyState)
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val res = RetrofitClient.apiService.getAttendanceHistory(employeeId)
                val items = res.body()?.attendance ?: emptyList()
                withContext(Dispatchers.Main) {
                    progress.visibility = View.GONE
                    if (!res.isSuccessful || res.body()?.success != true) {
                        empty.text = "❌ " + (res.body()?.message ?: getString(R.string.history_fetch_failed))
                        empty.visibility = View.VISIBLE
                        return@withContext
                    }
                    if (items.isEmpty()) {
                        empty.text = getString(R.string.history_empty)
                        empty.visibility = View.VISIBLE
                        return@withContext
                    }
                    empty.visibility = View.GONE
                    val df = SimpleDateFormat("yyyy/MM/dd HH:mm:ss", Locale.getDefault())
                    val rows = items.map { a ->
                        val type = if (a.type == "attendance") getString(R.string.history_attendance) else getString(R.string.history_departure)
                        "$type\n${a.timestamp ?: ""}" +
                            (if (a.latitude != null && a.longitude != null)
                                "\n📍 ${String.format(Locale.US, "%.5f", a.latitude)}, ${String.format(Locale.US, "%.5f", a.longitude)}" else "")
                    }
                    findViewById<ListView>(R.id.listData).adapter = ArrayAdapter(
                        this@AttendanceHistoryActivity, R.layout.item_readable_list, rows)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    progress.visibility = View.GONE
                    empty.text = getString(R.string.history_server_unreachable)
                    empty.visibility = View.VISIBLE
                    Toast.makeText(this@AttendanceHistoryActivity, getString(R.string.history_connection_toast), Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}
