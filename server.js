const express = require('express');
const path = require('path');
const { pool, initDB } = require('./database'); // استدعاء قاعدة البيانات

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // جعل مجلد public متاحاً للملفات الثابتة

// تشغيل تهيئة قاعدة البيانات عند بدء التشغيل
initDB();

// 1. الصفحة الرئيسية تصبح index.html وتظهر معلومات شركة الأرجوان للبرمجيات
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 2. مسار إضافة الشركات يدوياً من قبل المطور (أو يمكن إضافتها مباشرة عبر قاعدة البيانات)
// مثال لإنشاء أو التحقق من بيانات الشركة الممنوحة للزبون
app.post('/api/company/verify', async (req, res) => {
    const { companyId, licenseKey } = req.body;
    // يمكنك التحقق من الترخيص أو السماح للزبون بالدخول لوحته
    try {
        const result = await pool.query('SELECT * FROM companies WHERE company_id = $1', [companyId]);
        if (result.rows.length > 0) {
            res.json({ success: true, message: 'تم التحقق من الترخيص بنجاح' });
        } else {
            res.json({ success: false, message: 'معرف الشركة غير مسجل، يرجى مراجعة الدعم الفني.' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. مسار تسجيل دخول الموظفين/الشركات
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM employees WHERE username = $1 AND password = $2', [username, password]);
        if (result.rows.length > 0) {
            res.json({ success: true, message: 'تم تسجيل الدخول بنجاح', user: result.rows[0] });
        } else {
            res.json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`Server is running successfully on port ${PORT}`);
});
