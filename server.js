const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();

app.use(express.json());
app.use(cors());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// إنشاء جدول الشركات شاملاً لجميع التفاصيل وكلمة المرور
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS companies (
                id SERIAL PRIMARY KEY,
                company_id VARCHAR(255) UNIQUE NOT NULL,
                company_name VARCHAR(255) NOT NULL,
                username VARCHAR(255),
                email VARCHAR(255),
                password VARCHAR(255),
                branch VARCHAR(255),
                province VARCHAR(255),
                address TEXT,
                base_salary NUMERIC,
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("Database table 'companies' is ready with full structure and login support.");
    } catch (err) {
        console.error("Error creating database table:", err);
    }
}
initDB();

// حماية صفحة الأدمن والتحقق من وجود معرف الشركة
async function verifyAdminAccess(req, res, next) {
    const companyId = req.query.company;
    
    if (!companyId) {
        return res.status(403).send("<h1>403 Forbidden</h1><p>غير مسموح بالوصول المباشر لهذه الصفحة. يرجى إنشاء الشركة أو التفعيل أولاً.</p>");
    }

    try {
        const result = await pool.query('SELECT * FROM companies WHERE company_id = $1', [companyId]);
        
        if (result.rows.length === 0) {
            return res.status(403).send("<h1>403 Forbidden</h1><p>معرف الشركة غير صالح أو غير مسجل في النظام.</p>");
        }

        const company = result.rows[0];
        if (company.status === 'stopped') {
            return res.status(403).send("<h1>403 Forbidden</h1><p>عذراً، هذا الحساب متوقف مؤقتاً من قبل الإدارة.</p>");
        }

        next();
    } catch (err) {
        console.error("Database Auth Error:", err);
        return res.status(500).send("حدث خطأ في التحقق من الصلاحيات.");
    }
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin-register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-register.html'));
});

app.get('/create-company.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'create-company.html'));
});

app.get('/company-register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'company-register.html'));
});

app.get('/admin.html', verifyAdminAccess, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/status', (req, res) => {
    res.json({ success: true, message: 'AlMoraqeb Pro Server & Database are running perfectly!' });
});

app.get('/company-activate.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'company-activate.html'));
});

// ==================== مسار تسجيل الدخول الجديد (من قاعدة البيانات) ====================
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }

    try {
        const inputVal = username.trim().toLowerCase();

        // 1. التحقق من الحساب العام الافتراضي
        if (inputVal === 'admin' && password === 'admin123') {
            return res.json({ 
                success: true, 
                role: 'admin', 
                companyId: 'default_company',
                redirectUrl: '/admin.html?company=default_company' 
            });
        }

        // 2. البحث عن الشركة في قاعدة البيانات (PostgreSQL) بالـ company_id أو username أو email
        const query = `
            SELECT * FROM companies 
            WHERE LOWER(company_id) = $1 OR LOWER(username) = $1 OR LOWER(email) = $1
        `;
        const result = await pool.query(query, [inputVal]);

        if (result.rows.length === 0) {
            return.status(400).json({ success: false, message: 'بيانات الدخول غير صحيحة، لم يتم العثور على الحساب' });
        }

        const company = result.rows[0];

        // التحقق من حالة الحساب
        if (company.status === 'stopped') {
            return.status(403).json({ success: false, message: 'عذراً، هذا الحساب متوقف مؤقتاً من قبل الإدارة.' });
        }

        // التحقق من كلمة المرور (إذا لم يتم تعيين كلمة مرور أثناء الإنشاء، نقبلها أو نقارنها)
        if (company.password && company.password !== password) {
            return.status(400).json({ success: false, message: 'كلمة المرور غير صحيحة' });
        }

        // تسجيل الدخول بنجاح وإرجاع رابط مخصص مع معرف الشركة لفتح لوحة التحكم الخاصة بها
        res.json({ 
            success: true, 
            role: 'company', 
            companyId: company.company_id,
            redirectUrl: `/admin.html?company=${company.company_id}`,
            message: 'تم تسجيل الدخول بنجاح' 
        });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ success: false, message: 'حدث خطأ في السيرفر أثناء تسجيل الدخول' });
    }
});

// مسار جلب معلومات الشركة لعرض اسمها في لوحة التحكم
app.get('/api/companies/info', async (req, res) => {
    const companyId = req.query.company;
    if (!companyId) {
        return res.status(400).json({ success: false, message: 'معرف الشركة مفقود' });
    }

    try {
        const result = await pool.query('SELECT company_name, company_id, branch, province, address FROM companies WHERE company_id = $1', [companyId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
        }

        res.json({ success: true, company: result.rows[0] });
    } catch (err) {
        console.error("Error fetching company info:", err);
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// مسار استقبال بيانات إنشاء الشركة وحفظها مع كلمة المرور في قاعدة البيانات
app.post('/api/companies/register', async (req, res) => {
    const { companyName, companyIdInput, username, email, password, branch, province, address, baseSalary } = req.body;
    
    if (!companyName) {
        return res.status(400).json({ success: false, message: 'اسم الشركة مطلوب' });
    }

    try {
        const sanitizedName = companyName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const companyId = companyIdInput ? companyIdInput.trim() : `${sanitizedName}_${Math.floor(Math.random() * 9000) + 1000}`;
        const companyPassword = password || '123456'; // كلمة مرور افتراضية إذا لم تُرسل
        
        const query = `
            INSERT INTO companies (company_id, company_name, username, email, password, branch, province, address, base_salary)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *;
        `;
        const values = [
            companyId, 
            companyName, 
            username || '', 
            email || '', 
            companyPassword,
            branch || '', 
            province || '', 
            address || '', 
            baseSalary || 0
        ];
        
        const result = await pool.query(query, values);

        res.json({
            success: true,
            message: 'تم حفظ وتفعيل قاعدة البيانات المستقلة للشركة بنجاح',
            companyId: result.rows[0].company_id,
            customUrl: `https://almoraqebpro-server.onrender.com/admin.html?company=${result.rows[0].company_id}`
        });

    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ success: false, message: 'حدث خطأ أثناء حفظ الشركة في قاعدة البيانات', error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
