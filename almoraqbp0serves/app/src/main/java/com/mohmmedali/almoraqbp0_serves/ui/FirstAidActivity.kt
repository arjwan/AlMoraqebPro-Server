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

    // نفس بيانات services.html حرفياً (10 حالات)
    private val cases = listOf(
        Triple("🩸 النزيف", "وقف النزيف الخارجي", "الضغط المباشر على الجرح بقطعة قماش نظيفة، رفع العضو المصاب، لا تقم بإزالة الجسم الغائر، اضغط بقوة حتى يتوقف النزيف، اطلب الإسعاف فوراً إذا كان النزيف حاداً."),
        Triple("🔥 الحروق", "إسعاف الحروق الحرارية", "برد الحرق بماء جارٍ بارد لمدة 15-20 دقيقة، لا تضع ثلجاً أو معجون أسنان أو زبدة، غطّ الحرق بضمادة معقمة غير لاصقة، لا تفقع الفقاعات."),
        Triple("🦴 الكسور", "تثبيت العضو المكسور", "لا تحرك المصاب إلا للضرورة، ثبّت العضو المكسور بجبيرة مؤقتة (قطعة خشب وضمادة)، ضع كمادات باردة لتقليل التورم، اطلب الإسعاف."),
        Triple("😮 الاختناق", "مناورة هيمليك", "قف خلف المصاب، ضع قبضة يدك فوق السرة، أمسكها باليد الأخرى واضغط بقوة للداخل والأعلى 5 مرات، كرر حتى خروج الجسم الغريب."),
        Triple("❤️ الإنعاش القلبي الرئوي", "CPR للبالغين", "تأكد من الوعي والتنفس، اتصل بالإسعاف، ابدأ ضغطات صدرية 30 ضغطة بمعدل 100-120/دقيقة، ثم نفسين إنقاذ، كرر الدورة حتى وصول الإسعاف."),
        Triple("😵 الإغماء", "إسعاف فقدان الوعي", "مدد المصاب على ظهره، ارفع ساقيه 30 سم، فك الأزرار والملابس الضيقة، لا تعطه أي شيء بالفم، اطلب الإسعاف إذا استمر الإغماء."),
        Triple("☠️ التسمم", "التعامل مع التسمم", "لا تحاول إحداث التقيؤ إلا إذا طلب منك مركز السموم، اتصل بالإسعاف فوراً، احفظ عبوة المادة المسببة، راقب التنفس."),
        Triple("🌡️ ضربة الشمس", "التبريد السريع", "انقل المصاب لمكان بارد، أزل الملابس الزائدة، برد الجسم بمناشف مبللة، أعطه سوائل إذا كان واعياً، اطلب الإسعاف فوراً."),
        Triple("⚡ التشنجات", "حماية المصاب أثناء النوبة", "ضع المصاب على الأرض بعيداً عن الأثاث، ضع شيئاً ناعماً تحت رأسه، لا تضع أي شيء في فمه، انتظر انتهاء النوبة ثم ضعه على جانبه."),
        Triple("🩹 الجروح", "تنظيف وتضميد الجروح", "اغسل الجرح بماء نظيف، طهره بمطهر، غطّه بضمادة معقمة، راقب علامات الالتهاب.")
    )

    private lateinit var tts: TextToSpeech

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_simple_list)
        findViewById<TextView>(R.id.tvListTitle).text = "⛑️ الإسعافات الأولية"
        findViewById<View>(R.id.progressList).visibility = View.GONE

        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts.language = Locale("ar", "SA")
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
            .setPositiveButton("🔊 استماع") { _, _ ->
                val ok = tts.speak(detail, TextToSpeech.QUEUE_FLUSH, null, "fa$pos")
                if (ok != TextToSpeech.SUCCESS) Toast.makeText(this, "الصوت غير متوفر على هذا الجهاز", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("إغلاق", null)
            .show()
    }

    override fun onDestroy() { tts.stop(); tts.shutdown(); super.onDestroy() }
}
