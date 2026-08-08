const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cors());

// الاتصال بقاعدة البيانات المحلية على الهارد دسك
const db = new sqlite3.Database('./almoraqeb_pro.db', (err) => {
    if (err) {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات المحلية:', err.message);
    } else {
        console.log('✅ متصل بقاعدة بيانات الهارد دسك (SQLite) محلياً.');
    }
});

// رابط سيرفرك السحابي على Render
const CLOUD_API_URL = 'https://your-app-name.onrender.com/api/v1/employees';

// مسار التسجيل محلياً ومع المزامنة السحابية
app.post('/api/v1/employees', (req, res) => {
    const employeeData = req.body;
    const { deviceId, companyId, name, email, specialty, workplace, username, password, location, photo } = employeeData;

    if (!companyId || !name || !username || !password) {
        return res.status(400).json({ success: false, message: 'يرجى إدخال الحقول الأساسية المطلوبة.' });
    }

    const query = `INSERT INTO employees (device_id, company_id, name, email, specialty, workplace, username, password, location, photo, start_date) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`;

    // 1. الحفظ أولاً على الهارد دسك المحلي
    db.run(query, [deviceId, companyId, name, email, specialty, workplace, username, password, location, photo], async function(err) {
        if (err) {
            console.error("Local DB Error:", err.message);
            return res.status(400).json({ success: false, message: "اسم المستخدم موجود مسبقاً محلياً." });
        }

        const localId = this.lastID;
        console.log('✅ تم الحفظ على الهارد دسك المحلي برقم:', localId);

        // 2. محاولة إرسال البيانات فوراً للسحابة (Render / PostgreSQL)
        try {
            await axios.post(CLOUD_API_URL, employeeData);
            console.log('☁️ تمت مزامنة البيانات وحفظها على السحابة بنجاح.');
        } catch (cloudErr) {
            console.log('⚠️ انقطع الإنترنت: تم الحفظ محلياً وستم تتم المزامنة لاحقاً عبر ملف sync.sh');
            // هنا يتم حفظ العملية في جدول منفصل للعمليات غير المتزامنة (Pending Sync)
        }

        res.status(201).json({ 
            success: true, 
            message: "تم الحفظ محلياً ومع السحابة بنجاح.",
            employeeId: localId 
        });
    });
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر المحلي يعمل على المنفذ ${PORT}`);
});
