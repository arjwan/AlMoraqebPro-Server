package com.mohmmedali.almoraqebpro.data

import retrofit2.Response
import retrofit2.http.*

interface ApiService {

    // تسجيل دخول الموظف
    @POST("api/mobile/login")
    suspend fun login(@Body body: LoginRequest): Response<LoginResponse>

    // الحصول على تحدي البصمة
    @GET("api/attendance/challenge")
    suspend fun getChallenge(
        @Query("employeeId") employeeId: String,
        @Query("deviceId") deviceId: String
    ): Response<ChallengeResponse>

    @GET("api/employee/attendance-requirement")
    suspend fun getAttendanceRequirement(
        @Query("employeeId") employeeId: String,
        @Query("deviceId") deviceId: String
    ): Response<AttendanceRequirementResponse>

    // إرسال تسجيل الحضور/الانصراف
    @POST("api/attendance")
    suspend fun sendAttendance(@Body body: AttendanceRequest): Response<AttendanceResponse>

    // إرسال طلب خدمة (سلفة / إجازة)
    @POST("api/employee/service-request")
    suspend fun sendServiceRequest(@Body body: ServiceRequest): Response<ServiceResponse>

    // جلب طلبات الموظف
    @GET("api/employee/service-requests")
    suspend fun getMyRequests(
        @Query("employeeId") employeeId: String,
        @Query("deviceId") deviceId: String
    ): Response<MyRequestsResponse>

    // جلب إشعارات الموظف
    @GET("api/employee/notifications")
    suspend fun getNotifications(
        @Query("employeeId") employeeId: String,
        @Query("deviceId") deviceId: String
    ): Response<NotificationsResponse>

    // جلب سجل الحضور للموظف
    @GET("api/employees/{employeeId}/attendance")
    suspend fun getAttendanceHistory(
        @Path("employeeId") employeeId: String
    ): Response<AttendanceHistoryResponse>

    // طلب انضمام موظف جديد (التصميم القديم من mobile)
    @POST("api/employee/request")
    suspend fun submitEmployeeRequest(@Body body: EmployeeJoinRequest): Response<EmployeeJoinResponse>

    // فحص حالة السيرفر
    @GET("api/ping")
    suspend fun ping(): Response<PingResponse>

    // تسجيل موظف جديد (من شاشة الدخول)
    @POST("api/employee/register")
    suspend fun registerEmployee(@Body body: RegisterEmployeeRequest): Response<RegisterResponse>

    // إرسال الموقع الحالي للموظف
    @POST("api/employee/location")
    suspend fun sendLocation(@Body body: LocationUpdateRequest): Response<LocationUpdateResponse>
}
