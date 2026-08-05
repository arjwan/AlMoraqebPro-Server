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

// إنشاء جدول الشركات شاملاً لجميع التفاصيل (الفرع، المحافظة، العنوان، إلخ)
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS companies (
                id SERIAL PRIMARY KEY,
                company_id VARCHAR(255) UNIQUE NOT NULL,
                company_name VARCHAR(255) NOT NULL,
                username VARCHAR(255),
                email VARCHAR(255),
                branch VARCHAR(255),
                province VARCHAR(255),
                address TEXT,
                base_salary NUMERIC,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("Database table 'companies' is ready with full structure.");
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

        next();
    } catch (err) {
        console.error("Database Auth Error:", err);
        return res.status(500).send("حدث خطأ في التحقق من الصلاحيات.");
    }
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-register.html'));
});

app.get('/admin-register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-register.html'));
});

app.get('/create-company.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'create-company.html'));
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

// مسار استقبال بيانات إنشاء الشركة يدوياً وحفظها بالكامل
app.post('/api/companies/register', async (req, res) => {
    const { companyName, companyIdInput, username, email, branch, province, address, baseSalary } = req.body;
    
    if (!companyName) {
        return res.status(400).json({ success: false, message: 'اسم الشركة مطلوب' });
    }

    try {
        // استخدام المعرف المدخل يدوياً أو توليده تلقائياً إذا كان فارغاً
        const sanitizedName = companyName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const companyId = companyIdInput ? companyIdInput.trim() : `${sanitizedName}_${Math.floor(Math.random() * 9000) + 1000}`;
        
        const query = `
            INSERT INTO companies (company_id, company_name, username, email, branch, province, address, base_salary)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
        `;
        const values = [
            companyId, 
            companyName, 
            username || '', 
            email || '', 
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
