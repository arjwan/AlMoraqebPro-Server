package com.mohmmedali.almoraqebpro.data

import android.content.Context
import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/** Password verifier created only after a successful online login. */
class OfflineAuthStore(context: Context) {
    private val prefs = context.getSharedPreferences("almoraqeb_verified_login", Context.MODE_PRIVATE)

    fun saveVerified(employee: Employee, companyId: String, username: String, password: String, deviceId: String) {
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val verifier = derive(password, salt)
        prefs.edit()
            .putString("companyId", companyId.trim())
            .putString("username", username.trim())
            .putString("deviceId", deviceId)
            .putString("employeeId", employee.id)
            .putString("employeeName", employee.name)
            .putString("specialty", employee.specialty)
            .putString("workplace", employee.workplace)
            .putString("salt", Base64.encodeToString(salt, Base64.NO_WRAP))
            .putString("verifier", Base64.encodeToString(verifier, Base64.NO_WRAP))
            .putLong("verifiedAt", System.currentTimeMillis())
            .apply()
    }

    fun verify(companyId: String, username: String, password: String, deviceId: String): Boolean {
        if (companyId.trim() != prefs.getString("companyId", "") ||
            username.trim() != prefs.getString("username", "") ||
            deviceId != prefs.getString("deviceId", "")) return false

        val salt = prefs.getString("salt", null)?.let { Base64.decode(it, Base64.NO_WRAP) } ?: return false
        val expected = prefs.getString("verifier", null)?.let { Base64.decode(it, Base64.NO_WRAP) } ?: return false
        return MessageDigest.isEqual(expected, derive(password, salt))
    }

    fun hasVerifiedAccount(deviceId: String): Boolean =
        prefs.getLong("verifiedAt", 0L) > 0L &&
            prefs.getString("deviceId", "") == deviceId &&
            !prefs.getString("companyId", "").isNullOrBlank() &&
            !prefs.getString("username", "").isNullOrBlank()

    fun restoreVerifiedSession(context: Context) {
        context.getSharedPreferences("almoraqeb_prefs", Context.MODE_PRIVATE).edit()
            .putString("employeeId", prefs.getString("employeeId", ""))
            .putString("companyId", prefs.getString("companyId", ""))
            .putString("employeeName", prefs.getString("employeeName", ""))
            .putString("specialty", prefs.getString("specialty", ""))
            .putString("workplace", prefs.getString("workplace", ""))
            .putString("username", prefs.getString("username", ""))
            .putString("deviceId", prefs.getString("deviceId", ""))
            .putBoolean("authenticated", true)
            .putBoolean("offlineSession", true)
            .apply()
    }

    private fun derive(password: String, salt: ByteArray): ByteArray {
        val spec = PBEKeySpec(password.toCharArray(), salt, 210_000, 256)
        return try {
            SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        } finally {
            spec.clearPassword()
        }
    }
}
