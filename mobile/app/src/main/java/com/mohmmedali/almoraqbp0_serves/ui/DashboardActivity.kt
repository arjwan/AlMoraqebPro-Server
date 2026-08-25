package com.mohmmedali.almoraqebpro.ui

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager as SystemLocationManager
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.ContextCompat
import androidx.core.os.LocaleListCompat
import androidx.work.ExistingWorkPolicy
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.mohmmedali.almoraqebpro.data.AppDatabase
import com.mohmmedali.almoraqebpro.data.AttendanceRequest
import com.mohmmedali.almoraqebpro.data.LocationUpdateRequest
import com.mohmmedali.almoraqebpro.data.PendingAttendance
import com.mohmmedali.almoraqebpro.data.RetrofitClient
import com.mohmmedali.almoraqebpro.databinding.ActivityDashboardBinding
import com.mohmmedali.almoraqebpro.services.BiometricManager
import com.mohmmedali.almoraqebpro.services.LocationManager
import com.mohmmedali.almoraqebpro.services.SyncWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import org.json.JSONObject

class DashboardActivity : AppCompatActivity() {

    private lateinit var binding: ActivityDashboardBinding
    private lateinit var locationManager: LocationManager
    private val db by lazy { AppDatabase.getDatabase(this) }
    private var pendingType = "attendance"

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true) {
            Toast.makeText(this, "تم منح إذن الموقع", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(this, "يجب منح إذن الموقع لتسجيل الحضور", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
        val language = prefs.getString("app_language", "ar") ?: "ar"
        val themeMode = prefs.getInt("app_theme_mode", AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)

        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(language))
        AppCompatDelegate.setDefaultNightMode(themeMode)

        binding = ActivityDashboardBinding.inflate(layoutInflater)
        setContentView(binding.root)

        locationManager = LocationManager(this)

        val name = prefs.getString("employeeName", "موظف") ?: "موظف"
        binding.tvWelcome.text = "مرحباً $name"

        // عرض Device ID ورمز الشركة
        val shownDeviceId = prefs.getString("deviceId", "")
            ?: Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        binding.tvDeviceInfo.text = "Device ID: ${shownDeviceId ?: "-"}"
        binding.tvCompanyInfo.text = "رمز الشركة: ${prefs.getString("companyId", "-") ?: "-"}"

        // أزرار النسخة القديمة (btnCheckIn/btnCheckOut) + زر البصمة
        binding.btnCheckIn.setOnClickListener { startAttendance("attendance") }
        binding.btnCheckOut.setOnClickListener { startAttendance("exit") }
        binding.btnBiometricAttendance.setOnClickListener { startAttendance("attendance") }
        binding.btnServices.setOnClickListener {
            startActivity(Intent(this, ServicesActivity::class.java))
        }
        binding.btnNotifications.setOnClickListener {
            startActivity(Intent(this, NotificationActivity::class.java))
        }
        binding.btnSettings.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
        binding.btnSupport.setOnClickListener {
            startActivity(Intent(this, SupportActivity::class.java))
        }
        binding.btnLogout.setOnClickListener {
            prefs.edit().clear().apply()
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }

        binding.btnSendLocation.setOnClickListener { sendCurrentLocation() }

        checkServerStatus()
        scheduleSync()
        requestPermissionsIfNeeded()

        // حركة ظهور خفيفة للبطاقات (روح التطبيق القديم)
        val cards = listOf(binding.btnBiometricAttendance, binding.btnCheckIn, binding.btnCheckOut,
            binding.btnSendLocation, binding.btnServices, binding.btnNotifications)
        cards.forEachIndexed { i, v ->
            v.alpha = 0f
            v.translationY = 40f
            v.animate().alpha(1f).translationY(0f).setDuration(350).setStartDelay((i * 70L)).start()
        }
    }

    override fun onResume() {
        super.onResume()
        checkServerStatus()
    }

    private fun checkServerStatus() {
        CoroutineScope(Dispatchers.IO).launch {
            var connected = false
            try {
                connected = RetrofitClient.apiService.ping().isSuccessful
            } catch (_: Exception) {
            }
            withContext(Dispatchers.Main) {
                if (connected) {
                    binding.tvServerStatus.text = "🟢 السيرفر متصل"
                    binding.tvServerStatus.setTextColor(0xFF22C55E.toInt())
                } else {
                    binding.tvServerStatus.text = "🔴 غير متصل بالسيرفر"
                    binding.tvServerStatus.setTextColor(0xFFEF4444.toInt())
                }
            }
        }
    }

    /** التحقق من تفعيل GPS/خدمات الموقع على الجهاز */
    private fun isGpsEnabled(): Boolean {
        val lm = getSystemService(LOCATION_SERVICE) as SystemLocationManager
        return lm.isProviderEnabled(SystemLocationManager.GPS_PROVIDER) ||
                lm.isProviderEnabled(SystemLocationManager.NETWORK_PROVIDER)
    }

    private fun ensureGpsEnabled(): Boolean {
        if (isGpsEnabled()) return true
        AlertDialog.Builder(this)
            .setTitle("خدمات الموقع معطلة")
            .setMessage("يجب تفعيل GPS لتسجيل الحضور وإرسال الموقع. هل تريد فتح إعدادات الموقع؟")
            .setPositiveButton("فتح الإعدادات") { _, _ ->
                startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
            }
            .setNegativeButton("إلغاء", null)
            .show()
        return false
    }

    private fun requestPermissionsIfNeeded() {
        if (!locationManager.hasPermission()) {
            requestPermissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
        }
    }

    private fun startAttendance(type: String) {
        pendingType = type
        if (!ensureGpsEnabled()) return
        if (!locationManager.hasPermission()) {
            Toast.makeText(this, "يرجى منح إذن الموقع أولاً", Toast.LENGTH_SHORT).show()
            requestPermissionsIfNeeded()
            return
        }

        locationManager.getCurrentLocation { location ->
            if (location != null) {
                authenticateAndSend(type, location)
            } else {
                Toast.makeText(this, "تعذر الحصول على الموقع، تأكد من تفعيل GPS", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun authenticateAndSend(type: String, location: Location) {
        BiometricManager.authenticate(
            this,
            onSuccess = {
                CoroutineScope(Dispatchers.IO).launch {
                    sendAttendance(type, location)
                }
            },
            onError = { error ->
                Toast.makeText(this, "خطأ في البصمة: $error", Toast.LENGTH_SHORT).show()
            }
        )
    }

    private suspend fun sendAttendance(type: String, location: Location) {
        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
        val employeeId = prefs.getString("employeeId", "") ?: ""
        val deviceId = prefs.getString("deviceId", "")
            ?: Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)

        val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())
        var challengeId = "offline-${System.currentTimeMillis()}"
        var fingerprintToken = "biometric-verified-${System.currentTimeMillis()}"

        try {
            // محاولة جلب تحدي حقيقي من السيرفر
            val challengeRes = RetrofitClient.apiService.getChallenge(employeeId, deviceId)
            if (!challengeRes.isSuccessful || challengeRes.body()?.success != true || challengeRes.body()?.challengeId.isNullOrBlank()) {
                if (challengeRes.code() >= 500 || challengeRes.code() == 429) {
                    savePendingAttendance(employeeId, deviceId, challengeId, fingerprintToken, location, type, timestamp)
                    scheduleSync()
                    showAttendanceMessage("تعذر الاتصال بالخادم، حُفظت العملية للمزامنة لاحقًا")
                } else {
                    showAttendanceMessage(readErrorMessage(challengeRes.errorBody()?.string(), "تعذر التحقق من البصمة والجهاز"))
                }
                return
            }
            challengeId = challengeRes.body()!!.challengeId!!

            val request = AttendanceRequest(
                employeeId = employeeId,
                deviceId = deviceId,
                challengeId = challengeId,
                fingerprintToken = fingerprintToken,
                latitude = location.latitude,
                longitude = location.longitude,
                type = type,
                timestamp = timestamp
            )

            val response = RetrofitClient.apiService.sendAttendance(request)
            if (response.isSuccessful && response.body()?.success == true) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(
                        this@DashboardActivity,
                        "✅ تم تسجيل ${if (type == "attendance") "الحضور" else "الانصراف"} بنجاح",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            } else {
                if (response.code() >= 500 || response.code() == 429) {
                    savePendingAttendance(employeeId, deviceId, challengeId, fingerprintToken, location, type, timestamp)
                    scheduleSync()
                    showAttendanceMessage("تعذر التسجيل مؤقتًا، حُفظت العملية للمزامنة لاحقًا")
                } else {
                    showAttendanceMessage(readErrorMessage(response.errorBody()?.string(), "رفض الخادم تسجيل العملية"))
                }
            }
        } catch (e: Exception) {
            savePendingAttendance(employeeId, deviceId, challengeId, fingerprintToken, location, type, timestamp)
            withContext(Dispatchers.Main) {
                Toast.makeText(
                    this@DashboardActivity,
                    "📴 لا يوجد اتصال، تم حفظ السجل محليًا وستتم المزامنة لاحقًا",
                    Toast.LENGTH_SHORT
                ).show()
            }
            scheduleSync()
        }
    }

    private suspend fun showAttendanceMessage(message: String) {
        withContext(Dispatchers.Main) {
            Toast.makeText(this@DashboardActivity, message, Toast.LENGTH_LONG).show()
        }
    }

    private fun readErrorMessage(body: String?, fallback: String): String {
        return try {
            if (body.isNullOrBlank()) fallback else JSONObject(body).optString("message", fallback)
        } catch (_: Exception) {
            fallback
        }
    }

    /** زر إرسال الموقع الحالي: صلاحيات -> GPS -> إحداثيات -> إرسال للسيرفر */
    private fun sendCurrentLocation() {
        if (!locationManager.hasPermission()) {
            Toast.makeText(this, "يرجى منح إذن الموقع أولاً", Toast.LENGTH_SHORT).show()
            requestPermissionsIfNeeded()
            return
        }
        if (!ensureGpsEnabled()) return

        locationManager.getCurrentLocation { location ->
            if (location == null) {
                Toast.makeText(this, "تعذر الحصول على الموقع، تأكد من تفعيل GPS", Toast.LENGTH_LONG).show()
                return@getCurrentLocation
            }
            CoroutineScope(Dispatchers.IO).launch {
                val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
                val employeeId = prefs.getString("employeeId", "") ?: ""
                val deviceId = prefs.getString("deviceId", "")
                    ?: Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)

                if (employeeId.isEmpty() || deviceId.isNullOrEmpty()) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@DashboardActivity, "بيانات الموظف غير مكتملة، سجل الدخول أولاً", Toast.LENGTH_SHORT).show()
                    }
                    return@launch
                }

                val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(Date())
                try {
                    val response = RetrofitClient.apiService.sendLocation(
                        LocationUpdateRequest(
                            employeeId = employeeId,
                            deviceId = deviceId,
                            latitude = location.latitude,
                            longitude = location.longitude,
                            timestamp = timestamp
                        )
                    )
                    val ok = response.isSuccessful && response.body()?.success == true
                    withContext(Dispatchers.Main) {
                        if (ok) {
                            Toast.makeText(this@DashboardActivity,
                                "✅ تم إرسال الموقع الحالي بنجاح",
                                Toast.LENGTH_LONG).show()
                        } else {
                            Toast.makeText(this@DashboardActivity,
                                response.body()?.message ?: ("فشل إرسال الموقع (رمز " + response.code() + ")"),
                                Toast.LENGTH_LONG).show()
                        }
                    }
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@DashboardActivity,
                            "📴 لا يوجد اتصال بالخادم، تعذر إرسال الموقع",
                            Toast.LENGTH_LONG).show()
                    }
                }
            }
        }
    }

    private suspend fun savePendingAttendance(
        employeeId: String,
        deviceId: String,
        challengeId: String,
        fingerprintToken: String,
        location: Location,
        type: String,
        timestamp: String
    ) {
        db.attendanceDao().insert(
            PendingAttendance(
                employeeId = employeeId,
                deviceId = deviceId,
                challengeId = challengeId,
                fingerprintToken = fingerprintToken,
                latitude = location.latitude,
                longitude = location.longitude,
                type = type,
                timestamp = timestamp
            )
        )
    }

    private fun scheduleSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val work = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(constraints)
            .build()
        WorkManager.getInstance(this).enqueueUniqueWork(
            "sync_attendance",
            ExistingWorkPolicy.KEEP,
            work
        )
    }
}
