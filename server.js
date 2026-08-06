const express = require('express');
const path = require('path');
const { pool, initDB } = require('./database'); // استدعاء قاعدة البيانات

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// تشغيل تهيئة قاعدة البيانات عند بدء التشغيل
initDB();

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 1. مسار المطور (صفحة التسجيل): إنشاء شركة جديدة وتوليد رمز خاص بها مع حساب المدير
app.post('/api/developer/register-company', async (req, res) => {
    const { companyName, adminUsername, adminPassword } = req.body;
    try {
        // توليد رمز فريد ومميز للشركة (مثال: COMP-8421)
        const companyCode = 'COMP-' + Math.floor(1000 + Math.random() * 9000);

        // حفظ الشركة في قاعدة البيانات مع رمزها
        await pool.query(
            'INSERT INTO companies (company_id, company_name) VALUES ($1, $2)',
            [companyCode, companyName]
        );

        // إنشاء حساب المدير (المسؤول عن الشركة)
        await pool.query(
            'INSERT INTO employees (company_id, name, username, password, role) VALUES ($1, $2, $3, $4, $5)',
            [companyCode, 'مدير الشركة', adminUsername, adminPassword, 'admin']
        );

        res.json({ 
            success: true, 
            message: 'تم تسجيل الشركة وتوليد الرمز بنجاح!', 
            companyCode: companyCode,
            adminUsername: adminUsername
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. مسار تسجيل الموظف: باستخدام "رمز الشركة" المخصص ليرتبط بها تلقائياً
app.post('/api/employees/register', async (req, res) => {
    const { companyCode, name, username, phone, password } = req.body;
    try {
        // التحقق هل رمز الشركة صحيح وموجود في قاعدة البيانات؟
        const checkCompany = await pool.query('SELECT * FROM companies WHERE company_id = $1', [companyCode]);
        if (checkCompany.rows.length === 0) {
            return res.json({ success: false, message: 'رمز الشركة غير صحيح، يرجى التأكد من الإدارة!' });
        }

        // التحقق من عدم تكرار اسم المستخدم
        const checkUser = await pool.query('SELECT * FROM employees WHERE username = $1', [username]);
        if (checkUser.rows.length > 0) {
            return res.json({ success: false, message: 'اسم المستخدم مستخدم مسبقاً!' });
        }

        // إدخال الموظف وربطه تلقائياً بشركة الزبون
        await pool.query(
            'INSERT INTO employees (company_id, name, username, phone, password, role) VALUES ($1, $2, $3, $4, $5, $6)',
            [companyCode, name, username, phone, password, 'employee']
        );

        res.json({ success: true, message: 'تم تسجیل الموظف في الشركة بنجاح!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. مسار تسجيل الدخول الموحد (للمدير أو الموظف)
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM employees WHERE username = $1 AND password = $2', [username, password]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            res.json({ 
                success: true, 
                message: 'تم تسجيل الدخول بنجاح', 
                companyCode: user.company_id,
                role: user.role, // لمعرفة ما إذا كان مديراً أم موظفاً لتوجيهه للوحة الخاصة به
                user: user 
            });
        } else {
            res.json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. مسار جلب قائمة موظفي الشركة المحددة فقط للوحة تحكم المدير
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
