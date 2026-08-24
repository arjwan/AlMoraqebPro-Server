package com.mohmmedali.almoraqebpro.ui

import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import com.mohmmedali.almoraqebpro.data.LoginRequest
import com.mohmmedali.almoraqebpro.data.RegisterEmployeeRequest
import com.mohmmedali.almoraqebpro.data.RetrofitClient
import com.mohmmedali.almoraqebpro.databinding.ActivityLoginBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
        val language = prefs.getString("app_language", "ar") ?: "ar"
        val themeMode = prefs.getInt("app_theme_mode", AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)

        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(language))
        AppCompatDelegate.setDefaultNightMode(themeMode)

        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // إنشاء deviceId من ANDROID_ID
        val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)

        binding.btnLogin.setOnClickListener {
            val companyId = binding.etCompanyId.text.toString().trim()
            val username = binding.etUsername.text.toString().trim()
            val password = binding.etPassword.text.toString()

            if (companyId.isEmpty() || username.isEmpty() || password.isEmpty()) {
                Toast.makeText(this, "يرجى ملء جميع الحقول", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            login(companyId, username, password, deviceId)
        }

        binding.btnAddEmployee.setOnClickListener {
            startActivity(Intent(this, RegisterEmployeeActivity::class.java))
        }
        binding.btnDevInfo.setOnClickListener { showDeveloperInfoDialog() }
    }

    override fun onResume() {
        super.onResume()
        checkServerStatus()
    }

    private fun checkServerStatus() {
        binding.tvServerStatus.text = "⏳ جارٍ فحص الاتصال بالسيرفر..."
        binding.tvServerStatus.setTextColor(0xFFFACC15.toInt())
        CoroutineScope(Dispatchers.IO).launch {
            var connected = false
            try {
                connected = RetrofitClient.apiService.ping().isSuccessful
            } catch (_: Exception) {
            }
            withContext(Dispatchers.Main) {
                if (connected) {
                    binding.tvServerStatus.text = "🟢 السيرفر متصل"
                    binding.tvServerStatus.setTextColor(0xFF22C55E.toInt())
                } else {
                    binding.tvServerStatus.text = "🔴 غير متصل بالسيرفر"
                    binding.tvServerStatus.setTextColor(0xFFEF4444.toInt())
                }
            }
        }
    }

    private fun showDeveloperInfoDialog() {
        AlertDialog.Builder(this)
            .setTitle("ℹ️ معلومات المطور")
            .setMessage(
                "التطبيق: المراقب برو - تطبيق الموظفين\n" +
                "الإصدار: 4.0.1\n\n" +
                "لتواصل والدعم الفني يرجى مراجعة إدارة الشركة."
            )
            .setPositiveButton("حسناً", null)
            .show()
    }

    private fun login(companyId: String, username: String, password: String, deviceId: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val response = RetrofitClient.apiService.login(
                    LoginRequest(companyId, username, password, deviceId)
                )

                if (response.isSuccessful && response.body()?.success == true) {
                    val emp = response.body()?.employee
                    if (emp != null && emp.id != null) {
                        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
                        prefs.edit()
                            .putString("employeeId", emp.id)
                            .putString("companyId", emp.companyId ?: companyId)
                            .putString("employeeName", emp.name)
                            .putString("deviceId", deviceId)
                            .apply()

                        withContext(Dispatchers.Main) {
                            Toast.makeText(this@LoginActivity, "تم تسجيل الدخول بنجاح", Toast.LENGTH_SHORT).show()
                            startActivity(Intent(this@LoginActivity, DashboardActivity::class.java))
                            finish()
                        }
                    } else {
                        withContext(Dispatchers.Main) {
                            Toast.makeText(this@LoginActivity,
                                response.body()?.message ?: "بيانات الدخول غير صحيحة",
                                Toast.LENGTH_SHORT).show()
                        }
                    }
                } else {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(
                            this@LoginActivity,
                            response.body()?.message ?: ("فشل تسجيل الدخول (رمز " + response.code() + ")"),
                            Toast.LENGTH_LONG
                        ).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(
                        this@LoginActivity,
                        "تعذر الاتصال بالخادم، تحقق من الإنترنت",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }
}
