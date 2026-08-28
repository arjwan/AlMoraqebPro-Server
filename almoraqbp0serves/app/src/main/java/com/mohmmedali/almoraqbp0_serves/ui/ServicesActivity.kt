package com.mohmmedali.almoraqebpro.ui

import com.mohmmedali.almoraqebpro.R

import android.app.AlertDialog
import android.app.DatePickerDialog
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.mohmmedali.almoraqebpro.data.AppDatabase
import com.mohmmedali.almoraqebpro.data.PendingServiceRequest
import com.mohmmedali.almoraqebpro.data.RetrofitClient
import com.mohmmedali.almoraqebpro.data.ServiceRequest
import com.mohmmedali.almoraqebpro.databinding.ActivityServicesBinding
import com.mohmmedali.almoraqebpro.services.SyncWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException
import java.util.Calendar
import java.util.Locale

class ServicesActivity : AppCompatActivity() {

    private lateinit var binding: ActivityServicesBinding
    private lateinit var tts: android.speech.tts.TextToSpeech

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityServicesBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
        binding.tvEmpNameCard.text = getString(R.string.svc_employee_value, prefs.getString("employeeName", "-"))
        binding.tvCompanyCard.text = getString(R.string.svc_company_value, prefs.getString("companyId", "-"))
        val deviceId = prefs.getString("deviceId", null)
        binding.tvDeviceCard.text = if (!deviceId.isNullOrEmpty())
            getString(R.string.svc_device_linked)
        else
            getString(R.string.svc_device_unknown)

        updateGreeting()
        startTicker()
        checkConnectionBadge()
        animateCards()

        // فتح شريط الأخبار للحركة (نفس marquee الويب)
        binding.tvTicker.isSelected = true

        binding.cardLoan.setOnClickListener { showLoanDialog() }
        binding.cardLeave.setOnClickListener { showLeaveDialog() }
        binding.cardMyRequests.setOnClickListener { startActivity(Intent(this, MyRequestsActivity::class.java)) }
        binding.cardAttendanceLog.setOnClickListener { startActivity(Intent(this, AttendanceHistoryActivity::class.java)) }
        binding.cardNotifications.setOnClickListener { startActivity(Intent(this, NotificationActivity::class.java)) }
        binding.cardFirstAid.setOnClickListener { startActivity(Intent(this, FirstAidActivity::class.java)) }
        binding.cardRewards.setOnClickListener { showRewards() }
        binding.cardAccountStatus.setOnClickListener { startActivity(Intent(this, AccountStatusActivity::class.java)) }
        binding.cardSettings.setOnClickListener { startActivity(Intent(this, SettingsActivity::class.java)) }
        binding.cardBack.setOnClickListener { finish() }

        // ترحيب صوتي بصوت أنثى عربي (مثل speakGreeting في النسخة الويب)
        tts = android.speech.tts.TextToSpeech(this) { status ->
            if (status == android.speech.tts.TextToSpeech.SUCCESS) {
                tts.language = resources.configuration.locales[0]
                tts.setPitch(1.12f); tts.setSpeechRate(0.9f)
            }
        }
        binding.tvGreetingTitle.setOnLongClickListener {
            speak(getString(R.string.svc_welcome_tts, prefs.getString("employeeName", "")))
            true
        }
    }

    private fun speak(text: String) {
        tts.speak(text, android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, "svc")
    }

    override fun onDestroy() { tts.stop(); tts.shutdown(); super.onDestroy() }

    private fun updateGreeting() {
        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
        val name = prefs.getString("employeeName", getString(R.string.svc_default_employee))
            ?: getString(R.string.svc_default_employee)
        val h = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
        val (title, text) = when (h) {
            in 5..11 -> getString(R.string.svc_morning_title) to getString(R.string.svc_morning_message, name)
            in 12..16 -> getString(R.string.svc_afternoon_title) to getString(R.string.svc_general_message, name)
            in 17..20 -> getString(R.string.svc_evening_title) to getString(R.string.svc_evening_message, name)
            else -> getString(R.string.svc_night_title) to getString(R.string.svc_general_message, name)
        }
        binding.tvGreetingTitle.text = title
        binding.tvGreetingText.text = text
    }

    private fun startTicker() {
        binding.tvTicker.isSelected = true
    }

    private fun checkConnectionBadge() {
        CoroutineScope(Dispatchers.IO).launch {
            var ok = false
            try { ok = RetrofitClient.apiService.ping().isSuccessful } catch (_: Exception) {}
            withContext(Dispatchers.Main) {
                if (ok) {
                    binding.tvConnectionBadge.text = getString(R.string.svc_connected)
                    binding.tvConnectionBadge.setTextColor(0xFF86EFAC.toInt())
                } else {
                    binding.tvConnectionBadge.text = getString(R.string.svc_offline)
                    binding.tvConnectionBadge.setTextColor(0xFFFCA5A5.toInt())
                }
            }
        }
    }

    private fun animateCards() {
        val cards = listOf<View>(binding.cardLoan, binding.cardLeave, binding.cardMyRequests,
            binding.cardAttendanceLog, binding.cardNotifications, binding.cardFirstAid,
            binding.cardRewards, binding.cardAccountStatus, binding.cardSettings, binding.cardBack)
        cards.forEachIndexed { i, v ->
            v.alpha = 0f; v.translationY = 50f
            v.animate().alpha(1f).translationY(0f).setDuration(300).setStartDelay(i * 60L).start()
        }
    }

    // ===== طلب سلفة (نفس حقول services.html: amount + reason) =====
    private fun showLoanDialog() {
        val container = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 24, 48, 0) }
        val etAmount = EditText(this).apply { hint = getString(R.string.svc_loan_amount_hint); inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL }
        val etReason = EditText(this).apply { hint = getString(R.string.svc_loan_reason_hint) }
        container.addView(etAmount); container.addView(etReason)
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.svc_loan_dialog_title))
            .setView(container)
            .setPositiveButton(getString(R.string.svc_send_request)) { _, _ ->
                val amount = etAmount.text.toString().toDoubleOrNull()
                val reason = etReason.text.toString().trim()
                if (amount == null || amount <= 0) { toast(getString(R.string.svc_invalid_loan_amount)); return@setPositiveButton }
                if (reason.isEmpty()) { toast(getString(R.string.svc_loan_reason_required)); return@setPositiveButton }
                sendRequest(ServiceRequest(getEmployeeId(), requireDeviceId(), getCompanyId(), "loan", amount, reason, null), getString(R.string.svc_loan_sent))
            }
            .setNegativeButton(getString(R.string.svc_cancel), null).show()
    }

    // ===== طلب إجازة: من / إلى =====
    private fun showLeaveDialog() {

        val types = arrayOf(
            getString(R.string.svc_leave_normal),
            getString(R.string.svc_leave_sick),
            getString(R.string.svc_leave_emergency),
            getString(R.string.svc_leave_hourly)
        )

        var selected = types[0]
        var fromMillis: Long? = null
        var toMillis: Long? = null

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 24, 48, 0)
        }

        val typeField = EditText(this).apply {
            isFocusable = false
            isClickable = true
            setText(selected)

            setOnClickListener {
                AlertDialog.Builder(this@ServicesActivity)
                    .setTitle(getString(R.string.svc_leave_type))
                    .setItems(types) { _, which ->
                        selected = types[which]
                        setText(selected)
                    }
                    .show()
            }
        }

        val fromField = EditText(this).apply {
            hint = getString(R.string.svc_leave_from_hint)
            isFocusable = false
            isClickable = true
        }

        val toField = EditText(this).apply {
            hint = getString(R.string.svc_leave_to_hint)
            isFocusable = false
            isClickable = true
        }

        val reasonField = EditText(this).apply {
            hint = getString(R.string.svc_leave_reason_hint)
        }

        container.addView(TextView(this).apply {
            text = getString(R.string.svc_leave_type)
        })
        container.addView(typeField)
        container.addView(fromField)
        container.addView(toField)
        container.addView(reasonField)

        fun todayStart(): Long =
            Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, 0)
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }.timeInMillis

        fun formatDate(
            year: Int,
            month: Int,
            day: Int
        ): String =
            String.format(
                Locale.US,
                "%04d-%02d-%02d",
                year,
                month + 1,
                day
            )

        fromField.setOnClickListener {

            val now = Calendar.getInstance()

            val picker = DatePickerDialog(
                this,
                { _, year, month, day ->

                    val chosen = Calendar.getInstance().apply {
                        set(year, month, day, 0, 0, 0)
                        set(Calendar.MILLISECOND, 0)
                    }

                    fromMillis = chosen.timeInMillis
                    fromField.setText(
                        formatDate(year, month, day)
                    )

                    if (
                        toMillis != null &&
                        toMillis!! < fromMillis!!
                    ) {
                        toMillis = null
                        toField.setText("")
                    }
                },
                now.get(Calendar.YEAR),
                now.get(Calendar.MONTH),
                now.get(Calendar.DAY_OF_MONTH)
            )

            picker.datePicker.minDate = todayStart()
            picker.show()
        }

        toField.setOnClickListener {

            if (fromMillis == null) {
                toast(getString(R.string.svc_leave_start_first))
                return@setOnClickListener
            }

            val initial = Calendar.getInstance().apply {
                timeInMillis = fromMillis!!
            }

            val picker = DatePickerDialog(
                this,
                { _, year, month, day ->

                    val chosen = Calendar.getInstance().apply {
                        set(year, month, day, 0, 0, 0)
                        set(Calendar.MILLISECOND, 0)
                    }

                    toMillis = chosen.timeInMillis
                    toField.setText(
                        formatDate(year, month, day)
                    )
                },
                initial.get(Calendar.YEAR),
                initial.get(Calendar.MONTH),
                initial.get(Calendar.DAY_OF_MONTH)
            )

            picker.datePicker.minDate = fromMillis!!
            picker.show()
        }

        val dialog = AlertDialog.Builder(this)
            .setTitle(getString(R.string.svc_leave_dialog_title))
            .setView(container)
            .setPositiveButton(getString(R.string.svc_send_request), null)
            .setNegativeButton(getString(R.string.svc_cancel), null)
            .create()

        dialog.setOnShowListener {

            dialog.getButton(
                AlertDialog.BUTTON_POSITIVE
            ).setOnClickListener {

                val fromDate =
                    fromField.text.toString().trim()

                val toDate =
                    toField.text.toString().trim()

                val reason =
                    reasonField.text.toString().trim()

                if (fromDate.isEmpty()) {
                    toast(getString(R.string.svc_leave_start_required))
                    return@setOnClickListener
                }

                if (toDate.isEmpty()) {
                    toast(getString(R.string.svc_leave_end_required))
                    return@setOnClickListener
                }

                if (reason.length < 2) {
                    toast(getString(R.string.svc_leave_reason_required))
                    return@setOnClickListener
                }

                val request = ServiceRequest(
                    employeeId = getEmployeeId(),
                    deviceId = requireDeviceId(),
                    companyId = getCompanyId(),
                    type = "leave",
                    amount = null,
                    reason = getString(R.string.svc_leave_reason_format, selected, reason),
                    requestedDate = fromDate,
                    fromDate = fromDate,
                    toDate = toDate
                )

                dialog.dismiss()

                sendRequest(
                    request,
                    getString(R.string.svc_leave_sent)
                )
            }
        }

        dialog.show()
    }

    private fun showRewards() {
        // نفس رسالة النسخة الويب: لا بيانات وهمية
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.svc_rewards_dialog_title))
            .setMessage(getString(R.string.svc_rewards_unavailable))
            .setPositiveButton(getString(R.string.svc_ok), null).show()
    }

    private fun sendRequest(
        request: ServiceRequest,
        successText: String
    ) {
        toast(getString(R.string.svc_sending))

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val response =
                    RetrofitClient.apiService
                        .sendServiceRequest(request)

                if (
                    response.isSuccessful &&
                    response.body()?.success == true
                ) {
                    withContext(Dispatchers.Main) {
                        val msg =
                            response.body()?.message
                                ?: successText

                        Toast.makeText(
                            this@ServicesActivity,
                            "✅ $msg",
                            Toast.LENGTH_LONG
                        ).show()

                        speak(
                            getString(R.string.svc_request_success)
                        )
                    }
                    return@launch
                }

                if (response.code() in 400..499) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(
                            this@ServicesActivity,
                            "❌ " +
                                (
                                    response.body()?.message
                                        ?: getString(R.string.svc_server_rejected, response.code())
                                ),
                            Toast.LENGTH_LONG
                        ).show()
                    }
                    return@launch
                }

                saveRequestLocally(request)

            } catch (_: IOException) {
                saveRequestLocally(request)

            } catch (_: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(
                        this@ServicesActivity,
                        getString(R.string.svc_prepare_error),
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }
    }

    private suspend fun saveRequestLocally(
        request: ServiceRequest
    ) {
        AppDatabase
            .getDatabase(applicationContext)
            .serviceRequestDao()
            .insert(
                PendingServiceRequest(
                    employeeId = request.employeeId,
                    deviceId = request.deviceId,
                    companyId = request.companyId,
                    type = request.type,
                    amount = request.amount,
                    reason = request.reason,
                    requestedDate = request.requestedDate,
                    fromDate = request.fromDate,
                    toDate = request.toDate,
                    leavePaymentType = request.leavePaymentType
                )
            )

        scheduleServiceSync()

        withContext(Dispatchers.Main) {
            binding.tvConnectionBadge.text =
                getString(R.string.svc_local_mode)

            binding.tvConnectionBadge.setTextColor(
                0xFFFBBF24.toInt()
            )

            Toast.makeText(
                this@ServicesActivity,
                getString(R.string.svc_saved_locally),
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private fun scheduleServiceSync() {
        val work =
            OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(
                            NetworkType.CONNECTED
                        )
                        .build()
                )
                .build()

        WorkManager.getInstance(this)
            .enqueueUniqueWork(
                "sync_local_data",
                ExistingWorkPolicy.KEEP,
                work
            )
    }

    private fun getEmployeeId() = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE).getString("employeeId", "") ?: ""
    private fun getCompanyId() = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE).getString("companyId", "") ?: ""
    private fun requireDeviceId(): String = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE).getString("deviceId", "")
        ?: Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: ""
    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
}
