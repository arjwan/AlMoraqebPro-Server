const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// إعدادات Middleware لتشغيل الطلبات والبيانات الكبيرة (مثل صور بصمة الوجه)
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cors());

// 1. الاتصال بقاعدة البيانات على الهارد دسك
const db = new sqlite3.Database('./almoraqeb_pro.db', (err) => {
    if (err) {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات على الهارد دسك:', err.message);
    } else {
        console.log('✅ تم الاتصال بقاعدة بيانات الهارد دسك (SQLite) بنجاح.');
    }
});

// 2. إنشاء الجداول تلقائياً (الموظفين + السلف) إذا لم تكن موجودة
db.serialize(() => {
    // جدول الموظفين
    db.run(`CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT,
        company_id TEXT,
        name TEXT,
        email TEXT,
        specialty TEXT,
        workplace TEXT,
        username TEXT UNIQUE,
        password TEXT,
        location TEXT,
        photo TEXT,
        start_date TEXT
    )`);

    // جدول طلبات السلف
    db.run(`CREATE TABLE IF NOT EXISTS loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id TEXT,
        username TEXT,
        amount REAL,
        reason TEXT,
        status TEXT DEFAULT 'معلق',
        request_date TEXT
    )`);
});

// 3. مسار (API) تسجيل الموظف وحفظه على الهارد دسك
app.post('/api/v1/employees', (req, res) => {
    const { deviceId, companyId, name, email, specialty, workplace, username, password, location, photo } = req.body;

    if (!companyId || !name || !username || !password) {
        return res.status(400).json({ success: false, message: 'يرجى إدخال الحقول الأساسية المطلوبة.' });
    }

    const query = `INSERT INTO employees (device_id, company_id, name, email, specialty, workplace, username, password, location, photo, start_date) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`;

    db.run(query, [deviceId, companyId, name, email, specialty, workplace, username, password, location, photo], function(err) {
        if (err) {
            console.error("DB Insert Error:", err.message);
            return res.status(400).json({ success: false, message: "اسم المستخدم موجود مسبقاً أو حدث خطأ في قاعدة البيانات." });
        }
        res.status(201).json({ 
            success: true, 
            message: "تم حفظ بيانات الموظف على الهارد دسك بنجاح.",
            employeeId: this.lastID 
        });
    });
});

// 4. مسار (API) تقديم طلب سلفة جديد وحفظه على الهارد دسك
app.post('/api/v1/loans', (req, res) => {
    const { companyId, username, amount, reason } = req.body;

    if (!companyId || !username || !amount) {
        return res.status(400).json({ success: false, message: 'بيانات الطلب غير مكتملة.' });
    }

    const query = `INSERT INTO loans (company_id, username, amount, reason, request_date) 
                   VALUES (?, ?, ?, ?, datetime('now'))`;

    db.run(query, [companyId, username, amount, reason], function(err) {
        if (err) {
            console.error("Loan Insert Error:", err.message);
            return res.status(500).json({ success: false, message: "فشل حفظ طلب السلفة." });
        }
        res.status(201).json({ 
            success: true, 
            message: "تم تقديم طلب السلفة وحفظه على الهارد دسك بنجاح.",
            loanId: this.lastID 
        });
    });
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 سيرفر المراقب برو يعمل بكفاءة على المنفذ ${PORT} والبيانات تُحفظ مباشرة على الهارد دسك.`);
});
