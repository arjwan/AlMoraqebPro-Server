package com.mohmmedali.almoraqebpro.ui

import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.view.View
import android.widget.ArrayAdapter
import android.widget.ListView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.mohmmedali.almoraqebpro.R
import java.util.Locale

class FirstAidActivity : AppCompatActivity() {

    private var cases: List<Triple<String, String, String>> = emptyList()

    private lateinit var tts: TextToSpeech
    private var ttsReady = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_simple_list)
        findViewById<TextView>(R.id.tvListTitle).text =
            "⛑️ ${getString(R.string.first_aid_title)}"
        findViewById<View>(R.id.progressList).visibility = View.GONE

        val titles = resources.getStringArray(R.array.first_aid_cases)
        val summaries = resources.getStringArray(R.array.first_aid_summaries)
        val details = resources.getStringArray(R.array.first_aid_details)
        val itemCount = minOf(titles.size, summaries.size, details.size)
        cases = (0 until itemCount).map { index ->
            Triple(titles[index], summaries[index], details[index])
        }

        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val languageResult = tts.setLanguage(resources.configuration.locales[0])
                ttsReady = languageResult != TextToSpeech.LANG_MISSING_DATA &&
                    languageResult != TextToSpeech.LANG_NOT_SUPPORTED
                if (ttsReady) {
                    tts.setPitch(1.12f)
                    tts.setSpeechRate(0.9f)
                }
            }
        }

        val list = findViewById<ListView>(R.id.listData)
        list.adapter = ArrayAdapter(this, R.layout.item_readable_list,
            cases.map { "${it.first}\n${it.second}" })
        list.setOnItemClickListener { _, _, pos, _ -> showDetail(pos) }
    }

    private fun showDetail(pos: Int) {
        val (title, _, detail) = cases[pos]
        AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(detail)
            .setPositiveButton(getString(R.string.first_aid_listen)) { _, _ ->
                if (!ttsReady) {
                    Toast.makeText(
                        this,
                        getString(R.string.first_aid_audio_unavailable),
                        Toast.LENGTH_SHORT
                    ).show()
                    return@setPositiveButton
                }
                val ok = tts.speak(detail, TextToSpeech.QUEUE_FLUSH, null, "fa$pos")
                if (ok != TextToSpeech.SUCCESS) {
                    Toast.makeText(
                        this,
                        getString(R.string.first_aid_audio_unavailable),
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
            .setNegativeButton(getString(R.string.first_aid_close), null)
            .show()
    }

    override fun onDestroy() {
        if (::tts.isInitialized) {
            tts.stop()
            tts.shutdown()
        }
        super.onDestroy()
    }
}
