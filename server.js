const express = require('express');
const path = require('path');
const { pool, initDB } = require('./database'); // استدعاء قاعدة البيانات

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' })); // زيادة الحد المسموح لقبول صور الـ Base64 الكبيرة
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// تشغيل تهيئة قاعدة البيانات عند بدء التشغيل
initDB();

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 1. مسار تسجيل شركة جديدة من واجهة المتصفح (المتطابق مع صفحة التسجيل الجديدة)
app.post('/api/developer/register-company', async (req, res) => {
    const { companyId, companyName, manager, phone, email, username, password, photo } = req.body;
    try {
        const compId = companyId.trim().toUpperCase();

        // حفظ الشركة في جدول companies
        await pool.query(
            'INSERT INTO companies (company_id, company_name) VALUES ($1, $2) ON CONFLICT (company_id) DO NOTHING',
            [compId, companyName]
        );

        // إنشاء حساب المدير (المسؤول عن الشركة) في جدول employees مع حقل pass و photo
        await pool.query(
            'INSERT INTO employees (company_id, name, username, phone, password, pass, role, photo) VALUES ($1, $2, $3, $4, $5, $5, $6, $7)',
            [compId, manager, username, phone, password, 'admin', photo || 'default.jpg']
        );

        res.json({ 
            success: true, 
            message: 'تم تسجيل الشركة وتفعيل الحساب بنجاح!', 
            companyCode: compId
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. مسار تسجيل الموظف: باستخدام "رمز الشركة" المخصص ليرتبط بها تلقائياً
app.post('/api/employees/register', async (req, res) => {
    const { companyCode, name, username, phone, password } = req.body;
    try {
        const checkCompany = await pool.query('SELECT * FROM companies WHERE company_id = $1', [companyCode]);
        if (checkCompany.rows.length === 0) {
            return res.json({ success: false, message: 'رمز الشركة غير صحيح، يرجى التأكد من الإدارة!' });
        }

        const checkUser = await pool.query('SELECT * FROM employees WHERE username = $1', [username]);
        if (checkUser.rows.length > 0) {
            return res.json({ success: false, message: 'اسم المستخدم مستخدم مسبقاً!' });
        }

        await pool.query(
            'INSERT INTO employees (company_id, name, username, phone, password, pass, role) VALUES ($1, $2, $3, $4, $5, $5, $6)',
            [companyCode, name, username, phone, password, 'employee']
        );

        res.json({ success: true, message: 'تم تسجیل الموظف في الشركة بنجاح!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. مسار تسجيل الدخول الموحد (للمدير أو الموظف) - يدعم حقول password أو pass
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query(
            'SELECT * FROM employees WHERE username = $1 AND (password = $2 OR pass = $2)', 
            [username, password]
        );
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            res.json({ 
                success: true, 
                message: 'تم تسجيل الدخول بنجاح', 
                companyCode: user.company_id,
                role: user.role, 
                user: user 
            });
        } else {
            res.json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. مسار جلب قائمة موظفي الشركة المحددة فقط لوحة تحكم المدير
app.get('/api/employees/list', async (req, res) => {
    const companyCode = req.query.company;
    try {
        const result = await pool.query('SELECT name, username, phone, created_at FROM employees WHERE company_id = $1', [companyCode]);
        res.json({ success: true, employees: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`Server is running successfully on port ${PORT}`);
});
