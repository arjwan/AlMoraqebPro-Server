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

// حماية صفحة الأدمن: منع فتحها مباشرة إلا بوجود معرف شركة صالح وموجود في قاعدة البيانات
async function verifyAdminAccess(req, res, next) {
    const companyId = req.query.company;
    
    // إذا لم يتم إرفاق معرف الشركة في الرابط، يرفض السيرفر الاستجابة فوراً
    if (!companyId) {
        return res.status(403).send("<h1>403 Forbidden</h1><p>غير مسموح بالوصول المباشر لهذه الصفحة. يرجى التسجيل أو التفعيل أولاً.</p>");
    }

    try {
        // التحقق مما إذا كانت الشركة موجودة حقاً في قاعدة البيانات
        const result = await pool.query('SELECT * FROM companies WHERE company_id = $1', [companyId]);
        
        if (result.rows.length === 0) {
            return res.status(403).send("<h1>403 Forbidden</h1><p>معرف الشركة غير صالح أو غير مسجل في النظام.</p>");
        }

        // إذا كانت الشركة موجودة، يُسمح له بفتح الصفحة
        next();
    } catch (err) {
        console.error("Database Auth Error:", err);
        return res.status(500).send("حدث خطأ في التحقق من الصلاحيات.");
    }
}

// جعل مجلد 'public' عاماً، مع تعطيل الـ index التلقائي لعزل الملفات الحساسة
app.use(express.static(path.join(__dirname, 'public'), {
    index: false
}));

// توجيه الرابط الجديد لفتح صفحة التفعيل/التسجيل حصراً
app.get('/company-activate.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'company-activate.html'));
});

// جعل صفحة التفعيل هي الصفحة الرئيسية افتراضياً عند فتح الرابط الأساسي للموقع
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'company-activate.html'));
});

// مسار صفحة الأدمن المحمي بالكامل (لن تفتح ولن يستجيب السيرفر إلا بمعرف شركة صحيح من القاعدة)
app.get('/admin.html', verifyAdminAccess, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// مسار التحقق من عمل السيرفر
app.get('/api/status', (req, res) => {
    res.json({ success: true, message: 'AlMoraqeb Pro Server & Database are running perfectly!' });
});

// مسار تسجيل الشركة الفعلي وحفظها في قاعدة البيانات وتوليد الرابط الخاص بها
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

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
