package com.mohmmedali.almoraqebpro.ui

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager as SystemLocationManager
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.ContextCompat
import androidx.core.os.LocaleListCompat
import com.mohmmedali.almoraqebpro.R
import com.mohmmedali.almoraqebpro.data.RetrofitClient
import com.mohmmedali.almoraqebpro.databinding.ActivitySettingsBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class SettingsActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySettingsBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)
        binding.tvAppInfo.text = getString(R.string.settings_app_info, packageManager.getPackageInfo(packageName, 0).versionName ?: "-")

        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
        val savedLanguage = prefs.getString("app_language", "ar") ?: "ar"
        val savedThemeMode = prefs.getInt("app_theme_mode", AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)

        binding.rbArabic.isChecked = savedLanguage == "ar"
        binding.rbEnglish.isChecked = savedLanguage == "en"
        binding.rbKurdish.isChecked = savedLanguage == "ku"
        binding.rbPersian.isChecked = savedLanguage == "fa"

        when (savedThemeMode) {
            AppCompatDelegate.MODE_NIGHT_NO -> binding.rbLight.isChecked = true
            AppCompatDelegate.MODE_NIGHT_YES -> binding.rbDark.isChecked = true
            else -> binding.rbSystem.isChecked = true
        }

        binding.rgLanguage.setOnCheckedChangeListener { _, checkedId ->
            val selectedLanguage = when (checkedId) {
                R.id.rbArabic -> "ar"
                R.id.rbEnglish -> "en"
                R.id.rbKurdish -> "ku"
                R.id.rbPersian -> "fa"
                else -> savedLanguage
            }

            prefs.edit().putString("app_language", selectedLanguage).apply()
            applyLanguage(selectedLanguage)
        }

        binding.rgTheme.setOnCheckedChangeListener { _, checkedId ->
            val selectedThemeMode = when (checkedId) {
                R.id.rbLight -> AppCompatDelegate.MODE_NIGHT_NO
                R.id.rbDark -> AppCompatDelegate.MODE_NIGHT_YES
                else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
            }

            prefs.edit().putInt("app_theme_mode", selectedThemeMode).apply()
            AppCompatDelegate.setDefaultNightMode(selectedThemeMode)
        }

        // بيانات الموظف والجهاز والشركة
        val employeeName = prefs.getString("employeeName", "-") ?: "-"
        val companyId = prefs.getString("companyId", "-") ?: "-"
        val deviceId = prefs.getString("deviceId", "")
            ?: Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: "-"

        binding.tvEmployeeNameInfo.text = getString(R.string.settings_employee_name, employeeName)
        binding.tvDeviceIdInfo.text = getString(R.string.settings_device_id, deviceId)
        binding.tvCompanyIdInfo.text = getString(R.string.settings_company_code, companyId)

        // حالة الموقع
        updateLocationStatus()

        // اختبار الاتصال بالسيرفر
        binding.btnTestConnection.setOnClickListener { testConnection() }

        // معلومات المطور
        binding.btnDevInfoSettings.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle(getString(R.string.settings_dev_title))
                .setMessage(getString(R.string.settings_dev_message, packageManager.getPackageInfo(packageName, 0).versionName ?: "-"))
                .setPositiveButton(getString(R.string.settings_ok), null)
                .show()
        }

        // تسجيل الخروج من الإعدادات
        binding.btnLogoutSettings.setOnClickListener {
            prefs.edit().clear().apply()
            val intent = Intent(this, LoginActivity::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            startActivity(intent)
            finish()
        }

        binding.btnBackSettings.setOnClickListener {
            finish()
        }
    }

    override fun onResume() {
        super.onResume()
        updateLocationStatus()
    }

    private fun updateLocationStatus() {
        val hasPermission = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val lm = getSystemService(LOCATION_SERVICE) as SystemLocationManager
        val gpsOn = lm.isProviderEnabled(SystemLocationManager.GPS_PROVIDER) ||
                lm.isProviderEnabled(SystemLocationManager.NETWORK_PROVIDER)

        binding.tvLocationStatus.text = when {
            hasPermission && gpsOn -> getString(R.string.settings_location_ready)
            hasPermission && !gpsOn -> getString(R.string.settings_location_gps_off)
            !hasPermission && gpsOn -> getString(R.string.settings_location_permission_missing)
            else -> getString(R.string.settings_location_all_off)
        }
    }

    private fun testConnection() {
        binding.tvServerStatusSettings.text = getString(R.string.settings_testing)
        binding.tvServerStatusSettings.setTextColor(0xFFFACC15.toInt())
        CoroutineScope(Dispatchers.IO).launch {
            var connected = false
            try {
                connected = RetrofitClient.apiService.ping().isSuccessful
            } catch (_: Exception) {
            }
            withContext(Dispatchers.Main) {
                if (connected) {
                    binding.tvServerStatusSettings.text = getString(R.string.settings_server_connected)
                    binding.tvServerStatusSettings.setTextColor(0xFF22C55E.toInt())
                    Toast.makeText(this@SettingsActivity, getString(R.string.settings_connection_success), Toast.LENGTH_SHORT).show()
                } else {
                    binding.tvServerStatusSettings.text = getString(R.string.settings_server_disconnected)
                    binding.tvServerStatusSettings.setTextColor(0xFFEF4444.toInt())
                    Toast.makeText(this@SettingsActivity, getString(R.string.settings_connection_failed), Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun applyLanguage(languageCode: String) {
        val localeList = LocaleListCompat.forLanguageTags(languageCode)
        AppCompatDelegate.setApplicationLocales(localeList)
    }
}
