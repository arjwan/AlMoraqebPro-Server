package com.mohmmedali.almoraqebpro.ui

import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Bundle
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.view.View
import android.widget.ArrayAdapter
import android.widget.ListView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.mohmmedali.almoraqebpro.R
import com.mohmmedali.almoraqebpro.data.RetrofitClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

class NotificationActivity : AppCompatActivity() {

    private var player: MediaPlayer? = null
    private var currentUrl: String? = null
    private lateinit var tts: TextToSpeech

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_notifications)
        loadNotifications()

        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts.language = Locale("ar", "SA")
                tts.setPitch(1.12f); tts.setSpeechRate(0.9f)
            }
        }
    }

    private fun loadNotifications() {
        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
        val employeeId = prefs.getString("employeeId", "") ?: ""
        val deviceId = prefs.getString("deviceId", "")
            ?: Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: ""

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val response = RetrofitClient.apiService.getNotifications(employeeId, deviceId)
                val notifications = response.body()?.notifications ?: emptyList()
                withContext(Dispatchers.Main) {
                    val empty = findViewById<TextView>(R.id.tvEmptyNotifications)
                    val list = findViewById<ListView>(R.id.lvNotifications)
                    if (!response.isSuccessful || response.body()?.success != true) {
                        empty.visibility = View.VISIBLE
                        empty.text = "❌ " + (response.body()?.message ?: "تعذر جلب الإشعارات من السيرفر")
                        return@withContext
                    }
                    if (notifications.isEmpty()) {
                        empty.visibility = View.VISIBLE
                        list.visibility = View.GONE
                        return@withContext
                    }
                    empty.visibility = View.GONE
                    list.visibility = View.VISIBLE

                    val rows = notifications.map { n ->
                        val icon = if (n.type == "voice") "🎙️ رسالة صوتية" else "📩 رسالة من الإدارة"
                        val urgent = if (n.priority == "urgent") "🚨 عاجل — " else ""
                        "$urgent$icon\n${n.message ?: ""}\n${formatServerDate(n.createdAt)}" +
                            (if (!n.audioUrl.isNullOrEmpty()) "\n▶️ اضغط لتشغيل الصوت المرفق" else "")
                    }
                    list.adapter = ArrayAdapter(this@NotificationActivity,
                        R.layout.item_readable_list, rows)

                    // تشغيل الصوت المرفق أو قراءة النص بصوت أنثى عربي عند الضغط
                    list.setOnItemClickListener { _, _, pos, _ ->
                        val n = notifications[pos]
                        when {
                            !n.audioUrl.isNullOrEmpty() -> playAudio(n.audioUrl!!)
                            else -> speak(n.message ?: "لا يوجد نص")
                        }
                    }
                }
            } catch (e: java.io.IOException) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@NotificationActivity, "تعذر الاتصال بالسيرفر", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    val empty = findViewById<TextView>(R.id.tvEmptyNotifications)
                    empty.visibility = View.VISIBLE
                    empty.text = "❌ تعذر قراءة الإشعارات: ${e.message ?: "خطأ غير معروف"}"
                }
            }
        }
    }

    private fun playAudio(url: String) {
        try {
            player?.release()
            player = MediaPlayer().apply {
                setAudioStreamType(AudioManager.STREAM_MUSIC)
                setDataSource(RetrofitClient.absoluteUrl(url))
                prepare()
                start()
            }
        } catch (e: Exception) {
            Toast.makeText(this, "تعذر تشغيل الصوت", Toast.LENGTH_SHORT).show()
        }
    }

    private fun speak(text: String) {
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "notif")
    }

    override fun onDestroy() {
        player?.release(); tts.stop(); tts.shutdown()
        super.onDestroy()
    }
}
