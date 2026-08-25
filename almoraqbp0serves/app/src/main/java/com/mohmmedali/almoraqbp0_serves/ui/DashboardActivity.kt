package com.mohmmedali.almoraqebpro.ui

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager as SystemLocationManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
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

        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                3001
            )
        }

        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
        val actualDeviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        if (!prefs.getBoolean("authenticated", false) ||
            prefs.getString("employeeId", "").isNullOrBlank() ||
            prefs.getString("companyId", "").isNullOrBlank() ||
            prefs.getString("username", "").isNullOrBlank() ||
            prefs.getString("deviceId", "") != actualDeviceId) {
            startActivity(Intent(this, LoginActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            })
            finish()
            return
        }
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
        binding.tvDeviceInfo.text = shortDeviceId(shownDeviceId ?: "-")
        binding.tvEmployeeIdTile.text = "الموظف: ${prefs.getString("employeeId", "-") ?: "-"}"
        binding.tvCompanyInfo.text = "رمز الشركة: ${prefs.getString("companyId", "-") ?: "-"}"

        // أزرار البصمة (الصورة المرجعية 2)
        binding.btnCheckIn.setOnClickListener { startAttendance("attendance") }
        binding.btnCheckOut.setOnClickListener { startAttendance("exit") }

        // شريط التنقل السفلي
        binding.navServices.setOnClickListener { startActivity(Intent(this, ServicesActivity::class.java)) }
        binding.navNotif.setOnClickListener { startActivity(Intent(this, NotificationActivity::class.java)) }
        binding.navSettings.setOnClickListener { startActivity(Intent(this, SettingsActivity::class.java)) }
        binding.navHome.setOnClickListener {
            Toast.makeText(this, "أنت في الصفحة الرئيسية للبصمة والموقع", Toast.LENGTH_SHORT).show()
        }
        binding.btnBackTop.setOnClickListener { finish() }






        binding.btnSendLocation.setOnClickListener { sendCurrentLocation() }

        checkServerStatus()
        requestPermissionsIfNeeded()

        // حركة ظهور خفيفة للعناصر (الصورة المرجعية 2)
        val cards = listOf<View>(binding.btnSendLocation, binding.btnCheckIn, binding.btnCheckOut)
        cards.forEachIndexed { i, v ->
            v.alpha = 0f
            v.translationY = 40f
            v.animate().alpha(1f).translationY(0f).setDuration(350).setStartDelay((i * 80L)).start()
        }
        updateGpsTile()
        refreshSyncStatus()
        scheduleSync()
    }

    override fun onResume() {
        super.onResume()
        checkServerStatus()
        updateGpsTile()
        refreshSyncStatus()
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

    private fun shortDeviceId(id: String): String {
        val clean = id.replace("-", "")
        return if (clean.length > 12) clean.take(4) + "..." + clean.takeLast(4) else id
    }

    private fun updateGpsTile() {
        val on = isGpsEnabled()
        binding.tvGpsStatus.text = if (on) "مفعل" else "مغلق"
        binding.tvGpsStatus.setTextColor(if (on) 0xFF22C55E.toInt() else 0xFFEF4444.toInt())
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

        val timestamp = java.time.Instant.now().toString()
        var challengeId = "offline-${System.currentTimeMillis()}"
        var fingerprintToken = "biometric-verified-${System.currentTimeMillis()}"

        try {
            // محاولة جلب تحدي حقيقي من السيرفر
            val challengeRes = RetrofitClient.apiService.getChallenge(employeeId, deviceId)
            if (challengeRes.isSuccessful && challengeRes.body()?.challengeId != null) {
                challengeId = challengeRes.body()!!.challengeId!!
            }

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
                    binding.tvFingerprintStatus.text = "تمت المزامنة"
                    binding.tvFingerprintStatus.setTextColor(0xFF22C55E.toInt())
                    Toast.makeText(
                        this@DashboardActivity,
                        "✅ تم تسجيل ${if (type == "attendance") "الحضور" else "الانصراف"} بنجاح",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            } else {
                if (response.code() in 400..499) {
                    val message = response.errorBody()?.string()?.let {
                        runCatching { org.json.JSONObject(it).optString("message") }.getOrNull()
                    } ?: response.body()?.message ?: "تعذر قبول البصمة"
                    withContext(Dispatchers.Main) {
                        binding.tvFingerprintStatus.text = "مرفوضة"
                        binding.tvFingerprintStatus.setTextColor(0xFFEF4444.toInt())
                        Toast.makeText(this@DashboardActivity, "❌ $message", Toast.LENGTH_LONG).show()
                    }
                } else {
                    savePendingAttendance(employeeId, deviceId, challengeId, fingerprintToken, location, type, timestamp)
                    withContext(Dispatchers.Main) {
                        refreshSyncStatus()
                        Toast.makeText(this@DashboardActivity, "⚠️ تم حفظ البصمة محليًا بانتظار المزامنة", Toast.LENGTH_LONG).show()
                    }
                    scheduleSync()
                }
            }
        } catch (e: Exception) {
            savePendingAttendance(employeeId, deviceId, challengeId, fingerprintToken, location, type, timestamp)
            withContext(Dispatchers.Main) {
                refreshSyncStatus()
                Toast.makeText(
                    this@DashboardActivity,
                    "📴 لا يوجد اتصال، تم حفظ السجل محليًا وستتم المزامنة لاحقًا",
                    Toast.LENGTH_SHORT
                ).show()
            }
            scheduleSync()
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
            runOnUiThread {
                binding.tvLastLocation.text = "تم التحديث الآن"
                binding.tvLastLocation.setTextColor(0xFF22C55E.toInt())
                binding.tvAccuracy.text = String.format(Locale.US, "%.0f متر", location.accuracy)
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
        val work = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(this).enqueueUniqueWork(
            "sync_attendance",
            ExistingWorkPolicy.KEEP,
            work
        )
    }

    private fun refreshSyncStatus() {
        val employeeId = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
            .getString("employeeId", "") ?: return
        CoroutineScope(Dispatchers.IO).launch {
            val pending = db.attendanceDao().countUnsynced(employeeId)
            withContext(Dispatchers.Main) {
                if (pending > 0) {
                    binding.tvFingerprintStatus.text = "بانتظار المزامنة ($pending)"
                    binding.tvFingerprintStatus.setTextColor(0xFFFACC15.toInt())
                } else {
                    binding.tvFingerprintStatus.text = "جاهزة ومتزامنة"
                    binding.tvFingerprintStatus.setTextColor(0xFF22C55E.toInt())
                }
            }
        }
    }
}
