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

    private lateinit var cases: List<Triple<String, String, String>>

    private lateinit var tts: TextToSpeech

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_simple_list)
        findViewById<TextView>(R.id.tvListTitle).text = "⛑️ الإسعافات الأولية"
        findViewById<View>(R.id.progressList).visibility = View.GONE

        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts.language = resources.configuration.locales[0]
                tts.setPitch(1.12f); tts.setSpeechRate(0.9f)
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

    override fun onDestroy() { tts.stop(); tts.shutdown(); super.onDestroy() }
}
