const express = require('express');
const path = require('path');
const { pool, initDB } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

initDB();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 1. تسجيل شركة جديدة
app.post('/api/developer/register-company', async (req, res) => {
    const { companyId, companyName, manager, phone, username, password, photo } = req.body;
    try {
        const compId = companyId.trim().toUpperCase();
        await pool.query('INSERT INTO companies (company_id, company_name) VALUES ($1, $2) ON CONFLICT (company_id) DO NOTHING', [compId, companyName]);
        await pool.query('INSERT INTO employees (company_id, name, username, phone, password, role, photo) VALUES ($1, $2, $3, $4, $5, $6, $7)',
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
        await pool.query('INSERT INTO employees (company_id, name, username, phone, password, role, photo) VALUES ($1, $2, $3, $4, $5, $6, $7)', 
            [companyCode, name, username, phone, password, 'employee', photo]);
        res.json({ success: true, message: 'تم تسجيل الموظف بنجاح!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. مسار الدخول السريع للمدير (رمز الشركة + رقم الهاتف)
app.post('/api/auth/quick-login', async (req, res) => {
    const { companyCode, phone } = req.body;
    try {
        const cleanCompanyId = companyCode.trim().toUpperCase();
        const cleanPhone = phone.trim();

        const result = await pool.query(
            'SELECT * FROM employees WHERE company_id = $1 AND phone = $2', 
            [cleanCompanyId, cleanPhone]
        );
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            res.json({ 
                success: true, 
                message: 'تم تسجيل الدخول السريع بنجاح', 
                companyCode: user.company_id, 
                role: user.role 
            });
        } else {
            res.json({ success: false, message: 'رمز الشركة أو رقم الهاتف غير مطابق في النظام' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. تسجيل الدخول الاعتيادي
app.post('/api/auth/login', async (req, res) => {
    const { companyCode, username, password } = req.body;
    try {
        const result = await pool.query(
            'SELECT * FROM employees WHERE company_id = $1 AND username = $2 AND password = $3', 
            [companyCode, username, password]
        );
        if (result.rows.length > 0) {
            res.json({ 
                success: true, 
                message: 'تم تسجيل الدخول بنجاح', 
                companyCode: result.rows[0].company_id, 
                role: result.rows[0].role 
            });
        } else {
            res.json({ success: false, message: 'بيانات الدخول غير صحيحة' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 5. جلب معلومات الشركة لعرضها في لوحة التحكم
app.get('/api/companies/info', async (req, res) => {
    const companyId = req.query.company;
    try {
        const result = await pool.query('SELECT * FROM companies WHERE company_id = $1', [companyId]);
        if (result.rows.length > 0) {
            res.json({ success: true, company: result.rows[0] });
        } else {
            res.json({ success: false, message: 'الشركة غير موجودة' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6. جلب الموظفين حسب معرف الشركة
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
