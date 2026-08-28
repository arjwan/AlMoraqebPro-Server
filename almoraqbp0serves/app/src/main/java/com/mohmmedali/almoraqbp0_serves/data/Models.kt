package com.mohmmedali.almoraqebpro.data

import com.google.gson.annotations.SerializedName

// ========== طلبات واستجابات تسجيل الدخول ==========
data class LoginRequest(
    val companyId: String,
    val username: String,
    val password: String,
    val deviceId: String
)

data class Employee(
    @SerializedName("_id") val id: String?,
    val name: String?,
    val username: String?,
    val specialty: String?,
    val workplace: String?,
    val companyId: String?,
    val deviceId: String?,
    val credentialsStatus: String?,
    val status: String?,
    val salary: Double?
)

data class LoginResponse(
    val success: Boolean,
    val message: String?,
    val employee: Employee?
)

// ========== البصمة والحضور ==========
data class ChallengeResponse(
    val success: Boolean,
    val challengeId: String?,
    val challenge: String?,
    val message: String?
)

data class AttendanceRequest(
    val employeeId: String,
    val deviceId: String,
    val challengeId: String,
    val fingerprintToken: String,
    val latitude: Double,
    val longitude: Double,
    val type: String, // "attendance" أو "departure"
    val timestamp: String
)

data class AttendanceResponse(
    val success: Boolean,
    val message: String?,
    val attendanceId: String?
)

// ========== طلبات الخدمات (سلفة / إجازة) ==========
data class ServiceRequest(
    val employeeId: String,
    val deviceId: String,
    val companyId: String?,
    val type: String, // "loan" أو "leave"
    val amount: Double?,
    val reason: String?,
    val requestedDate: String?,
    val fromDate: String? = null,
    val toDate: String? = null,
    val leavePaymentType: String? = null
)

data class ServiceResponse(
    val success: Boolean,
    val message: String?,
    val requestId: String?
)

// ========== الإشعارات وسجل الحضور ==========
data class Notification(
    @SerializedName("_id") val id: String?,
    val type: String?,
    val message: String?,
    val audioUrl: String?,
    val priority: String?,
    val readAt: String?,
    val listenedAt: String?,
    val createdAt: String?
)

data class NotificationsResponse(
    val success: Boolean,
    val message: String?,
    val notifications: List<Notification>?
)

data class ServiceRequestItem(
    val type: String?,
    val reason: String?,
    val amount: Double?,
    val status: String?,
    val createdAt: String?
)

data class MyRequestsResponse(
    val success: Boolean,
    val message: String?,
    val requests: List<ServiceRequestItem>?
)

data class AttendanceItem(
    val type: String?,
    val timestamp: String?,
    val latitude: Double?,
    val longitude: Double?
)

data class AttendanceHistoryResponse(
    val success: Boolean,
    val message: String?,
    val attendance: List<AttendanceItem>?
)
// ========== فحص الاتصال بالسيرفر ==========
data class PingResponse(
    val success: Boolean,
    val message: String?
)

// ========== تسجيل موظف جديد من شاشة الدخول ==========
data class RegisterEmployeeRequest(
    val companyId: String,
    val name: String,
    val username: String,
    val password: String
)

data class RegisterResponse(
    val success: Boolean,
    val message: String?
)

// ========== إرسال الموقع الحالي ==========
data class LocationUpdateRequest(
    val employeeId: String,
    val deviceId: String,
    val latitude: Double,
    val longitude: Double,
    val timestamp: String
)

data class LocationUpdateResponse(
    val success: Boolean,
    val message: String?
)

// ========== طلب انضمام موظف جديد (من النسخة القديمة mobile) ==========
data class EmployeeJoinRequest(
    val companyId: String,
    val companyName: String = "",
    val name: String,
    val phoneNumber: String = "",
    val jobTitle: String = "",
    val workLocation: String = "",
    val salary: Double? = null,
    val shift: String = "",
    val workHours: Int? = null,
    val wageType: String = "",
    val socialSecurity: String = "",
    val location: String = "",
    val deviceId: String = ""
)

data class EmployeeJoinResponse(
    val success: Boolean,
    val message: String?
)
