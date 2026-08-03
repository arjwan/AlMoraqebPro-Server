const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد الاتصال بقاعدة البيانات (PostgreSQL)
// تأكد من ضبط متغيرات البيئة DATABASE_URL في إعدادات Render
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Middleware لقراءة البيانات بصيغة JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 1. مسارات تطبيق الهاتف (معزولة في مجلد /mobile وتعمل عبر مسار /app)
// ==========================================
app.use('/app', express.static(path.join(__dirname, 'mobile')));

// ==========================================
// 2. مسارات لوحة التحكم واللوحة السرية (في مجلد /public)
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 3. ربط ملف الـ Backend الخاص بالموظفين (الذي يتصل بقاعدة البيانات)
// ==========================================
const employeesRouter = require('./routes/employees')(pool);
app.use('/api/employees', employeesRouter);

// مسار افتراضي رئيسي يوجه للوحة التحكم أو الواجهة الأساسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// تشغيل السيرفر والاستماع للطلبات
app.listen(PORT, () => {
    console.log(`🚀 Server is running smoothly on port ${PORT}`);
});
