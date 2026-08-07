const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// إعدادات Middleware
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cors());

// الاتصال بقاعدة بيانات PostgreSQL (سواء عبر رابط سحابي في Render أو محلي)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // سيعمل تلقائياً مع رابط Render أو متغيرات البيئة
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false // مطلوب أحياناً للسيرفرات السحابية
});

// اختبار الاتصال بـ PostgreSQL وتنشيط الجداول تلقائياً
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS employees (
                id SERIAL PRIMARY KEY,
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
                start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS loans (
                id SERIAL PRIMARY KEY,
                company_id TEXT,
                username TEXT,
                amount NUMERIC,
                reason TEXT,
                status TEXT DEFAULT 'معلق',
                request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ تم الاتصال بقاعدة بيانات PostgreSQL وإنشاء الجداول بنجاح.');
    } catch (err) {
        console.error('❌ خطأ في تهيئة قاعدة بيانات PostgreSQL:', err.message);
    }
}

initDB();

// 1. مسار (API) تسجيل الموظف وحفظه في PostgreSQL
app.post('/api/v1/employees', async (req, res) => {
    const { deviceId, companyId, name, email, specialty, workplace, username, password, location, photo } = req.body;

    if (!companyId || !name || !username || !password) {
        return res.status(400).json({ success: false, message: 'يرجى إدخال الحقول الأساسية المطلوبة.' });
    }

    try {
        const query = `
            INSERT INTO employees (device_id, company_id, name, email, specialty, workplace, username, password, location, photo) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
            RETURNING id;
        `;
        const values = [deviceId, companyId, name, email, specialty, workplace, username, password, location, photo];
        
        const result = await pool.query(query, values);
        
        res.status(201).json({ 
            success: true, 
            message: "تم حفظ بيانات الموظف في قاعدة البيانات بنجاح.",
            employeeId: result.rows[0].id 
        });
    } catch (err) {
        console.error("DB Insert Error:", err.message);
        res.status(400).json({ success: false, message: "اسم المستخدم موجود مسبقاً أو حدث خطأ في قاعدة البيانات." });
    }
});

// 2. مسار (API) تقديم طلب سلفة جديد وحفظه في PostgreSQL
app.post('/api/v1/loans', async (req, res) => {
    const { companyId, username, amount, reason } = req.body;

    if (!companyId || !username || !amount) {
        return res.status(400).json({ success: false, message: 'بيانات الطلب غير مكتملة.' });
    }

    try {
        const query = `
            INSERT INTO loans (company_id, username, amount, reason) 
            VALUES ($1, $2, $3, $4) 
            RETURNING id;
        `;
        const values = [companyId, username, amount, reason];
        
        const result = await pool.query(query, values);
        
        res.status(201).json({ 
            success: true, 
            message: "تم تقديم طلب السلفة وحفظه بنجاح.",
            loanId: result.rows[0].id 
        });
    } catch (err) {
        console.error("Loan Insert Error:", err.message);
        res.status(500).json({ success: false, message: "فشل حفظ طلب السلفة." });
    }
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 سيرفر المراقب برو يعمل بكفاءة على المنفذ ${PORT} باستخدام PostgreSQL.`);
});
