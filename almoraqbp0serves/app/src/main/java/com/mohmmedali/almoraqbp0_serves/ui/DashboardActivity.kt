package com.mohmmedali.almoraqebpro.ui
import com.mohmmedali.almoraqebpro.R

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
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class DashboardActivity : AppCompatActivity() {

    private lateinit var binding: ActivityDashboardBinding
    private lateinit var locationManager: LocationManager
    private val db by lazy { AppDatabase.getDatabase(this) }
    private var pendingType = "attendance"
    private var permissionRequestedForAttendance = false

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true) {
            Toast.makeText(this, getString(R.string.dash_location_permission_granted), Toast.LENGTH_SHORT).show()
            if (permissionRequestedForAttendance) {
                permissionRequestedForAttendance = false
                startAttendance(pendingType)
            }
        } else {
            Toast.makeText(this, getString(R.string.dash_location_permission_required), Toast.LENGTH_SHORT).show()
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

        val name = prefs.getString("employeeName", getString(R.string.dash_default_employee)) ?: getString(R.string.dash_default_employee)
        binding.tvWelcome.text = getString(R.string.dash_welcome, name)

        // عرض Device ID ورمز الشركة
        val shownDeviceId = prefs.getString("deviceId", "")
            ?: Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
        binding.tvDeviceInfo.text = shortDeviceId(shownDeviceId ?: "-")
        binding.tvEmployeeIdTile.text = getString(R.string.dash_employee_label, prefs.getString("employeeId", "-") ?: "-")
        binding.tvCompanyInfo.text = getString(R.string.dash_company_code_label, prefs.getString("companyId", "-") ?: "-")

        // أزرار البصمة (الصورة المرجعية 2)
        binding.btnCheckIn.setOnClickListener { startAttendance("attendance") }
        binding.btnCheckOut.setOnClickListener { startAttendance("exit") }

        // شريط التنقل السفلي
        binding.navServices.setOnClickListener { startActivity(Intent(this, ServicesActivity::class.java)) }
        binding.navNotif.setOnClickListener { startActivity(Intent(this, NotificationActivity::class.java)) }
        binding.navSettings.setOnClickListener { startActivity(Intent(this, SettingsActivity::class.java)) }
        binding.navHome.setOnClickListener {
            Toast.makeText(this, getString(R.string.dash_home_hint), Toast.LENGTH_SHORT).show()
        }
        binding.btnBackTop.setOnClickListener { finish() }






        binding.btnSendLocation.setOnClickListener { sendCurrentLocation() }

        checkServerStatus()
        refreshAttendanceRequirement()
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
        refreshAttendanceRequirement()
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
                    binding.tvServerStatus.text = getString(R.string.dash_server_connected)
                    binding.tvServerStatus.setTextColor(0xFF22C55E.toInt())
                } else {
                    binding.tvServerStatus.text = getString(R.string.dash_server_local)
                    binding.tvServerStatus.setTextColor(0xFFF59E0B.toInt())
                }
            }
        }
    }

    private fun refreshAttendanceRequirement() {
        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
        val employeeId = prefs.getString("employeeId", "") ?: ""
        val deviceId = prefs.getString("deviceId", "") ?: ""
        if (employeeId.isBlank() || deviceId.isBlank()) return
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val response = RetrofitClient.apiService.getAttendanceRequirement(employeeId, deviceId)
                val requirement = response.body()
                if (response.isSuccessful && requirement?.success == true) {
                    withContext(Dispatchers.Main) {
                        val required = requirement.requiresAttendance != false
                        binding.btnCheckIn.isEnabled = required
                        binding.btnCheckOut.isEnabled = required
                        binding.btnCheckIn.alpha = if (required) 1f else 0.45f
                        binding.btnCheckOut.alpha = if (required) 1f else 0.45f
                        if (!required && !requirement.message.isNullOrBlank()) {
                            binding.tvServerStatus.text = requirement.message
                            binding.tvServerStatus.setTextColor(0xFF0284C7.toInt())
                        }
                    }
                }
            } catch (_: Exception) {
                // عند انقطاع الإنترنت تبقى آلية الحضور المحلية الحالية متاحة للمزامنة لاحقًا.
            }
        }
    }

    private fun shortDeviceId(id: String): String {
        val clean = id.replace("-", "")
        return if (clean.length > 12) clean.take(4) + "..." + clean.takeLast(4) else id
    }

    private fun updateGpsTile() {
        val on = isGpsEnabled()
        binding.tvGpsStatus.text = if (on) getString(R.string.dash_gps_on) else getString(R.string.dash_gps_off)
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
            .setTitle(getString(R.string.dash_gps_dialog_title))
            .setMessage(getString(R.string.dash_gps_dialog_message))
            .setPositiveButton(getString(R.string.dash_open_settings)) { _, _ ->
                startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
            }
            .setNegativeButton(getString(R.string.dash_cancel), null)
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
            permissionRequestedForAttendance = true
            Toast.makeText(this, getString(R.string.dash_location_permission_first), Toast.LENGTH_SHORT).show()
            requestPermissionsIfNeeded()
            return
        }

        locationManager.getCurrentLocation { location ->
            if (location != null) {
                authenticateAndSend(type, location)
            } else {
                Toast.makeText(this, getString(R.string.dash_location_error), Toast.LENGTH_SHORT).show()
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
                Toast.makeText(this, getString(R.string.dash_fingerprint_error, error), Toast.LENGTH_SHORT).show()
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
            if (!challengeRes.isSuccessful || challengeRes.body()?.challengeId.isNullOrBlank()) {
                val message = challengeRes.errorBody()?.string()?.let {
                    runCatching { org.json.JSONObject(it).optString("message") }.getOrNull()
                } ?: challengeRes.body()?.message ?: getString(R.string.dash_challenge_failed)
                withContext(Dispatchers.Main) {
                    binding.tvFingerprintStatus.text = getString(R.string.dash_fingerprint_rejected)
                    binding.tvFingerprintStatus.setTextColor(0xFFEF4444.toInt())
                    Toast.makeText(this@DashboardActivity, "❌ $message", Toast.LENGTH_LONG).show()
                }
                return
            }
            challengeId = challengeRes.body()!!.challengeId!!

            val request = AttendanceRequest(
                employeeId = employeeId,
                companyId = prefs.getString("companyId", "") ?: "",
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
                    binding.tvFingerprintStatus.text = getString(R.string.dash_fingerprint_synced)
                    binding.tvFingerprintStatus.setTextColor(0xFF22C55E.toInt())
                    Toast.makeText(
                        this@DashboardActivity,
                        getString(R.string.dash_attendance_success, getString(if (type == "attendance") R.string.dash_attendance_word else R.string.dash_exit_word)),
                        Toast.LENGTH_SHORT
                    ).show()
                }
            } else {
                if (response.code() in 400..499) {
                    val message = response.errorBody()?.string()?.let {
                        runCatching { org.json.JSONObject(it).optString("message") }.getOrNull()
                    } ?: response.body()?.message ?: getString(R.string.dash_fingerprint_accept_failed)
                    withContext(Dispatchers.Main) {
                        binding.tvFingerprintStatus.text = getString(R.string.dash_fingerprint_rejected)
                        binding.tvFingerprintStatus.setTextColor(0xFFEF4444.toInt())
                        Toast.makeText(this@DashboardActivity, "❌ $message", Toast.LENGTH_LONG).show()
                    }
                } else {
                    savePendingAttendance(employeeId, deviceId, challengeId, fingerprintToken, location, type, timestamp)
                    withContext(Dispatchers.Main) {
                        refreshSyncStatus()
                        Toast.makeText(this@DashboardActivity, getString(R.string.dash_saved_local), Toast.LENGTH_LONG).show()
                    }
                    scheduleSync()
                }
            }
        } catch (e: IOException) {
            savePendingAttendance(employeeId, deviceId, challengeId, fingerprintToken, location, type, timestamp)
            withContext(Dispatchers.Main) {
                refreshSyncStatus()
                Toast.makeText(
                    this@DashboardActivity,
                    getString(R.string.dash_offline_saved),
                    Toast.LENGTH_SHORT
                ).show()
            }
            scheduleSync()
        } catch (e: Exception) {
            withContext(Dispatchers.Main) {
                binding.tvFingerprintStatus.text = getString(R.string.dash_fingerprint_verify_failed)
                binding.tvFingerprintStatus.setTextColor(0xFFEF4444.toInt())
                Toast.makeText(
                    this@DashboardActivity,
                    getString(R.string.dash_processing_error, e.message ?: getString(R.string.dash_unknown_error)),
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    /** زر إرسال الموقع الحالي: صلاحيات -> GPS -> إحداثيات -> إرسال للسيرفر */
    private fun sendCurrentLocation() {
        if (!locationManager.hasPermission()) {
            Toast.makeText(this, getString(R.string.dash_location_permission_first), Toast.LENGTH_SHORT).show()
            requestPermissionsIfNeeded()
            return
        }
        if (!ensureGpsEnabled()) return

        locationManager.getCurrentLocation { location ->
            if (location == null) {
                Toast.makeText(this, getString(R.string.dash_location_error), Toast.LENGTH_LONG).show()
                return@getCurrentLocation
            }
            runOnUiThread {
                binding.tvLastLocation.text = getString(R.string.dash_location_updated_now)
                binding.tvLastLocation.setTextColor(0xFF22C55E.toInt())
                binding.tvAccuracy.text = getString(R.string.dash_accuracy_meters, location.accuracy)
            }
            CoroutineScope(Dispatchers.IO).launch {
                val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
                val employeeId = prefs.getString("employeeId", "") ?: ""
                val companyId = prefs.getString("companyId", "") ?: ""
                val deviceId = prefs.getString("deviceId", "")
                    ?: Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)

                if (employeeId.isEmpty() || deviceId.isNullOrEmpty()) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@DashboardActivity, getString(R.string.dash_employee_data_incomplete), Toast.LENGTH_SHORT).show()
                    }
                    return@launch
                }

                val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(Date())
                try {
                    val response = RetrofitClient.apiService.sendLocation(
                        LocationUpdateRequest(
                            employeeId = employeeId,
                            companyId = companyId,
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
                                getString(R.string.dash_location_sent),
                                Toast.LENGTH_LONG).show()
                        } else {
                            Toast.makeText(this@DashboardActivity,
                                response.body()?.message ?: getString(R.string.dash_location_send_failed, response.code()),
                                Toast.LENGTH_LONG).show()
                        }
                    }
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@DashboardActivity,
                            getString(R.string.dash_location_offline_failed),
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
        val companyId = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
            .getString("companyId", "") ?: ""
        db.attendanceDao().insert(
            PendingAttendance(
                employeeId = employeeId,
                companyId = companyId,
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
            "sync_local_data",
            ExistingWorkPolicy.KEEP,
            work
        )
    }

    private fun refreshSyncStatus() {
        val employeeId = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
            .getString("employeeId", "") ?: return

        CoroutineScope(Dispatchers.IO).launch {

            val pendingAttendance =
                db.attendanceDao().countUnsynced(employeeId)

            val pendingRequests =
                db.serviceRequestDao().countUnsynced(employeeId)

            val pendingTotal =
                pendingAttendance + pendingRequests

            withContext(Dispatchers.Main) {

                if (pendingTotal > 0) {
                    binding.tvFingerprintStatus.text =
                        getString(R.string.dash_local_pending, pendingTotal)

                    binding.tvFingerprintStatus.setTextColor(
                        0xFFFACC15.toInt()
                    )
                } else {
                    binding.tvFingerprintStatus.text =
                        getString(R.string.dash_synced_ready)

                    binding.tvFingerprintStatus.setTextColor(
                        0xFF22C55E.toInt()
                    )
                }
            }
        }
    }
}
