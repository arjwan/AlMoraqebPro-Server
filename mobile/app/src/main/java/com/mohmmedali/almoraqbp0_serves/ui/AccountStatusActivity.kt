package com.mohmmedali.almoraqebpro.ui

import android.location.LocationManager as SystemLocationManager
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.mohmmedali.almoraqebpro.R
import com.mohmmedali.almoraqebpro.data.RetrofitClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class AccountStatusActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_simple_list)
        findViewById<TextView>(R.id.tvListTitle).text = "📊 حالة الحساب"
        findViewById<ProgressBar>(R.id.progressList).visibility = View.GONE
        findViewById<View>(R.id.listData).visibility = View.GONE

        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
        val deviceId = prefs.getString("deviceId", "")
            ?: Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: "-"
        val lm = getSystemService(LOCATION_SERVICE) as SystemLocationManager
        val gpsOn = lm.isProviderEnabled(SystemLocationManager.GPS_PROVIDER) ||
                lm.isProviderEnabled(SystemLocationManager.NETWORK_PROVIDER)

        val info = findViewById<TextView>(R.id.tvEmptyState)
        info.visibility = View.VISIBLE
        info.text = "👤 الموظف: ${prefs.getString("employeeName", "-")}\n" +
                "🏢 الشركة: ${prefs.getString("companyId", "-")}\n" +
                "📱 Device ID: $deviceId\n" +
                "📍 GPS: ${if (gpsOn) "مفعّل ✅" else "مغلق ❌"}"

        CoroutineScope(Dispatchers.IO).launch {
            var ok = false
            try { ok = RetrofitClient.apiService.ping().isSuccessful } catch (_: Exception) {}
            withContext(Dispatchers.Main) {
                info.text = info.text.toString() + "\n🌐 السيرفر: ${if (ok) "متصل ✅" else "غير متصل ❌"}"
            }
        }
    }
}
