const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد الوسيطات لدعم الملفات الكبيرة (مثل بصمة الوجه Base64)
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(cors());

// قاعدة بيانات مؤقتة للتشغيل الفوري (يمكن ربطها بقاعدة بيانات لاحقاً)
global.db = {
    users: [],
    attendance: [],
    requests: []
};

// 1. ربط الملفات الثابتة للمجلدات
app.use(express.static(path.join(__dirname, 'public')));
app.use('/app', express.static(path.join(__dirname, 'app')));

// 2. المسارات المباشرة لفتح صفحات الهاتف (من مجلد app)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'app', 'welcome.html'));
});

app.get('/welcome.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'app', 'welcome.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'app', 'login.html'));
});

app.get('/register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'app', 'register.html'));
});

app.get('/services.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'app', 'services.html'));
});

// 3. مسار لوحة تحكم المدير وسجل الحركات (من مجلد public)
app.get('/activate.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'activate.html'));
});

// 4. مسارات الـ API (التسجيل، تسجيل الدخول، وحفظ الطلبات)
app.post('/api/employees/register', (req, res) => {
    try {
        const userData = req.body;
        if (!userData.companyName || !userData.username) {
            return res.status(400).json({ success: false, message: 'اسم الشركة واسم المستخدم إجباريان' });
        }
        global.db.users.push(userData);
        res.status(200).json({ success: true, message: 'تم تسجيل المستخدم بنجاح' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'خطأ في السيرفر أثناء التسجيل' });
    }
});

app.post('/api/login', (req, res) => {
    try {
        const { identifier } = req.body;
        res.status(200).json({ success: true, message: 'تم تسجيل الدخول بنجاح', identifier });
    } catch (err) {
        res.status(500).json({ success: false, message: 'خطأ في تسجيل الدخول' });
    }
});

app.post('/api/attendance', (req, res) => {
    try {
        const attendanceData = req.body;
        global.db.attendance.push(attendanceData);
        res.status(200).json({ success: true, message: 'تم تسجيل الحضور بنجاح' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'خطأ في تسجيل الحضور' });
    }
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`Server is running successfully on port ${PORT}`);
});
