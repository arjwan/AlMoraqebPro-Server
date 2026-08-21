package com.mohmmedali.almoraqebpro

import android.Manifest
import android.content.SharedPreferences
import android.content.pm.PackageManager
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
                fetchCurrentLocationAndSendAttendance(pendingAttendanceType)
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

        btnBiometric.setOnClickListener { triggerBiometric("attendance") }
        btnCheckIn.setOnClickListener { triggerBiometric("attendance") }
        btnCheckOut.setOnClickListener { triggerBiometric("exit") }
        btnLocation.setOnClickListener { fetchAndSaveLocation() }
    }

    override fun onMapReady(googleMap: GoogleMap) {
        mMap = googleMap
        val defaultLocation = LatLng(24.7136, 46.6753)
        mMap.addMarker(MarkerOptions().position(defaultLocation).title("النقطة الافتراضية"))
        mMap.moveCamera(CameraUpdateFactory.newLatLngZoom(defaultLocation, 12f))
    }

    private fun triggerBiometric(type: String) {
        pendingAttendanceType = type
        biometricPrompt.authenticate(promptInfo)
    }

    private fun fetchAndSaveLocation() {
        if (!hasLocationPermission()) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), LOCATION_PERMISSION_REQUEST)
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

    private fun fetchCurrentLocationAndSendAttendance(type: String) {
        if (!hasLocationPermission()) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), LOCATION_PERMISSION_REQUEST)
            Toast.makeText(this, "يجب منح إذن الموقع قبل تسجيل الحضور", Toast.LENGTH_LONG).show()
            return
        }

        val cancellationTokenSource = CancellationTokenSource()
        fusedLocationClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancellationTokenSource.token)
            .addOnSuccessListener { location ->
                if (location == null) {
                    Toast.makeText(this, "تعذر الحصول على الموقع الحالي، لا يمكن إرسال الحضور", Toast.LENGTH_LONG).show()
                    return@addOnSuccessListener
                }

                val lat = location.latitude
                val lon = location.longitude
                updateMapToLocation(lat, lon)
                sendAttendanceToServer(type, lat, lon)
            }
            .addOnFailureListener { e ->
                Toast.makeText(this, "فشل في الحصول على الموقع: ${e.localizedMessage ?: "خطأ غير معروف"}", Toast.LENGTH_LONG).show()
                Log.e(TAG, "Location fetch failed", e)
            }
    }

    private fun sendAttendanceToServer(type: String, latitude: Double, longitude: Double) {
        val employeeId = prefs.getString("employeeId", "")?.trim().orEmpty()
        val deviceId = prefs.getString("deviceId", "") ?: Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)

        if (employeeId.isEmpty()) {
            Toast.makeText(this, "لم يتم العثور على بيانات الموظف. الرجاء تسجيل الدخول مرة أخرى.", Toast.LENGTH_LONG).show()
            return
        }

        val request = AttendanceRequest(
            employeeId = employeeId,
            deviceId = deviceId,
            fingerprintToken = "device-biometric-${System.currentTimeMillis()}",
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
                    Log.e(TAG, "Attendance error", e)
                }
            }
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

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == LOCATION_PERMISSION_REQUEST) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                fetchAndSaveLocation()
            } else {
                Toast.makeText(this, "تم رفض إذن الموقع، لا يمكن تسجيل الحضور بدون الموقع", Toast.LENGTH_LONG).show()
            }
        }
    }
}