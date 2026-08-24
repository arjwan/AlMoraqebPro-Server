package com.mohmmedali.almoraqebpro.services

import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

object BiometricManager {

    /**
     * يعرض نافذة التحقق بالبصمة.
     *
     * @param activity يجب أن تكون FragmentActivity أو AppCompatActivity
     * @param onSuccess يُستدعى عند نجاح البصمة
     * @param onError يُستدعى عند فشل البصمة أو إلغائها، مع رسالة الخطأ
     */
    fun authenticate(
        activity: FragmentActivity,
        onSuccess: () -> Unit,
        onError: (String) -> Unit
    ) {
        val executor = ContextCompat.getMainExecutor(activity)

        val prompt = BiometricPrompt(activity, executor, object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                super.onAuthenticationSucceeded(result)
                onSuccess()
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                super.onAuthenticationError(errorCode, errString)
                onError(errString.toString())
            }

            override fun onAuthenticationFailed() {
                super.onAuthenticationFailed()
                onError("البصمة غير صحيحة، حاول مرة أخرى")
            }
        })

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("التحقق من البصمة")
            .setSubtitle("استخدم بصمة إصبعك لتسجيل الحضور")
            .setNegativeButtonText("إلغاء")
            .build()

        prompt.authenticate(promptInfo)
    }
}