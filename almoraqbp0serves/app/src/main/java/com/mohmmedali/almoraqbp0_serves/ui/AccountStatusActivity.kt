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
        findViewById<TextView>(R.id.tvListTitle).text = getString(R.string.account_status_title)
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
        info.text = getString(R.string.account_employee, prefs.getString("employeeName", "-")) + "\n" +
                getString(R.string.account_company, prefs.getString("companyId", "-")) + "\n" +
                getString(R.string.account_device, deviceId) + "\n" +
                getString(R.string.account_gps, if (gpsOn) getString(R.string.account_gps_on) else getString(R.string.account_gps_off))

        CoroutineScope(Dispatchers.IO).launch {
            var ok = false
            try { ok = RetrofitClient.apiService.ping().isSuccessful } catch (_: Exception) {}
            withContext(Dispatchers.Main) {
                info.text = info.text.toString() + "\n" + getString(R.string.account_server, if (ok) getString(R.string.account_server_online) else getString(R.string.account_server_offline))
            }
        }
    }
}
