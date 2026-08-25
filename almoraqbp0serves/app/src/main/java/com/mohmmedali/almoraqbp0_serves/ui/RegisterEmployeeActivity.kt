package com.mohmmedali.almoraqebpro.ui

import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.mohmmedali.almoraqebpro.R
import com.mohmmedali.almoraqebpro.data.EmployeeJoinRequest
import com.mohmmedali.almoraqebpro.data.RetrofitClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class RegisterEmployeeActivity : AppCompatActivity() {

    private var isSubmitting = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_register_employee)
        setTitle("طلب انضمام موظف جديد")

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
            if (isSubmitting) return@setOnClickListener

            val salaryValue = salary.text.toString().trim().toDoubleOrNull()
            val workHoursValue = workHours.text.toString().trim().toIntOrNull()

            if (companyId.text.toString().trim().isEmpty() || name.text.toString().trim().isEmpty()) {
                Toast.makeText(this, "⚠️ أدخل رمز الشركة واسم الموظف", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            if (salaryValue == null || salaryValue <= 0) {
                Toast.makeText(this, "⚠️ أدخل راتباً صحيحاً أكبر من صفر", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            if (workHoursValue == null || workHoursValue <= 0) {
                Toast.makeText(this, "⚠️ أدخل ساعات عمل صحيحة أكبر من صفر", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }

            val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: ""

            isSubmitting = true
            submit.isEnabled = false
            submit.text = "جارٍ الإرسال..."

            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val response = RetrofitClient.apiService.submitEmployeeRequest(
                        EmployeeJoinRequest(
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
                            deviceId = deviceId
                        )
                    )
                    withContext(Dispatchers.Main) {
                        if (response.isSuccessful && response.body()?.success == true) {
                            Toast.makeText(this@RegisterEmployeeActivity,
                                response.body()?.message ?: "✅ تم إرسال الطلب بنجاح",
                                Toast.LENGTH_LONG).show()
                            finish()
                        } else {
                            Toast.makeText(this@RegisterEmployeeActivity,
                                response.body()?.message ?: "فشل إرسال الطلب (رمز ${response.code()})",
                                Toast.LENGTH_LONG).show()
                        }
                    }
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@RegisterEmployeeActivity,
                        "تعذر الاتصال بالسيرفر. تحقق من الإنترنت وحاول مرة أخرى.",
                            Toast.LENGTH_LONG).show()
                    }
                } finally {
                    isSubmitting = false
                    withContext(Dispatchers.Main) {
                        submit.isEnabled = true
                        submit.text = "إرسال الطلب"
                    }
                }
            }
        }
    }
}
