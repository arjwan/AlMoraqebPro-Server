const express = require('express');
const path = require('path');
const { pool, initDB } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// زيادة الحد المسموح لنقل صور Base64 الكبيرة
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

initDB();

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 1. تسجيل شركة جديدة
app.post('/api/developer/register-company', async (req, res) => {
    const { companyId, companyName, manager, phone, username, password, photo } = req.body;
    try {
        const compId = companyId.trim().toUpperCase();
        await pool.query('INSERT INTO companies (company_id, company_name) VALUES ($1, $2) ON CONFLICT (company_id) DO NOTHING', [compId, companyName]);
        await pool.query('INSERT INTO employees (company_id, name, username, phone, password, pass, role, photo) VALUES ($1, $2, $3, $4, $5, $5, $6, $7)',
            [compId, manager, username, phone, password, 'admin', photo]);
        res.json({ success: true, message: 'تم تسجيل الشركة بنجاح!', companyCode: compId });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. تسجيل موظف
app.post('/api/employees/register', async (req, res) => {
    const { companyCode, name, username, phone, password, photo } = req.body;
    try {
        await pool.query('INSERT INTO employees (company_id, name, username, phone, password, pass, role, photo) VALUES ($1, $2, $3, $4, $5, $5, $6, $7)', 
            [companyCode, name, username, phone, password, 'employee', photo]);
        res.json({ success: true, message: 'تم تسجيل الموظف بنجاح!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. تسجيل الدخول العادي
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM employees WHERE username = $1 AND (password = $2 OR pass = $2)', [username, password]);
        if (result.rows.length > 0) {
            res.json({ success: true, message: 'تم تسجيل الدخول بنجاح', companyCode: result.rows[0].company_id, role: result.rows[0].role });
        } else {
            res.json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. تسجيل الدخول بالوجه (المطابقة)
app.post('/api/auth/face-login', async (req, res) => {
    const { image } = req.body;
    try {
        // جلب جميع الموظفين الذين لديهم صور مخزنة
        const result = await pool.query('SELECT username, company_id, role, photo FROM employees WHERE photo IS NOT NULL');
        
        let authenticatedUser = null;

        // مطابقة الصورة (في بيئة الإنتاج يفضل استخدام مكتبة مقارنة متقدمة)
        for (const user of result.rows) {
            if (user.photo === image) {
                authenticatedUser = user;
                break;
            }
        }

        if (authenticatedUser) {
            res.json({ 
                success: true, 
                message: 'تم التعرف على الوجه بنجاح!', 
                companyCode: authenticatedUser.company_id,
                role: authenticatedUser.role
            });
        } else {
            res.json({ success: false, message: 'لم يتم العثور على مطابقة للوجه، يرجى التسجيل أولاً.' });
        }
    } catch (err) {
        console.error("Face Auth Error:", err);
        res.status(500).json({ success: false, error: 'خطأ في عملية المطابقة' });
    }
});

// 5. جلب الموظفين
app.get('/api/employees/list', async (req, res) => {
    try {
        const result = await pool.query('SELECT name, username, phone, created_at FROM employees WHERE company_id = $1', [req.query.company]);
        res.json({ success: true, employees: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running successfully on port ${PORT}`);
});
