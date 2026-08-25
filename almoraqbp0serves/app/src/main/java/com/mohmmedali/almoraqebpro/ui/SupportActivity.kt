package com.mohmmedali.almoraqebpro.ui

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
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
                Toast.makeText(this, "يرجى إدخال عنوان الطلب ومحتواه", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val message = "عنوان الطلب: $title\n\n$details"
            Toast.makeText(this, "تم إرسال طلب الدعم بنجاح", Toast.LENGTH_SHORT).show()
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
            putExtra(Intent.EXTRA_SUBJECT, "طلب دعم - المراقب برو سيرفس")
            putExtra(Intent.EXTRA_TEXT, message)
        }

        if (emailIntent.resolveActivity(packageManager) != null) {
            startActivity(emailIntent)
        } else {
            Toast.makeText(this, "لا يوجد تطبيق بريد إلكتروني متاح", Toast.LENGTH_SHORT).show()
        }
    }

    private fun showDeveloperDialog() {
        val info = "شركة الارجوان للبرمجيات\n\nواتساب: 0780807491\nالبريد: mohmmed1628@gmail.com\nالمطور: محمد العبيدي"

        AlertDialog.Builder(this)
            .setTitle("معلومات المطور")
            .setMessage(info)
            .setPositiveButton("موافق") { dialog, _ -> dialog.dismiss() }
            .setNeutralButton("واتساب") { _, _ ->
                val waIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/967780807491"))
                if (waIntent.resolveActivity(packageManager) != null) {
                    startActivity(waIntent)
                } else {
                    Toast.makeText(this, "لا يوجد تطبيق واتساب متاح", Toast.LENGTH_SHORT).show()
                }
            }
            .show()
    }
}
