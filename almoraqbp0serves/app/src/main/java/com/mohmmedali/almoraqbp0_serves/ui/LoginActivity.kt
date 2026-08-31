package com.mohmmedali.almoraqebpro.ui

import com.mohmmedali.almoraqebpro.R
import com.mohmmedali.almoraqebpro.AlmoraqebApp

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
import com.mohmmedali.almoraqebpro.data.OfflineAuthStore
import com.mohmmedali.almoraqebpro.data.RegisterEmployeeRequest
import com.mohmmedali.almoraqebpro.data.RetrofitClient
import com.mohmmedali.almoraqebpro.databinding.ActivityLoginBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException

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

        val selectedLanguageButton = when (language) {
            "en" -> R.id.rbLoginEnglish
            "ku" -> R.id.rbLoginKurdish
            "fa" -> R.id.rbLoginPersian
            else -> R.id.rbLoginArabic
        }
        binding.rgLoginLanguage.check(selectedLanguageButton)
        binding.rgLoginLanguage.setOnCheckedChangeListener { _, checkedId ->
            val selectedLanguage = when (checkedId) {
                R.id.rbLoginEnglish -> "en"
                R.id.rbLoginKurdish -> "ku"
                R.id.rbLoginPersian -> "fa"
                else -> "ar"
            }
            if (selectedLanguage != prefs.getString("app_language", "ar")) {
                prefs.edit().putString("app_language", selectedLanguage).apply()
                AppCompatDelegate.setApplicationLocales(
                    LocaleListCompat.forLanguageTags(selectedLanguage)
                )
            }
        }

        // إنشاء deviceId من ANDROID_ID
        val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)

        binding.btnLogin.setOnClickListener {
            val companyId = binding.etCompanyId.text.toString().trim()
            val username = binding.etUsername.text.toString().trim()
            val password = binding.etPassword.text.toString()

            if (companyId.isEmpty() || username.isEmpty() || password.isEmpty()) {
                Toast.makeText(this, getString(R.string.login_fill_all_fields), Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            login(companyId, username, password, deviceId)
        }

        binding.btnAddEmployee.setOnClickListener {
            startActivity(Intent(this, RegisterEmployeeActivity::class.java))
        }

        // البلاطة الداكنة "تسجيل دخول" تنزل إلى النموذج
        binding.btnDevInfo.setOnClickListener {
            binding.etCompanyId.requestFocus()
            findViewById<android.view.View>(android.R.id.content).scrollTo(0, 400)
        }

        binding.btnWhatsApp.setOnClickListener {
            try {
                startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW,
                    android.net.Uri.parse("https://wa.me/9647807807491")))
            } catch (e: Exception) {
                Toast.makeText(this, getString(R.string.login_whatsapp_unavailable), Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnEmail.setOnClickListener {
            try {
                startActivity(android.content.Intent(android.content.Intent.ACTION_SENDTO,
                    android.net.Uri.parse("mailto:mohmmed1628@gmail.com")))
            } catch (e: Exception) {
                Toast.makeText(this, getString(R.string.login_email_unavailable), Toast.LENGTH_SHORT).show()
            }
        }

        binding.cardDevInfo.setOnClickListener { showDeveloperInfoDialog() }
        binding.btnDevInfo.setOnClickListener { showDeveloperInfoDialog() }
    }

    override fun onResume() {
        super.onResume()
        checkServerStatus()
    }

    private fun checkServerStatus() {
        binding.tvServerStatus.text = getString(R.string.login_server_checking_full)
        binding.tvServerStatus.setTextColor(0xFFFACC15.toInt())
        CoroutineScope(Dispatchers.IO).launch {
            var connected = false
            try {
                connected = RetrofitClient.apiService.ping().isSuccessful
            } catch (_: Exception) {
            }
            withContext(Dispatchers.Main) {
                if (connected) {
                    binding.tvServerStatus.text = getString(R.string.login_server_connected)
                    binding.tvServerStatus.setTextColor(0xFF22C55E.toInt())
                } else {
                    binding.tvServerStatus.text = getString(R.string.login_server_disconnected)
                    binding.tvServerStatus.setTextColor(0xFFEF4444.toInt())
                }
            }
        }
    }

    private fun showDeveloperInfoDialog() {
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.login_developer_title))
            .setMessage(getString(R.string.login_developer_info))
            .setPositiveButton(getString(R.string.login_whatsapp_button)) { _, _ ->
                try {
                    startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW,
                        android.net.Uri.parse("https://wa.me/9647807807491")))
                } catch (e: Exception) {
                    Toast.makeText(this, getString(R.string.login_whatsapp_unavailable), Toast.LENGTH_SHORT).show()
                }
            }
            .setNeutralButton(getString(R.string.login_email_button)) { _, _ ->
                try {
                    startActivity(android.content.Intent(android.content.Intent.ACTION_SENDTO,
                        android.net.Uri.parse("mailto:mohmmed1628@gmail.com")))
                } catch (e: Exception) {
                    Toast.makeText(this, getString(R.string.login_email_unavailable), Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton(getString(R.string.login_close), null)
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
                        OfflineAuthStore(this@LoginActivity).saveVerified(
                            employee = emp,
                            companyId = emp.companyId ?: companyId,
                            username = username,
                            password = password,
                            deviceId = deviceId
                        )
                        prefs.edit()
                            .putString("employeeId", emp.id)
                            .putString("companyId", emp.companyId ?: companyId)
                            .putString("employeeName", emp.name)
                            .putString("deviceId", deviceId)
                            .putString("username", username)
                            .putBoolean("authenticated", true)
                            .putBoolean("offlineSession", false)
                            .apply()

                        withContext(Dispatchers.Main) {
                            (application as AlmoraqebApp).sessionUnlocked = true
                            Toast.makeText(this@LoginActivity, getString(R.string.login_success), Toast.LENGTH_SHORT).show()
                            startActivity(Intent(this@LoginActivity, DashboardActivity::class.java))
                            finish()
                        }
                    } else {
                        withContext(Dispatchers.Main) {
                            Toast.makeText(this@LoginActivity,
                                response.body()?.message ?: getString(R.string.login_invalid_credentials),
                                Toast.LENGTH_SHORT).show()
                        }
                    }
                } else {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(
                            this@LoginActivity,
                            response.body()?.message ?: getString(R.string.login_failed_code, response.code()),
                            Toast.LENGTH_LONG
                        ).show()
                    }
                }
            } catch (e: IOException) {
                val verified = OfflineAuthStore(this@LoginActivity).verify(
                    companyId, username, password, deviceId
                )

                withContext(Dispatchers.Main) {
                    if (verified) {
                        OfflineAuthStore(this@LoginActivity)
                            .restoreVerifiedSession(this@LoginActivity)
                        (application as AlmoraqebApp).sessionUnlocked = true
                        Toast.makeText(this@LoginActivity, getString(R.string.login_offline_success), Toast.LENGTH_SHORT).show()
                        startActivity(Intent(this@LoginActivity, DashboardActivity::class.java))
                        finish()
                    } else {
                        Toast.makeText(this@LoginActivity, getString(R.string.login_offline_not_verified), Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@LoginActivity, getString(R.string.login_connection_error), Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}
