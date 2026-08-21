package com.mohmmedali.almoraqebpro

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.mohmmedali.almoraqebpro.data.network.MobileLoginRequest
import com.mohmmedali.almoraqebpro.data.network.RetrofitClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class LoginActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "LoginActivity"
        const val PREFS_NAME = "almoraqeb_auth"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        val etCompanyId = findViewById<EditText>(R.id.etCompanyId)
        val etUsername = findViewById<EditText>(R.id.etUsername)
        val etPassword = findViewById<EditText>(R.id.etPassword)
        val btnLogin = findViewById<Button>(R.id.btnLogin)
        val btnRegister = findViewById<Button>(R.id.btnRegisterEmployee)

        btnLogin.setOnClickListener {
            val companyId = etCompanyId.text.toString().trim()
            val username = etUsername.text.toString().trim()
            val password = etPassword.text.toString().trim()

            if (companyId.isEmpty() || username.isEmpty() || password.isEmpty()) {
                Toast.makeText(this, "أدخل رمز الشركة واسم المستخدم وكلمة المرور", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
            if (deviceId.isBlank()) {
                Toast.makeText(this, "تعذر تحديد معرف الجهاز، حاول مرة أخرى", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            login(companyId, username, password, deviceId)
        }

        btnRegister.setOnClickListener {
            startActivity(Intent(this, RegisterEmployeeActivity::class.java))
        }
    }

    private fun login(companyId: String, username: String, password: String, deviceId: String) {
        val request = MobileLoginRequest(companyId, username, password, deviceId)

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val response = RetrofitClient.apiService.login(request)
                val body = response.body()

                withContext(Dispatchers.Main) {
                    if (response.isSuccessful && body?.success == true) {
                        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                        prefs.edit()
                            .putString("companyId", companyId)
                            .putString("username", username)
                            .putString("employeeId", body.employee?.id ?: body.employee?.employeeId ?: "")
                            .putString("employeeName", body.employee?.name ?: username)
                            .putString("deviceId", deviceId)
                            .putBoolean("logged_in", true)
                            .apply()

                        Toast.makeText(this@LoginActivity, body.message.ifBlank { "تم تسجيل الدخول بنجاح" }, Toast.LENGTH_SHORT).show()
                        val intent = Intent(this@LoginActivity, DashboardActivity::class.java)
                        startActivity(intent)
                        finish()
                    } else {
                        val message = body?.message ?: "فشل تسجيل الدخول"
                        Toast.makeText(this@LoginActivity, message, Toast.LENGTH_LONG).show()
                        Log.w(TAG, "Login failed: HTTP=${response.code()} message=$message")
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    val message = when {
                        e.message?.contains("timeout", true) == true -> "انتهت مهلة الاتصال بالسيرفر"
                        e.message?.contains("Unable to resolve host", true) == true -> "لا يوجد اتصال بالإنترنت"
                        else -> "تعذر الاتصال بالسيرفر: ${e.localizedMessage ?: "خطأ غير معروف"}"
                    }
                    Toast.makeText(this@LoginActivity, message, Toast.LENGTH_LONG).show()
                    Log.e(TAG, "Login network error", e)
                }
            }
        }
    }
}