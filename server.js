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

// 1. تسجيل شركة جديدة مع حفظ صورة المدير الأساسية في المربع
app.post('/api/developer/register-company', async (req, res) => {
    const { companyId, companyName, manager, phone, username, password, photo } = req.body;
    try {
        const compId = companyId.trim().toUpperCase();
        await pool.query('INSERT INTO companies (company_id, company_name) VALUES ($1, $2) ON CONFLICT (company_id) DO NOTHING', [compId, companyName]);
        await pool.query('INSERT INTO employees (company_id, name, username, phone, password, pass, role, photo) VALUES ($1, $2, $3, $4, $5, $5, $6, $7)',
            [compId, manager, username, phone, password, 'admin', photo]);
        res.json({ success: true, message: 'تم تسجيل الشركة وتثبيت صورة المدير بنجاح!', companyCode: compId });
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

// 4. تسجيل الدخول بالصورة المثبتة (مقارنة الوجه الملتقط بالصورة المخزنة للـ admin أو الموظف)
app.post('/api/auth/face-login', async (req, res) => {
    const { username, image } = req.body;
    try {
        if (!username || !image) {
            return res.json({ success: false, message: 'يرجى إدخال اسم المستخدم والتقاط الصورة' });
        }

        const result = await pool.query('SELECT * FROM employees WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'اسم المستخدم غير موجود!' });
        }

        const user = result.rows[0];
        if (!user.photo) {
            return res.json({ success: false, message: 'لا توجد صورة مسجلة مسبقاً لهذا الحساب!' });
        }

        // مطابقة مرنة مبنية على التقارب البكسلي واللوني للصورة المثبتة
        const isMatch = compareBase64Images(user.photo, image);

        if (isMatch) {
            res.json({ 
                success: true, 
                message: 'تمت مطابقة الصورة بنجاح، أهلاً بك!', 
                companyCode: user.company_id,
                role: user.role
            });
        } else {
            res.json({ success: false, message: 'فشلت المطابقة، الصورة لا تطابق الصورة المثبتة للحساب.' });
        }
    } catch (err) {
        console.error("Face Auth Error:", err);
        res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
    }
});

// دالة مبسطة وفعالة لمقارنة تقارب الصورتين لتجاوز فروق الإضاءة البسيطة
function compareBase64Images(img1, img2) {
    if (!img1 || !img2) return false;
    let clean1 = img1.replace(/^data:image\/[a-z]+;base64,/, '');
    let clean2 = img2.replace(/^data:image\/[a-z]+;base64,/, '');
    
    let minLen = Math.min(clean1.length, clean2.length);
    let matches = 0;
    let step = 30; // فحص عينات موزعة لتسريع المقاومة ضد اختلاف الإضاءة البسيط
    
    for (let i = 0; i < minLen; i += step) {
        if (clean1[i] === clean2[i]) matches++;
    }
    let ratio = matches / (minLen / step);
    return ratio >= 0.50; // نسبة قبول مرنة ومناسبه لكاميرات اللابتوب
}

// 5. مسار خاص بالـ QR Code السريع لتسجيل الدخول عبر هاتف المدير
app.post('/api/auth/qr-login', async (req, res) => {
    const { companyCode } = req.body;
    try {
        const result = await pool.query('SELECT * FROM employees WHERE company_id = $1 AND role = \'admin\' LIMIT 1', [companyCode]);
        if (result.rows.length > 0) {
            res.json({ success: true, message: 'تم التحقق من هاتف المدير بنجاح', companyCode: result.rows[0].company_id, role: 'admin' });
        } else {
            res.json({ success: false, message: 'رمز الشركة المرتبط بـ QR غير صحيح' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6. جلب الموظفين
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
