const express = require('express');
const path = require('path');
const { pool, initDB } = require('./database'); // استدعاء ملف قاعدة البيانات

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// تشغيل تهيئة قاعدة البيانات عند بدء التشغيل
initDB();

// توجيه الصفحة الرئيسية مباشرة إلى مسارها الصحيح داخل مجلد public
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-register.html'), (err) => {
        if (err) {
            res.status(404).send('❌ Error: admin-register.html file not found in public folder.');
        }
    });
});

// 1. مسار جلب أو إنشاء معلومات الشركة
app.get('/api/companies/info', async (req, res) => {
    const companyId = req.query.company || 'default_company';
    try {
        let result = await pool.query('SELECT * FROM companies WHERE company_id = $1', [companyId]);
        if (result.rows.length === 0) {
            await pool.query('INSERT INTO companies (company_id, company_name) VALUES ($1, $2)', [companyId, companyId]);
            result = await pool.query('SELECT * FROM companies WHERE company_id = $1', [companyId]);
        }
        res.json({ success: true, company: { company_name: result.rows[0].company_name } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. مسار تسجيل موظف جديد
app.post('/api/employees/register', async (req, res) => {
    const { companyId, name, username, phone, password } = req.body;
    try {
        const compId = companyId || 'default_company';
        const checkUser = await pool.query('SELECT * FROM employees WHERE username = $1', [username]);
        if (checkUser.rows.length > 0) {
            return res.json({ success: false, message: 'اسم المستخدم مستخدم مسبقاً!' });
        }

        await pool.query(
            'INSERT INTO employees (company_id, name, username, phone, password) VALUES ($1, $2, $3, $4, $5)',
            [compId, name, username, phone, password]
        );

        res.json({ success: true, message: 'تم تسجیل الموظف وحفظه في قاعدة البيانات بنجاح' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. مسار جلب قائمة موظفي الشركة للجداول
app.get('/api/employees/list', async (req, res) => {
    const companyId = req.query.company || 'default_company';
    try {
        const result = await pool.query('SELECT name, username, phone, created_at FROM employees WHERE company_id = $1', [companyId]);
        res.json({ success: true, employees: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`Server is running successfully on port ${PORT}`);
});
