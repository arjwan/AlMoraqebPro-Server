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

        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
        val savedLanguage = prefs.getString("app_language", "ar") ?: "ar"
        val savedThemeMode = prefs.getInt("app_theme_mode", AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)

        binding.rbArabic.isChecked = savedLanguage == "ar"
        binding.rbEnglish.isChecked = savedLanguage == "en"

        when (savedThemeMode) {
            AppCompatDelegate.MODE_NIGHT_NO -> binding.rbLight.isChecked = true
            AppCompatDelegate.MODE_NIGHT_YES -> binding.rbDark.isChecked = true
            else -> binding.rbSystem.isChecked = true
        }

        binding.rgLanguage.setOnCheckedChangeListener { _, checkedId ->
            val selectedLanguage = when (checkedId) {
                R.id.rbArabic -> "ar"
                R.id.rbEnglish -> "en"
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

        binding.tvEmployeeNameInfo.text = "الاسم: $employeeName"
        binding.tvDeviceIdInfo.text = "Device ID: $deviceId"
        binding.tvCompanyIdInfo.text = "رمز الشركة: $companyId"

        // حالة الموقع
        updateLocationStatus()

        // اختبار الاتصال بالسيرفر
        binding.btnTestConnection.setOnClickListener { testConnection() }

        // معلومات المطور
        binding.btnDevInfoSettings.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("ℹ️ معلومات المطور")
                .setMessage(
                    "المطور: محمد علي\n\n" +
                    "التطبيق: المراقب برو - تطبيق الموظفين\n" +
                    "الإصدار: 4.0.1\n\n" +
                    "للتواصل والدعم الفني يرجى مراجعة إدارة الشركة."
                )
                .setPositiveButton("حسناً", null)
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
            hasPermission && gpsOn -> "✅ الصلاحية ممنوحة و GPS مفعّل"
            hasPermission && !gpsOn -> "⚠️ الصلاحية ممنوحة لكن GPS مغلق — فعّله من الإعدادات"
            !hasPermission && gpsOn -> "⚠️ GPS مفعّل لكن إذن الموقع غير ممنوح"
            else -> "❌ لا توجد صلاحية موقع و GPS مغلق"
        }
    }

    private fun testConnection() {
        binding.tvServerStatusSettings.text = "⏳ جارٍ الاختبار..."
        binding.tvServerStatusSettings.setTextColor(0xFFFACC15.toInt())
        CoroutineScope(Dispatchers.IO).launch {
            var connected = false
            try {
                connected = RetrofitClient.apiService.ping().isSuccessful
            } catch (_: Exception) {
            }
            withContext(Dispatchers.Main) {
                if (connected) {
                    binding.tvServerStatusSettings.text = "🟢 متصل — السيرفر يعمل"
                    binding.tvServerStatusSettings.setTextColor(0xFF22C55E.toInt())
                    Toast.makeText(this@SettingsActivity, "الاتصال ناجح ✅", Toast.LENGTH_SHORT).show()
                } else {
                    binding.tvServerStatusSettings.text = "🔴 غير متصل — تحقق من الإنترنت"
                    binding.tvServerStatusSettings.setTextColor(0xFFEF4444.toInt())
                    Toast.makeText(this@SettingsActivity, "فشل الاتصال بالسيرفر ❌", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun applyLanguage(languageCode: String) {
        val localeList = LocaleListCompat.forLanguageTags(languageCode)
        AppCompatDelegate.setApplicationLocales(localeList)
    }
}
