const express = require('express');
const path = require('path');
const { pool, initDB } = require('./database'); 

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

initDB();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- المسارات الحالية ---

app.post('/api/developer/register-company', async (req, res) => {
    const { companyId, companyName, manager, phone, email, username, password, photo } = req.body;
    try {
        const compId = companyId.trim().toUpperCase();
        await pool.query('INSERT INTO companies (company_id, company_name) VALUES ($1, $2) ON CONFLICT (company_id) DO NOTHING', [compId, companyName]);
        await pool.query('INSERT INTO employees (company_id, name, username, phone, password, pass, role, photo) VALUES ($1, $2, $3, $4, $5, $5, $6, $7)',
            [compId, manager, username, phone, password, 'admin', photo || 'default.jpg']);
        res.json({ success: true, message: 'تم تسجيل الشركة بنجاح!', companyCode: compId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/employees/register', async (req, res) => {
    const { companyCode, name, username, phone, password } = req.body;
    try {
        const checkCompany = await pool.query('SELECT * FROM companies WHERE company_id = $1', [companyCode]);
        if (checkCompany.rows.length === 0) return res.json({ success: false, message: 'رمز الشركة غير صحيح' });
        await pool.query('INSERT INTO employees (company_id, name, username, phone, password, pass, role) VALUES ($1, $2, $3, $4, $5, $5, $6)', [companyCode, name, username, phone, password, 'employee']);
        res.json({ success: true, message: 'تم تسجيل الموظف بنجاح!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

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

// --- المسار الجديد المضاف للتعرف على الوجه ---
app.post('/api/auth/face-login', async (req, res) => {
    const { image } = req.body; // استلام الصورة المرسلة من الواجهة
    try {
        if (!image) {
            return res.status(400).json({ success: false, message: 'لم يتم إرسال صورة' });
        }

        // هنا تضع منطق المطابقة:
        // 1. قارن الـ image مع الصور المخزنة في قاعدة البيانات (في جدول employees حقل photo)
        // 2. إذا تطابقت الصورة مع أحد الموظفين، أرجع بياناته
        
        console.log("تم استلام طلب مطابقة وجه، جاري المعالجة...");

        // مثال للرد: (يجب تعديله ليعيد true عند المطابقة الفعلية)
        res.json({ 
            success: false, 
            message: 'ميزة مطابقة الوجه قيد البرمجة حالياً في السيرفر' 
        });
        
    } catch (err) {
        console.error("Face Login Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/employees/list', async (req, res) => {
    const companyCode = req.query.company;
    try {
        const result = await pool.query('SELECT name, username, phone, created_at FROM employees WHERE company_id = $1', [companyCode]);
        res.json({ success: true, employees: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running successfully on port ${PORT}`);
});
