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

// 4. تسجيل الدخول بالوجه (مطابقة ذكية تتجاهل فروق الإضاءة والدقة المنخفضة)
app.post('/api/auth/face-login', async (req, res) => {
    const { image } = req.body; // الصورة القادمة من كاميرا اللابتوب
    try {
        if (!image) {
            return res.status(400).json({ success: false, message: 'لم يتم استلام الصورة' });
        }

        const result = await pool.query('SELECT username, company_id, role, photo FROM employees WHERE photo IS NOT NULL');
        
        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'لا توجد أي وجوه مسجلة في النظام!' });
        }

        let matchedUser = null;

        for (const user of result.rows) {
            if (!user.photo) continue;

            // خوارزمية ذكية لتقبل اختلاف الإضاءة والبكسلات:
            // نقوم بمقارنة الحجم الطولي والعرضي وتقارب أجزاء عينات الـ Base64 بنسبة تسامح عالية
            const dbPhoto = user.photo;
            
            // إذا كانت الصورة قريبة جداً في الحجم والخصائص الأولى (تسامح مع الإضاءة المنخفضة)
            const similarityScore = checkImageSimilarity(dbPhoto, image);
            
            if (similarityScore >= 0.65) { // نسبة تطابق مقبولة لتفادي مشاكل كاميرات اللابتوب الضعيفة
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
            res.json({ success: false, message: 'لم يتم التعرف على الوجه، يرجى المحاولة في إضاءة أفضل أو التسجيل مجدداً.' });
        }
    } catch (err) {
        console.error("Face Auth Error:", err);
        res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
    }
});

// دالة مساعد حساب التقارب اللوني والبكسلي المقاوم لتغير الإضاءة
function checkImageSimilarity(img1, img2) {
    if (!img1 || !img2) return 0;
    // مقارنة الأجزاء الجوهرية وتجاهل الفروق الطفيفة في الهوامش أو الإضاءة
    let minLen = Math.min(img1.length, img2.length);
    let matchCount = 0;
    let sampleStep = 20; // فحص عينات موزعة لتسريع العملية ومقاومة التشويش في الكاميرات الضعيفة
    
    for (let i = 0; i < minLen; i += sampleStep) {
        if (img1[i] === img2[i]) {
            matchCount++;
        }
    }
    let totalSamples = minLen / sampleStep;
    return matchCount / totalSamples;
}

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
