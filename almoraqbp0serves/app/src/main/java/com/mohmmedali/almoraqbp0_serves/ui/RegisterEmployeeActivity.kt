package com.mohmmedali.almoraqebpro.ui

import android.Manifest
import android.content.Intent
import android.location.LocationManager as SystemLocationManager
import android.os.Bundle
import android.provider.Settings
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.Spinner
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.mohmmedali.almoraqebpro.R
import com.mohmmedali.almoraqebpro.data.EmployeeJoinRequest
import com.mohmmedali.almoraqebpro.data.RetrofitClient
import com.mohmmedali.almoraqebpro.services.LocationManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class RegisterEmployeeActivity : AppCompatActivity() {

    private var isSubmitting = false
    private lateinit var locationManager: LocationManager
    private lateinit var locationField: EditText
    private lateinit var captureLocationButton: Button
    private var capturedLatitude: Double? = null
    private var capturedLongitude: Double? = null
    private var capturedAccuracy: Float? = null
    private var captureAfterPermission = false

    private val locationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val granted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted && captureAfterPermission) {
            captureAfterPermission = false
            captureCurrentLocation()
        } else if (!granted) {
            captureAfterPermission = false
            Toast.makeText(this, getString(R.string.register_location_permission_required), Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_register_employee)
        setTitle(getString(R.string.register_screen_title))
        locationManager = LocationManager(this)

        val companyId = findViewById<EditText>(R.id.etCompanyId)
        val companyName = findViewById<EditText>(R.id.etCompanyName)
        val name = findViewById<EditText>(R.id.etName)
        val phoneNumber = findViewById<EditText>(R.id.etPhoneNumber)
        val jobTitle = findViewById<EditText>(R.id.etJobTitle)
        val workLocation = findViewById<EditText>(R.id.etWorkLocation)
        val salary = findViewById<EditText>(R.id.etSalary)
        val shift = findViewById<Spinner>(R.id.spShift)
        val workHours = findViewById<EditText>(R.id.etWorkHours)
        val wageType = findViewById<EditText>(R.id.etWageType)
        val socialSecurity = findViewById<EditText>(R.id.etSocialSecurity)
        locationField = findViewById(R.id.etLocation)
        captureLocationButton = findViewById(R.id.btnCaptureLocation)
        val submit = findViewById<Button>(R.id.btnSubmitRequest)

        val shiftLabels = listOf(
            getString(R.string.register_shift_prompt),
            getString(R.string.register_shift_morning),
            getString(R.string.register_shift_evening),
            getString(R.string.register_shift_night),
            getString(R.string.register_shift_flexible)
        )
        shift.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, shiftLabels)
        captureLocationButton.setOnClickListener { captureCurrentLocation() }

        submit.setOnClickListener {
            if (isSubmitting) return@setOnClickListener

            val salaryValue = salary.text.toString().trim().toDoubleOrNull()
            val workHoursValue = workHours.text.toString().trim().toIntOrNull()

            if (companyId.text.toString().trim().isEmpty() || name.text.toString().trim().isEmpty()) {
                Toast.makeText(this, getString(R.string.register_company_name_required), Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            if (salaryValue == null || salaryValue <= 0) {
                Toast.makeText(this, getString(R.string.register_salary_invalid), Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            if (workHoursValue == null || workHoursValue <= 0) {
                Toast.makeText(this, getString(R.string.register_hours_invalid), Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            if (shift.selectedItemPosition == 0) {
                Toast.makeText(this, getString(R.string.register_shift_required), Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            val latitude = capturedLatitude
            val longitude = capturedLongitude
            if (latitude == null || longitude == null) {
                Toast.makeText(this, getString(R.string.register_location_required), Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }

            val shiftValue = listOf("", "صباحي", "مسائي", "ليلي", "مرن")[shift.selectedItemPosition]

            val deviceId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: ""

            isSubmitting = true
            submit.isEnabled = false
            submit.text = getString(R.string.register_sending)

            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val response = RetrofitClient.apiService.submitEmployeeRequest(
                        EmployeeJoinRequest(
                            companyId = companyId.text.toString().trim(),
                            companyName = companyName.text.toString().trim(),
                            name = name.text.toString().trim(),
                            phoneNumber = phoneNumber.text.toString().trim(),
                            jobTitle = jobTitle.text.toString().trim(),
                            workLocation = workLocation.text.toString().trim(),
                            salary = salaryValue,
                            shift = shiftValue,
                            workHours = workHoursValue,
                            wageType = wageType.text.toString().trim(),
                            socialSecurity = socialSecurity.text.toString().trim(),
                            location = "$latitude,$longitude",
                            latitude = latitude,
                            longitude = longitude,
                            locationAccuracy = capturedAccuracy,
                            deviceId = deviceId
                        )
                    )
                    withContext(Dispatchers.Main) {
                        if (response.isSuccessful && response.body()?.success == true) {
                            Toast.makeText(this@RegisterEmployeeActivity,
                                response.body()?.message ?: getString(R.string.register_success),
                                Toast.LENGTH_LONG).show()
                            finish()
                        } else {
                            Toast.makeText(this@RegisterEmployeeActivity,
                                response.body()?.message ?: getString(R.string.register_failed_code, response.code()),
                                Toast.LENGTH_LONG).show()
                        }
                    }
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@RegisterEmployeeActivity,
                        getString(R.string.register_connection_error),
                            Toast.LENGTH_LONG).show()
                    }
                } finally {
                    isSubmitting = false
                    withContext(Dispatchers.Main) {
                        submit.isEnabled = true
                        submit.text = getString(R.string.register_send_button)
                    }
                }
            }
        }
    }

    private fun captureCurrentLocation() {
        val systemLocation = getSystemService(LOCATION_SERVICE) as SystemLocationManager
        val gpsEnabled = systemLocation.isProviderEnabled(SystemLocationManager.GPS_PROVIDER) ||
            systemLocation.isProviderEnabled(SystemLocationManager.NETWORK_PROVIDER)
        if (!gpsEnabled) {
            Toast.makeText(this, getString(R.string.register_enable_gps), Toast.LENGTH_LONG).show()
            startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
            return
        }
        if (!locationManager.hasPermission()) {
            captureAfterPermission = true
            locationPermissionLauncher.launch(arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ))
            return
        }
        captureLocationButton.isEnabled = false
        captureLocationButton.text = getString(R.string.register_location_capturing)
        locationManager.getCurrentLocation { location ->
            runOnUiThread {
                captureLocationButton.isEnabled = true
                captureLocationButton.text = getString(R.string.register_capture_location)
                if (location == null) {
                    Toast.makeText(this, getString(R.string.register_location_failed), Toast.LENGTH_LONG).show()
                    return@runOnUiThread
                }
                capturedLatitude = location.latitude
                capturedLongitude = location.longitude
                capturedAccuracy = if (location.hasAccuracy()) location.accuracy else 0f
                locationField.setText(getString(
                    R.string.register_location_captured,
                    location.latitude,
                    location.longitude,
                    capturedAccuracy ?: 0f
                ))
            }
        }
    }
}
