# AlMoraqebPro Server

نظام **المراقب برو** لمراقبة حضور الموظفين وإدارتهم، مبنٍ على **Node.js + Express + MongoDB**.

## الاستخدام والتنزيل

- **نسخة الويب لجميع الأجهزة:** [فتح المراقب برو](https://almoraqebpro-server-aymo.onrender.com/)
- **Android وLinux وWindows:** تتوفر ملفات التثبيت في [صفحة الإصدارات](https://github.com/arjwan/AlMoraqebPro-Server/releases/latest).
- Linux متاح بصيغة AppImage لمعالجات Intel/AMD ذات 64 بت.

هذه الواجهة الخلفية (Backend/API) مسؤولة عن:
- إدارة الشركات والاشتراكات.
- تسجيل الموظفين وطلباتهم.
- تسجيل الحضور والانصراف وتتبع المواقع.
- الطلبات الخدمية (إجازات / سلف) والإشعارات.
- لوحة تحكم المطور والمدير.

## البنية التقنية
| المكوّن   | التقنية |
|-----------|---------|
| الخادم    | Node.js + Express |
| قاعدة البيانات | MongoDB (Mongoose) |
| المصادقة  | JWT مخصص بتوقيع HMAC-SHA256 (عبر `SESSION_SECRET`) |
| كلمات المرور | `scrypt` + salt |
| الرفع     | multer (صور الموظفين) |
| النشر     | Render |
| المصدر    | GitHub |

> البنية الرسمية للنشر هي: **GitHub → Render → MongoDB Atlas**.
> لا يوجد Oracle، ولا أي نشر عبر SSH أو خادم Oracle في هذا المشروع.

> ملاحظة: النشر الرسمي والحالي يعتمد على **MongoDB + Render**. لا يُستخدم Oracle في النشر.

## المتغيرات المطلوبة (Environment Variables)
| المتغير | إلزامي | الوصف |
|---------|:------:|-------|
| `MONGO_URI` | ✅ | رابط الاتصال بقاعدة بيانات MongoDB |
| `DEVELOPER_PASSWORD` | ✅ | كلمة مرور المطور |
| `SESSION_SECRET` | ❌ | سر توقيع الجلسات (يُستخدم `DEVELOPER_PASSWORD` كاحتياط) |
| `PORT` | ❌ | منفذ التشغيل (Render يحدده تلقائيًا) |
| `ALLOWED_ORIGINS` | ❌ | قائمة أصول CORS مفصولة بفاصلة |

انظر `.env.example` لمزيد من التفاصيل.

## التشغيل محليًا
```bash
npm install
cp .env.example .env   # ثم عبّئ القيم
npm start
```

عند نجاح الاتصال بمجرد التحميل:
- السيرفر يستمع على `PORT` فورًا حتى لو كانت قاعدة البيانات غير متاحة (يُعاد الاتصال تلقائيًا).
- الـ health check متاح على `GET /health`.

## Health Check (لـ Render)
```
GET /health
```
- يُرجع `200 { status: "ok", database: "connected", ... }` عندما تكون القاعدة متصلة.
- يُرجع `503 { status: "degraded", database: "disconnected", ... }` عند ضعف الاتصال
  (الخادم يبقى قيد التشغيل ويعيد المحاولة تلقائيًا).

مثال إعداد **Render Health Check Path**: `/health`

## بنية المشروع
```
.
├── server.js              # التطبيق الرئيسي (الراوترات + المخططات + الاتصال)
├── server-preload.js      # حقن نقاط نهاية إضافية محمية (يُحمّل قبل server.js)
├── admin-pages-preload.js # توجيه بطاقات لوحة التحكم لصفحات إدارية أصغر
├── routes/                # (ملفات سابقة قديمة غير مربوطة بالتشغيل الحالي)
├── public/                # الواجهات الأمامية الثابتة (HTML/JS/CSS)
├── data/                  # بيانات محلية قديمة
├── sync.sh                # سكربت مزامنة
├── routes/
└── .env.example          # قالب متغيرات البيئة (بدون أسرار)
```

> **ملاحظة:** مجلد `routes/` يحوي ملفات قديمة (PostgreSQL/`global.db`) **غير مربوطة**
> بِتشغيل الخادم الحالي الذي يعتمد على MongoDB من داخل `server.js`. أنقِل هذه الملفات
> أو أزلْها لاحقًا حسب الحاجة دون أن يؤثر ذلك على التشغيل.

---

## النشر على Render + MongoDB Atlas

1. **MongoDB Atlas**: أنشئ كلاستر واحصل على رابط `mongodb+srv://...`.
2. **GitHub**: ارفع المشروع إلى مستودع.
3. **Render**:
   - أنشئ خدمة **Web Service** واربطها بالمستودع.
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variables**:
     - `MONGO_URI` = رابط MongoDB Atlas
     - `DEVELOPER_PASSWORD` = كلمة مرور قوية
     - `SESSION_SECRET` = سر قوي مستقل
   - **Health Check Path**: `/health`

---

## الأمان
- لا تُخزَّن كلمات المرور كنص صريح (`scrypt` + salt).
- لا تُرفع ملفات `.env` إلى Git (مضمنة في `.gitignore`).
- ترويسات أمان مضمنة (X-Frame-Options، X-Content-Type-Options، Referrer-Policy، ...).
- `x-powered-by` معطّل.
- CORS قابل للتهيئة عبر `ALLOWED_ORIGINS`.
- رسائل أخطاء موحّدة تمنع تسريب تفاصيل داخلية.