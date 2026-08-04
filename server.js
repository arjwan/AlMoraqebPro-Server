const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const app = express();

// إعدادات الوسائط الأساسية
app.use(express.json());
app.use(cors());

// إعداد الاتصال بقاعدة بيانات PostgreSQL (سواء محلياً أو عبر Render)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// إنشاء جدول الشركات تلقائياً عند تشغيل السيرفر إن لم يكن موجوداً
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS companies (
                id SERIAL PRIMARY KEY,
                company_id VARCHAR(255) UNIQUE NOT NULL,
                company_name VARCHAR(255) NOT NULL,
                username VARCHAR(255),
                email VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("Database table 'companies' is ready.");
    } catch (err) {
        console.error("Error creating database table:", err);
    }
}
initDB();

// جعل مجلد 'public' هو المجلد الأساسي لجميع الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public')));

// مسار التحقق من عمل السيرفر
app.get('/api/status', (req, res) => {
    res.json({ success: true, message: 'AlMoraqeb Pro Server & Database are running perfectly!' });
});

// مسار تسجيل الشركة الفعلي وحفظها في قاعدة البيانات
app.post('/api/companies/register', async (req, res) => {
    const { companyName, username, email, licenseKey } = req.body;
    
    if (!companyName) {
        return res.status(400).json({ success: false, message: 'اسم الشركة مطلوب' });
    }

    try {
        // توليد معرف فريد للشركة
        const sanitizedName = companyName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const companyId = `${sanitizedName}_${Math.floor(Math.random() * 9000) + 1000}`;
        
        // حفظ الشركة في قاعدة البيانات الحقيقية
        const query = `
            INSERT INTO companies (company_id, company_name, username, email)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        const values = [companyId, companyName, username || '', email || ''];
        const result = await pool.query(query, values);

        res.json({
            success: true,
            message: 'تم إنشاء قاعدة البيانات والبيانات المستقلة بنجاح في النظام',
            companyId: result.rows[0].company_id,
            customUrl: `https://almoraqebpro-server.onrender.com/admin.html?company=${result.rows[0].company_id}`
        });

    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ success: false, message: 'حدث خطأ أثناء حفظ الشركة في قاعدة البيانات', error: err.message });
    }
});

// توجيه الصفحة الرئيسية لفتح صفحة التسجيل للزبون
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-register.html'));
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
