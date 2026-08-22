package com.mohmmedali.almoraqebpro

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.widget.Button
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricPrompt
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.OnMapReadyCallback
import com.google.android.gms.maps.SupportMapFragment
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.MarkerOptions
import com.mohmmedali.almoraqebpro.data.network.AttendanceRequest
import com.mohmmedali.almoraqebpro.data.network.RetrofitClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executor

class DashboardActivity : AppCompatActivity(), OnMapReadyCallback {

    companion object {
        private const val TAG = "DashboardActivity"
        private const val LOCATION_PERMISSION_REQUEST = 100
        private const val GPS_REQUEST_CODE = 101
    }

    private lateinit var mMap: GoogleMap
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var executor: Executor
    private lateinit var biometricPrompt: BiometricPrompt
    private lateinit var promptInfo: BiometricPrompt.PromptInfo
    private lateinit var prefs: SharedPreferences
    private var pendingAttendanceType: String = "attendance"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_dashboard)

        prefs = getSharedPreferences(LoginActivity.PREFS_NAME, MODE_PRIVATE)
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)

        val mapFragment = supportFragmentManager.findFragmentById(R.id.mapFragment) as SupportMapFragment
        mapFragment.getMapAsync(this)

        val btnBiometric = findViewById<Button>(R.id.btnBiometric)
        val btnLocation = findViewById<Button>(R.id.btnLocation)
        val btnCheckIn = findViewById<Button>(R.id.btnCheckIn)
        val btnCheckOut = findViewById<Button>(R.id.btnCheckOut)

        executor = ContextCompat.getMainExecutor(this)
        biometricPrompt = BiometricPrompt(this, executor, object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                super.onAuthenticationSucceeded(result)
                Toast.makeText(applicationContext, "تم التحقق من البصمة بنجاح", Toast.LENGTH_SHORT).show()
                // بعد نجاح البصمة، نرسل الحضور بالموقع الذي تم جلبه مسبقاً
                sendAttendanceToServer(pendingAttendanceType)
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                super.onAuthenticationError(errorCode, errString)
                Toast.makeText(applicationContext, "تم إلغاء المصادقة: $errString", Toast.LENGTH_LONG).show()
            }
        })

        promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("المصادقة مطلوبة")
            .setSubtitle("تأكد من بصمة الإصبع قبل تسجيل الحضور")
            .setNegativeButtonText("إلغاء")
            .build()

        btnBiometric.setOnClickListener { initiateAttendance("attendance") }
        btnCheckIn.setOnClickListener { initiateAttendance("attendance") }
        btnCheckOut.setOnClickListener { initiateAttendance("exit") }
        btnLocation.setOnClickListener { fetchAndSaveLocation() }

        // طلب إذن الموقع تلقائياً إذا لم يمنح
        requestLocationPermissionIfNeeded()
    }

    override fun onMapReady(googleMap: GoogleMap) {
        mMap = googleMap
        val defaultLocation = LatLng(24.7136, 46.6753)
        mMap.addMarker(MarkerOptions().position(defaultLocation).title("النقطة الافتراضية"))
        mMap.moveCamera(CameraUpdateFactory.newLatLngZoom(defaultLocation, 12f))
    }

    private fun initiateAttendance(type: String) {
        if (!hasLocationPermission()) {
            requestLocationPermissionIfNeeded()
            Toast.makeText(this, "يجب منح إذن الموقع أولاً", Toast.LENGTH_LONG).show()
            return
        }

        if (!isGpsEnabled()) {
            promptEnableGps()
            return
        }

        pendingAttendanceType = type
        fetchCurrentLocationAndThenBiometric()
    }

    private fun fetchCurrentLocationAndThenBiometric() {
        Toast.makeText(this, "جاري جلب الموقع...", Toast.LENGTH_SHORT).show()

        val cancellationTokenSource = CancellationTokenSource()
        fusedLocationClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancellationTokenSource.token)
            .addOnSuccessListener { location ->
                if (location == null) {
                    Toast.makeText(this, "تعذر الحصول على الموقع الحالي، تأكد من تشغيل GPS", Toast.LENGTH_LONG).show()
                    return@addOnSuccessListener
                }

                val lat = location.latitude
                val lon = location.longitude
                updateMapToLocation(lat, lon)

                // حفظ الموقع مؤقتاً في SharedPreferences لاستخدامه بعد البصمة
                prefs.edit().putString("lastLat", lat.toString()).putString("lastLon", lon.toString()).apply()

                Toast.makeText(this, "تم تحديد الموقع، الآن سجل البصمة", Toast.LENGTH_SHORT).show()
                biometricPrompt.authenticate(promptInfo)
            }
            .addOnFailureListener { e ->
                Toast.makeText(this, "فشل في الحصول على الموقع: ${e.localizedMessage ?: "خطأ غير معروف"}", Toast.LENGTH_LONG).show()
                Log.e(TAG, "Location fetch failed", e)
            }
    }

    private fun sendAttendanceToServer(type: String) {
        val employeeId = prefs.getString("employeeId", "")?.trim().orEmpty()
        val deviceId = prefs.getString("deviceId", "") ?: Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)

        if (employeeId.isEmpty()) {
            Toast.makeText(this, "لم يتم العثور على بيانات الموظف. الرجاء تسجيل الدخول مرة أخرى.", Toast.LENGTH_LONG).show()
            return
        }

        val latitude = prefs.getString("lastLat", "")?.toDoubleOrNull()
        val longitude = prefs.getString("lastLon", "")?.toDoubleOrNull()

        if (latitude == null || longitude == null) {
            Toast.makeText(this, "لم يتم تحديد الموقع بعد، حاول مرة أخرى", Toast.LENGTH_LONG).show()
            return
        }

        // الحصول على تحدي بصمة من السيرفر
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val chResponse = RetrofitClient.apiService.attendanceChallenge(employeeId, deviceId)
                val chBody = chResponse.body()
                val challengeId = chBody?.challengeId
                if (challengeId == null) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@DashboardActivity, chBody?.message ?: "تعذر إصدار تحدي البصمة", Toast.LENGTH_LONG).show()
                    }
                    return@launch
                }
                doSubmitAttendance(type, latitude, longitude, employeeId, deviceId, challengeId)
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@DashboardActivity, "تعذر بدء التحقق بالبصمة: ${e.localizedMessage ?: "خطأ"}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun doSubmitAttendance(
        type: String,
        latitude: Double,
        longitude: Double,
        employeeId: String,
        deviceId: String,
        challengeId: String
    ) {
        val request = AttendanceRequest(
            employeeId = employeeId,
            deviceId = deviceId,
            challengeId = challengeId,
            fingerprintToken = "biometric-verified-${System.currentTimeMillis()}",
            latitude = latitude,
            longitude = longitude,
            type = type,
            timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(Date())
        )

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val response = RetrofitClient.apiService.sendAttendance(request)
                val body = response.body()

                withContext(Dispatchers.Main) {
                    if (response.isSuccessful && body?.success == true) {
                        val label = if (type == "exit") "الانصراف" else "الحضور"
                        Toast.makeText(this@DashboardActivity, body.message.ifBlank { "تم تسجيل $label بنجاح" }, Toast.LENGTH_LONG).show()
                    } else {
                        val message = body?.message ?: body?.error ?: "فشل تسجيل $type"
                        Toast.makeText(this@DashboardActivity, message, Toast.LENGTH_LONG).show()
                        Log.w(TAG, "Attendance request failed: HTTP=${response.code()} message=$message")
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    val message = when {
                        e.message?.contains("timeout", true) == true -> "انتهت مهلة الاتصال بالسيرفر"
                        e.message?.contains("Unable to resolve host", true) == true -> "لا يوجد اتصال بالإنترنت"
                        else -> "تعذر إرسال الحضور: ${e.localizedMessage ?: "خطأ غير معروف"}"
                    }
                    Toast.makeText(this@DashboardActivity, message, Toast.LENGTH_LONG).show()
                    Log.e(TAG, "Attendance submission failed", e)
                }
            }
        }
    }

    private fun fetchAndSaveLocation() {
        if (!hasLocationPermission()) {
            requestLocationPermissionIfNeeded()
            return
        }

        if (!isGpsEnabled()) {
            promptEnableGps()
            return
        }

        fusedLocationClient.lastLocation.addOnSuccessListener { location ->
            if (location != null) {
                val lat = location.latitude
                val lon = location.longitude
                updateMapToLocation(lat, lon)

                val currentTime = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date())
                val record = LocationRecord(latitude = lat, longitude = lon, timestamp = currentTime)

                CoroutineScope(Dispatchers.IO).launch {
                    val db = AppDatabase.getDatabase(applicationContext)
                    db.locationDao().insertLocation(record)
                }

                Toast.makeText(this, "تم حفظ الموقع المحلي بنجاح", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "تعذر جلب الموقع، تأكد من تشغيل GPS أو السماح بالموقع", Toast.LENGTH_LONG).show()
            }
        }.addOnFailureListener { e ->
            Toast.makeText(this, "فشل في جلب الموقع: ${e.localizedMessage ?: "خطأ غير معروف"}", Toast.LENGTH_LONG).show()
        }
    }

    private fun updateMapToLocation(latitude: Double, longitude: Double) {
        val currentLatLng = LatLng(latitude, longitude)
        mMap.clear()
        mMap.addMarker(MarkerOptions().position(currentLatLng).title("الموقع الحالي"))
        mMap.animateCamera(CameraUpdateFactory.newLatLngZoom(currentLatLng, 15f))
    }

    private fun hasLocationPermission(): Boolean {
        return ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestLocationPermissionIfNeeded() {
        if (!hasLocationPermission()) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                LOCATION_PERMISSION_REQUEST
            )
        }
    }

    private fun isGpsEnabled(): Boolean {
        val locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        return locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
    }

    private fun promptEnableGps() {
        Toast.makeText(this, "يرجى تفعيل GPS لتسجيل الحضور", Toast.LENGTH_LONG).show()
        val intent = Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
        startActivityForResult(intent, GPS_REQUEST_CODE)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == GPS_REQUEST_CODE) {
            if (isGpsEnabled()) {
                Toast.makeText(this, "تم تفعيل GPS، يمكنك المحاولة الآن", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "لم يتم تفعيل GPS", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == LOCATION_PERMISSION_REQUEST) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, "تم منح إذن الموقع", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "تم رفض إذن الموقع، لا يمكن تسجيل الحضور", Toast.LENGTH_LONG).show()
            }
        }
    }
}
