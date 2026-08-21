package com.mohmmedali.almoraqebpro

import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.mohmmedali.almoraqebpro.data.network.EmployeeRequestPayload
import com.mohmmedali.almoraqebpro.data.network.RetrofitClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class RegisterEmployeeActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "RegisterEmployeeActivity"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_register_employee)

        val companyId = findViewById<EditText>(R.id.etCompanyId)
        val companyName = findViewById<EditText>(R.id.etCompanyName)
        val name = findViewById<EditText>(R.id.etName)
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
            val payload = EmployeeRequestPayload(
                companyId = companyId.text.toString().trim(),
                companyName = companyName.text.toString().trim(),
                name = name.text.toString().trim(),
                jobTitle = jobTitle.text.toString().trim(),
                workLocation = workLocation.text.toString().trim(),
                salary = salary.text.toString().trim(),
                shift = shift.text.toString().trim(),
                workHours = workHours.text.toString().trim(),
                wageType = wageType.text.toString().trim(),
                socialSecurity = socialSecurity.text.toString().trim(),
                location = location.text.toString().trim(),
                deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
            )

            if (payload.companyId.isBlank() || payload.name.isBlank()) {
                Toast.makeText(this, "يجب إدخال رمز الشركة واسم الموظف", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }

            sendRequest(payload)
        }
    }

    private fun sendRequest(payload: EmployeeRequestPayload) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val response = RetrofitClient.apiService.submitEmployeeRequest(payload)
                val body = response.body()

                withContext(Dispatchers.Main) {
                    if (response.isSuccessful && body?.success == true) {
                        Toast.makeText(this@RegisterEmployeeActivity, body.message.ifBlank { "تم إرسال طلب الموظف بنجاح" }, Toast.LENGTH_LONG).show()
                        finish()
                    } else {
                        val message = body?.message ?: "فشل إرسال طلب الموظف"
                        Toast.makeText(this@RegisterEmployeeActivity, message, Toast.LENGTH_LONG).show()
                        Log.w(TAG, "Employee request failed HTTP=${response.code()} message=$message")
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    val message = when {
                        e.message?.contains("timeout", true) == true -> "انتهت مهلة الاتصال بالسيرفر"
                        e.message?.contains("Unable to resolve host", true) == true -> "لا يوجد اتصال بالإنترنت"
                        else -> "تعذر إرسال الطلب: ${e.localizedMessage ?: "خطأ غير معروف"}"
                    }
                    Toast.makeText(this@RegisterEmployeeActivity, message, Toast.LENGTH_LONG).show()
                    Log.e(TAG, "Employee registration request failed", e)
                }
            }
        }
    }
}
