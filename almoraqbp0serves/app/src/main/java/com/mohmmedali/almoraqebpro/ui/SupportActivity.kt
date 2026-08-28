package com.mohmmedali.almoraqebpro.ui

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.mohmmedali.almoraqebpro.R
import com.mohmmedali.almoraqebpro.databinding.ActivitySupportBinding

class SupportActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySupportBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySupportBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.btnSendSupport.setOnClickListener {
            val title = binding.etSupportTitle.text.toString().trim()
            val details = binding.etSupportDetails.text.toString().trim()

            if (title.isEmpty() || details.isEmpty()) {
                Toast.makeText(this, getString(R.string.support_required), Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val message = getString(R.string.support_message_body, title, details)
            Toast.makeText(this, getString(R.string.support_success), Toast.LENGTH_SHORT).show()
            binding.etSupportTitle.setText("")
            binding.etSupportDetails.setText("")
            openEmailSupport(message)
        }

        binding.btnDeveloperInfo.setOnClickListener {
            showDeveloperDialog()
        }

        binding.btnBackSupport.setOnClickListener {
            finish()
        }
    }

    private fun openEmailSupport(message: String) {
        val emailIntent = Intent(Intent.ACTION_SENDTO).apply {
            data = Uri.parse("mailto:mohmmed1628@gmail.com")
            putExtra(Intent.EXTRA_SUBJECT, getString(R.string.support_email_subject))
            putExtra(Intent.EXTRA_TEXT, message)
        }

        if (emailIntent.resolveActivity(packageManager) != null) {
            startActivity(emailIntent)
        } else {
            Toast.makeText(this, getString(R.string.support_email_unavailable), Toast.LENGTH_SHORT).show()
        }
    }

    private fun showDeveloperDialog() {
        val info = getString(R.string.support_developer_dialog)

        AlertDialog.Builder(this)
            .setTitle(getString(R.string.support_developer_info))
            .setMessage(info)
            .setPositiveButton(getString(R.string.support_ok)) { dialog, _ -> dialog.dismiss() }
            .setNeutralButton(getString(R.string.support_whatsapp)) { _, _ ->
                val waIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/967780807491"))
                if (waIntent.resolveActivity(packageManager) != null) {
                    startActivity(waIntent)
                } else {
                    Toast.makeText(this, getString(R.string.support_whatsapp_unavailable), Toast.LENGTH_SHORT).show()
                }
            }
            .show()
    }
}
