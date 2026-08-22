package com.mohmmedali.almoraqebpro.ui

import android.util.Log
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mohmmedali.almoraqebpro.data.network.RetrofitClient
import com.mohmmedali.almoraqebpro.data.model.Company
import com.mohmmedali.almoraqebpro.data.network.AttendanceRequest
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainViewModel : ViewModel() {

    private val _companies = MutableLiveData<List<Company>>()
    val companies: LiveData<List<Company>> get() = _companies

    private val _error = MutableLiveData<String>()
    val error: LiveData<String> get() = _error

    private val _attendanceResult = MutableLiveData<String>()
    val attendanceResult: LiveData<String> get() = _attendanceResult

    // دالة جلب الشركات
    fun fetchCompanies() {
        viewModelScope.launch {
            try {
                val response = RetrofitClient.apiService.getCompanies()
                if (response.isSuccessful && (response.body() != null)) {
                    _companies.value = response.body()
                } else {
                    _error.value = "فشل في جلب البيانات من السيرفر"
                }
            } catch (e: Exception) {
                _error.value = "خطأ في الاتصال: ${e.localizedMessage}"
            }
        }
    }

    // دالة إرسال البصمة والموقع الجغرافي
    fun submitAttendance(employeeId: String, deviceId: String, challengeId: String, fingerprintToken: String, latitude: Double, longitude: Double) {
        val currentTime = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date())

        val request = AttendanceRequest(
            employeeId = employeeId,
            deviceId = deviceId,
            challengeId = challengeId,
            fingerprintToken = fingerprintToken,
            latitude = latitude,
            longitude = longitude,
            timestamp = currentTime,
        )

        viewModelScope.launch {
            try {
                val response = RetrofitClient.apiService.sendAttendance(request)
                if (response.isSuccessful && response.body()?.success == true) {
                    _attendanceResult.value = response.body()?.message ?: "تم تسجيل الحضور بنجاح"
                } else {
                    _error.value = response.body()?.message ?: "فشل تسجيل الحضور"
                }
            } catch (e: Exception) {
                _error.value = "خطأ في الشبكة: ${e.localizedMessage}"
            }
        }
    }
}