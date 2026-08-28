package com.mohmmedali.almoraqebpro.services

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.os.Handler
import android.os.Looper
import androidx.annotation.RequiresPermission
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource

class LocationManager(private val context: Context) {

    private val fusedClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    /**
     * التحقق من صلاحية الوصول للموقع
     */
    fun hasPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED
    }

    /**
     * جلب الموقع الحالي بدقة عالية.
     *
     * @param callback يستدعى مع الموقع أو null عند الفشل
     */
    @RequiresPermission(allOf = [Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION])
    fun getCurrentLocation(callback: (Location?) -> Unit) {
        if (!hasPermission()) {
            callback(null)
            return
        }

        val cancellationTokenSource = CancellationTokenSource()

        fusedClient.getCurrentLocation(
            Priority.PRIORITY_HIGH_ACCURACY,
            cancellationTokenSource.token
        ).addOnSuccessListener { location ->
            if (location != null && location.hasValidCoordinates()) {
                callback(location)
            } else {
                requestFreshLocation(callback)
            }
        }.addOnFailureListener {
            requestFreshLocation(callback)
        }
    }

    @RequiresPermission(allOf = [Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION])
    private fun requestFreshLocation(callback: (Location?) -> Unit) {
        val request = com.google.android.gms.location.LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            1000L
        ).setMaxUpdates(1).setWaitForAccurateLocation(true).build()
        val completed = java.util.concurrent.atomic.AtomicBoolean(false)
        val locationCallback = object : com.google.android.gms.location.LocationCallback() {
            override fun onLocationResult(result: com.google.android.gms.location.LocationResult) {
                if (completed.compareAndSet(false, true)) {
                    fusedClient.removeLocationUpdates(this)
                    callback(result.lastLocation?.takeIf { it.hasValidCoordinates() })
                }
            }
        }
        fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
            .addOnFailureListener {
                if (completed.compareAndSet(false, true)) callback(null)
            }
        Handler(Looper.getMainLooper()).postDelayed({
            if (completed.compareAndSet(false, true)) {
                fusedClient.removeLocationUpdates(locationCallback)
                callback(null)
            }
        }, 10000L)
    }

    private fun Location.hasValidCoordinates(): Boolean =
        latitude.isFinite() && longitude.isFinite() &&
            latitude != 0.0 && longitude != 0.0 &&
            latitude in -90.0..90.0 && longitude in -180.0..180.0
}