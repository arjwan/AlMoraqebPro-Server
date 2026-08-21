package com.mohmmedali.almoraqebpro.data.network

import com.google.gson.annotations.SerializedName
import com.mohmmedali.almoraqebpro.data.model.Company
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface ApiService {

    @POST("api/mobile/login")
    suspend fun login(
        @Body request: MobileLoginRequest
    ): Response<MobileLoginResponse>

    @POST("api/employee/request")
    suspend fun submitEmployeeRequest(
        @Body request: EmployeeRequestPayload
    ): Response<EmployeeRequestResponse>

    @POST("api/attendance")
    suspend fun sendAttendance(
        @Body attendanceData: AttendanceRequest
    ): Response<ServerResponse>

    @GET("api/companies")
    suspend fun getCompanies(): Response<List<Company>>
}

data class MobileLoginRequest(
    val companyId: String,
    val username: String,
    val password: String,
    val deviceId: String
)

data class MobileLoginResponse(
    val success: Boolean,
    val message: String,
    val employee: EmployeeProfile? = null
)

data class EmployeeProfile(
    val id: String,
    val companyId: String,
    val username: String,
    val name: String,
    val deviceId: String? = null,
    @SerializedName("credentialsStatus") val credentialsStatus: String? = null,
    @SerializedName("status") val status: String? = null,
    @SerializedName("jobTitle") val jobTitle: String? = null,
    @SerializedName("employeeId") val employeeId: String? = null
)

data class EmployeeRequestPayload(
    val companyId: String,
    val companyName: String = "",
    val name: String,
    val jobTitle: String = "",
    val workLocation: String = "",
    val salary: String = "",
    val shift: String = "",
    val workHours: String = "",
    val wageType: String = "",
    val socialSecurity: String = "",
    val location: String = "",
    val deviceId: String = ""
)

data class EmployeeRequestResponse(
    val success: Boolean,
    val message: String,
    val requestId: String? = null,
    val status: String? = null
)

data class AttendanceRequest(
    val employeeId: String,
    val deviceId: String,
    val fingerprintToken: String,
    val latitude: Double,
    val longitude: Double,
    val type: String = "attendance",
    val timestamp: String? = null
)

data class ServerResponse(
    val success: Boolean,
    val message: String,
    val attendanceId: String? = null,
    val error: String? = null
)