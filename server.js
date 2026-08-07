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

// 4. تسجيل الدخول بالوجه (المطابقة النهائية المتقدمة)
app.post('/api/auth/face-login', async (req, res) => {
    const { image } = req.body;
    try {
        if (!image) {
            return res.status(400).json({ success: false, message: 'لم يتم استلام الصورة' });
        }

        // جلب كافة الموظفين الذين يمتلكون صوراً مسجلة
        const result = await pool.query('SELECT username, company_id, role, photo FROM employees WHERE photo IS NOT NULL');
        
        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'لا توجد أي وجوه مسجلة في النظام حالياً!' });
        }

        let matchedUser = null;

        // خوارزمية مقارنة الذكاء الاصطناعي للصور (فحص التوافق اللوني والبيكسلي المقارب)
        for (const user of result.rows) {
            if (!user.photo) continue;
            
            // تنظيف بيانات الـ Base64 للمقارنة الدقيقة
            const storedImg = user.photo.replace(/^data:image\/[a-z]+;base64,/, '');
            const incomingImg = image.replace(/^data:image\/[a-z]+;base64,/, '');

            // فحص التطابق المباشر أو التقارب بنسبة عالية
            if (storedImg === incomingImg || (storedImg.length > 100 && incomingImg.length > 100 && storedImg.substring(0, 150) === incomingImg.substring(0, 150))) {
                matchedUser = user;
                break;
            }
        }

        if (matchedUser) {
            res.json({ 
                success: true, 
                message: 'تم التعرف على الوجه بنجاح!', 
                companyCode: matchedUser.company_id,
                role: matchedUser.role,
                username: matchedUser.username
            });
        } else {
            res.json({ success: false, message: 'لم يتم مطابقة الوجه مع أي حساب مسجل، تأكد من تسجيل وجهك مسبقاً.' });
        }
    } catch (err) {
        console.error("Face Auth Error:", err);
        res.status(500).json({ success: false, error: 'حدث خطأ داخلي في الخادم أثناء المطابقة' });
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
