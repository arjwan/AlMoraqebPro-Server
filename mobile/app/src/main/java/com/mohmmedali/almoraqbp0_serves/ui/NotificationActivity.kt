package com.mohmmedali.almoraqebpro.ui

import android.os.Bundle
import android.provider.Settings
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.mohmmedali.almoraqebpro.data.RetrofitClient
import com.mohmmedali.almoraqebpro.databinding.ActivityNotificationsBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class NotificationActivity : AppCompatActivity() {

    private lateinit var binding: ActivityNotificationsBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityNotificationsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        loadNotifications()
    }

    private fun loadNotifications() {
        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
        val employeeId = prefs.getString("employeeId", "") ?: ""
        val deviceId = prefs.getString("deviceId", "")
            ?: Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)

        if (employeeId.isEmpty() || deviceId.isEmpty()) {
            Toast.makeText(this, "بيانات الموظف غير مكتملة", Toast.LENGTH_SHORT).show()
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val response = RetrofitClient.apiService.getNotifications(employeeId, deviceId)
                val notifications = response.body()?.notifications ?: emptyList()

                withContext(Dispatchers.Main) {
                    if (notifications.isEmpty()) {
                        binding.tvEmptyNotifications.visibility = android.view.View.VISIBLE
                        binding.lvNotifications.visibility = android.view.View.GONE
                    } else {
                        binding.tvEmptyNotifications.visibility = android.view.View.GONE
                        binding.lvNotifications.visibility = android.view.View.VISIBLE

                        val items = notifications.map { notification ->
                            val prefix = if (notification.type == "voice") "🎙️" else "📩"
                            "$prefix ${notification.message ?: "رسالة من الإدارة"}"
                        }

                        val adapter = ArrayAdapter(
                            this@NotificationActivity,
                            android.R.layout.simple_list_item_1,
                            items
                        )
                        binding.lvNotifications.adapter = adapter
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(
                        this@NotificationActivity,
                        "تعذر جلب الإشعارات",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }
}