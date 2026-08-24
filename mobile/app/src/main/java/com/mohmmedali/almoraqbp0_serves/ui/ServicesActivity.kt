package com.mohmmedali.almoraqebpro.ui

import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.mohmmedali.almoraqebpro.data.RetrofitClient
import com.mohmmedali.almoraqebpro.data.ServiceRequest
import com.mohmmedali.almoraqebpro.databinding.ActivityServicesBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ServicesActivity : AppCompatActivity() {

    private lateinit var binding: ActivityServicesBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityServicesBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.btnSubmitLoan.setOnClickListener {
            submitService("loan")
        }

        binding.btnSubmitLeave.setOnClickListener {
            submitService("leave")
        }

        binding.btnSubmitAmbulance.setOnClickListener {
            submitService("ambulance")
        }

        // حركة ظهور خفيفة
        val cards = listOf(binding.btnSubmitLoan, binding.btnSubmitLeave, binding.btnSubmitAmbulance)
        cards.forEachIndexed { i, v ->
            v.alpha = 0f
            v.translationY = 40f
            v.animate().alpha(1f).translationY(0f).setDuration(350).setStartDelay((i * 80L)).start()
        }
    }

    private fun submitService(type: String) {
        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
        val employeeId = prefs.getString("employeeId", "") ?: ""
        val deviceId = prefs.getString("deviceId", "")
            ?: Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        val companyId = prefs.getString("companyId", "") ?: ""

        val amount = binding.etLoanAmount.text.toString().toDoubleOrNull()
        val loanReason = binding.etLoanReason.text.toString().trim()
        val leaveDate = binding.etLeaveDate.text.toString().trim()
        val leaveReason = binding.etLeaveReason.text.toString().trim()

        if (employeeId.isEmpty() || deviceId.isEmpty()) {
            Toast.makeText(this, "بيانات الموظف غير مكتملة، سجل الدخول أولاً", Toast.LENGTH_SHORT).show()
            return
        }

        when (type) {
            "loan" -> {
                if (amount == null || amount <= 0 || loanReason.isEmpty()) {
                    Toast.makeText(this, "أدخل مبلغًا صحيحًا وسبب السلفة", Toast.LENGTH_SHORT).show()
                    return
                }
                sendRequest(ServiceRequest(employeeId, deviceId, companyId, "loan", amount, loanReason, null))
            }
            "leave" -> {
                if (leaveDate.isEmpty() || leaveReason.isEmpty()) {
                    Toast.makeText(this, "أدخل تاريخ الإجازة وسببها", Toast.LENGTH_SHORT).show()
                    return
                }
                sendRequest(ServiceRequest(employeeId, deviceId, companyId, "leave", null, leaveReason, leaveDate))
            }
            "ambulance" -> {
                val ambReason = binding.etAmbulanceReason.text.toString().trim()
                if (ambReason.isEmpty()) {
                    Toast.makeText(this, "يرجى وصف الحالة أو سبب طلب الإسعاف", Toast.LENGTH_SHORT).show()
                    return
                }
                sendRequest(ServiceRequest(employeeId, deviceId, companyId, "ambulance", null, ambReason, null))
            }
        }
    }

    private fun sendRequest(request: ServiceRequest) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val response = RetrofitClient.apiService.sendServiceRequest(request)
                withContext(Dispatchers.Main) {
                    if (response.isSuccessful && response.body()?.success == true) {
                        Toast.makeText(
                            this@ServicesActivity,
                            "✅ ${response.body()?.message ?: "تم إرسال الطلب"}",
                            Toast.LENGTH_SHORT
                        ).show()
                        finish()
                    } else {
                        Toast.makeText(
                            this@ServicesActivity,
                            response.body()?.message ?: "فشل إرسال الطلب",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(
                        this@ServicesActivity,
                        "تعذر الاتصال بالخادم",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }
}