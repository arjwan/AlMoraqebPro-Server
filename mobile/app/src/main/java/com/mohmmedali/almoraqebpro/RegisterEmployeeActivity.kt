package com.mohmmedali.almoraqebpro

import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.mohmmedali.almoraqebpro.data.network.EmployeeRequestPayload
import com.mohmmedali.almoraqebpro.data.network.RetrofitClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class RegisterEmployeeActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "RegisterEmployeeActivity"
    }

    private var isSubmitting = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_register_employee)

        val companyId = findViewById<EditText>(R.id.etCompanyId)
        val companyName = findViewById<EditText>(R.id.etCompanyName)
        val name = findViewById<EditText>(R.id.etName)
        val phoneNumber = findViewById<EditText>(R.id.etPhoneNumber)
        val jobTitle = findViewById<EditText>(R.id.etJobTitle)
        val workLocation = findViewById<EditText>(R.id.etWorkLocation)
        val salary = findViewById<EditText>(R.id.etSalary)
        val shift = findViewById<EditText>(R.id.etShift)
        val workHours = findViewById<EditText>(R.id.etWorkHours)
        val wageType = findViewById<EditText>(R.id.etWageType)
        val socialSecurity = findViewById<EditText>(R.id.etSocialSecurity)
        val location = findViewById<EditText>(R.id.etLocation)
        val submit = findViewById<Button>(R.id.btnSubmitRequest)

        submit.setOnClickListener {
            Log.d(TAG, "BUTTON_CLICK")

            // منع الضغط المزدوج أثناء الإرسال
            if (isSubmitting) {
                Log.d(TAG, "BUTTON_CLICK ignored (already submitting)")
                return@setOnClickListener
            }

            // تحويل آمن للحقول الرقمية (بدون إرسال نصوص للسيرفر)
            val salaryValue = salary.text.toString().trim().toDoubleOrNull()
            val workHoursValue = workHours.text.toString().trim().toIntOrNull()

            if (salaryValue == null || salaryValue <= 0) {
                Log.w(TAG, "VALIDATION_FAILED salary=$salaryValue")
                Toast.makeText(this, "⚠️ أدخل راتباً صحيحاً أكبر من صفر", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            if (workHoursValue == null || workHoursValue <= 0) {
                Log.w(TAG, "VALIDATION_FAILED workHours=$workHoursValue")
                Toast.makeText(this, "⚠️ أدخل ساعات عمل صحيحة أكبر من صفر", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }

            val payload = EmployeeRequestPayload(
                companyId = companyId.text.toString().trim(),
                companyName = companyName.text.toString().trim(),
                name = name.text.toString().trim(),
                phoneNumber = phoneNumber.text.toString().trim(),
                jobTitle = jobTitle.text.toString().trim(),
                workLocation = workLocation.text.toString().trim(),
                salary = salaryValue,
                shift = shift.text.toString().trim(),
                workHours = workHoursValue,
                wageType = wageType.text.toString().trim(),
                socialSecurity = socialSecurity.text.toString().trim(),
                location = location.text.toString().trim(),
                deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
            )

            if (payload.companyId.isBlank() || payload.name.isBlank()) {
                Log.w(TAG, "VALIDATION_FAILED missing companyId or name")
                Toast.makeText(this, "يجب إدخال رمز الشركة واسم الموظف", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }

            sendRequest(payload, submit)
        }
    }

    private fun sendRequest(payload: EmployeeRequestPayload, submit: Button) {
        isSubmitting = true
        submit.isEnabled = false
        submit.text = "جاري إرسال الطلب..."
        Toast.makeText(this, "جاري إرسال الطلب...", Toast.LENGTH_SHORT).show()
        Log.d(TAG, "REQUEST_START companyId=${payload.companyId} name=${payload.name}")

        // lifecycleScope: لا تُلغى Coroutine إلا عند إغلاق الشاشة فعلياً،
        // والنتيجة تُعالج على الـ Main thread دائماً.
        lifecycleScope.launch {
            try {
                val response = withContext(Dispatchers.IO) {
                    RetrofitClient.apiService.submitEmployeeRequest(payload)
                }
                Log.d(TAG, "HTTP_CODE=${response.code()}")

                val body = response.body()
                val errorText = if (!response.isSuccessful) {
                    try { response.errorBody()?.string() } catch (_: Exception) { null }
                } else null
                Log.d(TAG, "RESPONSE_BODY success=${body?.success} message=${body?.message} error=$errorText")

                if (response.isSuccessful && body?.success == true) {
                    Log.i(TAG, "REQUEST_SUCCESS requestId=${body.requestId}")
                    Toast.makeText(
                        this@RegisterEmployeeActivity,
                        body.message.ifBlank { "تم إرسال طلب التسجيل بنجاح، بانتظار موافقة الإدارة" },
                        Toast.LENGTH_LONG
                    ).show()
                    // إنهاء الشاشة فقط بعد تأكد النجاح
                    finish()
                } else {
                    val serverMessage = body?.message
                        ?: parseError(errorText)
                        ?: "فشل إرسال طلب الموظف"
                    Log.w(TAG, "REQUEST_FAILED code=${response.code()} message=$serverMessage")
                    Toast.makeText(
                        this@RegisterEmployeeActivity,
                        "تعذر إرسال الطلب: $serverMessage",
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (e: Exception) {
                Log.e(TAG, "EXCEPTION", e)
                val message = when {
                    e.message?.contains("timeout", true) == true -> "انتهت مهلة الاتصال بالسيرفر"
                    e.message?.contains("Unable to resolve host", true) == true -> "لا يوجد اتصال بالإنترنت"
                    else -> "تعذر الاتصال بالسيرفر. تحقق من الإنترنت وحاول مرة أخرى."
                }
                Toast.makeText(this@RegisterEmployeeActivity, message, Toast.LENGTH_LONG).show()
            } finally {
                isSubmitting = false
                submit.isEnabled = true
                submit.text = "إرسال الطلب"
                Log.d(TAG, "REQUEST_ENDED (button re-enabled)")
            }
        }
    }

    private fun parseError(errorText: String?): String? {
        if (errorText.isNullOrBlank()) return null
        return try {
            val json = org.json.JSONObject(errorText)
            json.optString("message", null) ?: json.optString("error", null)
        } catch (_: Exception) {
            null
        }
    }
}
