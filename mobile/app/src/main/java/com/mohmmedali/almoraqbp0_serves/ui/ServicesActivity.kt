package com.mohmmedali.almoraqebpro.ui

import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.mohmmedali.almoraqebpro.data.RetrofitClient
import com.mohmmedali.almoraqebpro.data.ServiceRequest
import com.mohmmedali.almoraqebpro.databinding.ActivityServicesBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ServicesActivity : AppCompatActivity() {

    private lateinit var binding: ActivityServicesBinding
    private lateinit var tts: android.speech.tts.TextToSpeech

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityServicesBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
        binding.tvEmpNameCard.text = "الموظف: ${prefs.getString("employeeName", "-")}"
        binding.tvCompanyCard.text = "الشركة: ${prefs.getString("companyId", "-")}"
        val deviceId = prefs.getString("deviceId", null)
        binding.tvDeviceCard.text = "الجهاز: ${if (!deviceId.isNullOrEmpty()) "مرتبط ✅" else "غير معروف"}"

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
                tts.language = java.util.Locale("ar", "SA")
                tts.setPitch(1.12f); tts.setSpeechRate(0.9f)
            }
        }
        binding.tvGreetingTitle.setOnLongClickListener {
            speak("أهلاً بك يا ${prefs.getString("employeeName", "")}. يمكنك الآن استخدام خدمات المراقب برو.")
            true
        }
    }

    private fun speak(text: String) {
        tts.speak(text, android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, "svc")
    }

    override fun onDestroy() { tts.stop(); tts.shutdown(); super.onDestroy() }

    private fun updateGreeting() {
        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
        val name = prefs.getString("employeeName", "الموظف") ?: "الموظف"
        val h = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
        val (title, text) = when (h) {
            in 5..11 -> "🌅 صباح الخير" to "مرحباً $name – تذكر تسجيل بصمة الحضور"
            in 12..16 -> "🌤️ مساء الخير" to "مرحباً $name – خدماتك في مكان واحد"
            in 17..20 -> "🌆 مساء الخير" to "مرحباً $name – تذكر تسجيل بصمة الانصراف"
            else -> "🌙 مساء الخير" to "مرحباً $name – خدماتك في مكان واحد"
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
                    binding.tvConnectionBadge.text = "● متصل"
                    binding.tvConnectionBadge.setTextColor(0xFF86EFAC.toInt())
                } else {
                    binding.tvConnectionBadge.text = "● بدون إنترنت"
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
        val etAmount = EditText(this).apply { hint = "المبلغ بالدينار العراقي (مثال: 500000)"; inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL }
        val etReason = EditText(this).apply { hint = "اكتب سبب طلب السلفة..." }
        container.addView(etAmount); container.addView(etReason)
        AlertDialog.Builder(this)
            .setTitle("💰 طلب سلفة مالية")
            .setView(container)
            .setPositiveButton("إرسال الطلب") { _, _ ->
                val amount = etAmount.text.toString().toDoubleOrNull()
                val reason = etReason.text.toString().trim()
                if (amount == null || amount <= 0) { toast("⚠️ أدخل مبلغ سلفة صحيحاً"); return@setPositiveButton }
                if (reason.isEmpty()) { toast("⚠️ اكتب سبب السلفة"); return@setPositiveButton }
                sendRequest(ServiceRequest(getEmployeeId(), requireDeviceId(), getCompanyId(), "loan", amount, reason, null), "تم إرسال طلب السلفة")
            }
            .setNegativeButton("إلغاء", null).show()
    }

    // ===== طلب إجازة (نفس حقول services.html: نوع الإجازة + التاريخ + السبب داخل reason) =====
    private fun showLeaveDialog() {
        val types = arrayOf("اعتيادية", "مرضية", "طارئة", "زمنية")
        var selected = types[0]
        val container = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 24, 48, 0) }
        val etDate = EditText(this).apply { hint = "تاريخ الإجازة (YYYY-MM-DD)" }
        val etReason = EditText(this).apply { hint = "اكتب سبب الإجازة..." }
        container.addView(TextView(this).apply { text = "نوع الإجازة" })
        container.addView(EditText(this).apply {
            isFocusable = false; isClickable = true; setText(selected)
            setOnClickListener {
                AlertDialog.Builder(this@ServicesActivity).setTitle("نوع الإجازة")
                    .setItems(types) { _, w -> selected = types[w]; setText(selected) }.show()
            }
        })
        container.addView(etDate); container.addView(etReason)
        AlertDialog.Builder(this)
            .setTitle("📅 طلب إجازة")
            .setView(container)
            .setPositiveButton("إرسال الطلب") { _, _ ->
                val date = etDate.text.toString().trim()
                val reasonText = etReason.text.toString().trim()
                if (date.isEmpty()) { toast("⚠️ حدد تاريخ الإجازة"); return@setPositiveButton }
                if (reasonText.length < 2) { toast("⚠️ اكتب سبب الإجازة"); return@setPositiveButton }
                sendRequest(ServiceRequest(getEmployeeId(), requireDeviceId(), getCompanyId(), "leave", null, "نوع الإجازة: $selected – $reasonText", date), "تم إرسال طلب الإجازة")
            }
            .setNegativeButton("إلغاء", null).show()
    }

    private fun showRewards() {
        // نفس رسالة النسخة الويب: لا بيانات وهمية
        AlertDialog.Builder(this)
            .setTitle("🎁 المكافآت والخصومات")
            .setMessage("ℹ️ لا يوجد حالياً API مستقل للمكافآت والخصومات في السيرفر، ولذلك لا نعرض بيانات وهمية. عند إضافة مسار المكافآت إلى السيرفر سيتم ربط هذه البطاقة مباشرة.")
            .setPositiveButton("حسناً", null).show()
    }

    private fun sendRequest(request: ServiceRequest, successText: String) {
        toast("⏳ جارٍ الإرسال...")
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val response = RetrofitClient.apiService.sendServiceRequest(request)
                withContext(Dispatchers.Main) {
                    if (response.isSuccessful && response.body()?.success == true) {
                        val msg = response.body()?.message ?: successText
                        Toast.makeText(this@ServicesActivity, "✅ $msg", Toast.LENGTH_LONG).show()
                        speak("تم إرسال طلبك إلى الإدارة بنجاح.")
                    } else {
                        Toast.makeText(this@ServicesActivity,
                            "❌ " + (response.body()?.message ?: "فشل الإرسال (رمز ${response.code()})"),
                            Toast.LENGTH_LONG).show()
                        speak("تعذر إرسال الطلب. يرجى المحاولة مرة أخرى.")
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@ServicesActivity, "❌ تعذر الاتصال بالسيرفر، حاول مرة أخرى", Toast.LENGTH_LONG).show()
                    speak("تعذر إرسال الطلب. يرجى المحاولة مرة أخرى.")
                }
            }
        }
    }

    private fun getEmployeeId() = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE).getString("employeeId", "") ?: ""
    private fun getCompanyId() = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE).getString("companyId", "") ?: ""
    private fun requireDeviceId(): String = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE).getString("deviceId", "")
        ?: Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: ""
    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
}
