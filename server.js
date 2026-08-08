const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public'))); // قراءة الملفات من مجلد public

// الاتصال بقاعدة البيانات المحلية (الهارد دسك)
const db = new sqlite3.Database('./almoraqeb_pro.db', (err) => {
    if (err) {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات المحلية:', err.message);
    } else {
        console.log('✅ متصل بقاعدة بيانات الهارد دسك (SQLite) محلياً.');
        // إنشاء جدول الموظفين تلقائياً إن لم يكن موجوداً
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
            start_date DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// رابط السيرفر السحابي على Render (للمزامنة)
const CLOUD_API_URL = 'https://your-app-name.onrender.com/api/v1/employees';

// 1. فتح الصفحة الرئيسية تلقائياً
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 2. مسار تسجيل الدخول والتحقق الفعلي
app.post('/api/v1/login', (req, res) => {
    const { companyId, username, password } = req.body;
    
    const query = `SELECT * FROM employees WHERE company_id = ? AND username = ? AND password = ?`;
    db.get(query, [companyId, username, password], (err, row) => {
        if (err || !row) {
            return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
        }
        res.json({ success: true, user: row });
    });
});

// 3. مسار جلب جميع الموظفين الحقيقيين (مهم جداً لإدارة الحضور)
app.get('/api/v1/employees', (req, res) => {
    const query = `SELECT * FROM employees`;
    db.all(query, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'خطأ في جلب بيانات الموظفين' });
        }
        res.json({ success: true, employees: rows });
    });
});

// 4. مسار حفظ موظف جديد حقيقي محلياً مع محاولة المزامنة للسحابة
app.post('/api/v1/employees', (req, res) => {
    const employeeData = req.body;
    const { deviceId, companyId, name, email, specialty, workplace, username, password, location, photo } = employeeData;

    if (!companyId || !name || !username || !password) {
        return res.status(400).json({ success: false, message: 'يرجى إدخال الحقول الأساسية المطلوبة.' });
    }

    const query = `INSERT INTO employees (device_id, company_id, name, email, specialty, workplace, username, password, location, photo) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.run(query, [deviceId, companyId, name, email, specialty, workplace, username, password, location, photo], async function(err) {
        if (err) {
            console.error("Local DB Error:", err.message);
            return res.status(400).json({ success: false, message: "اسم المستخدم موجود مسبقاً في قاعدة البيانات." });
        }

        const localId = this.lastID;
        console.log('✅ تم الحفظ في قاعدة البيانات المحلية برقم:', localId);

        // محاولة الرفع والمزامنة للسحابة
        try {
            await axios.post(CLOUD_API_URL, employeeData);
            console.log('☁️ تمت مزامنة الموظف مع السحابة بنجاح.');
        } catch (cloudErr) {
            console.log('⚠️ انترنت غير متصل بالسحابة: تم الحفظ محلياً بانتظام.');
        }

        res.status(201).json({ 
            success: true, 
            message: "تم حفظ الموظف حقيقياً بنجاح.",
            employeeId: localId 
        });
    });
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر الحقيقي يعمل على المنفذ ${PORT}`);
});
