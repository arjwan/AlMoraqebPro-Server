const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// إعدادات Middleware
app.use(cors());
app.use(express.json());

// جعل مجلد public متاحاً للمتصفح بالكامل
app.use(express.static(path.join(__dirname, 'public')));

// الاتصال بقاعدة البيانات باستخدام المتغير الآمن من Render
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ تم الاتصال بقاعدة البيانات بنجاح'))
  .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));

// تعريف نموذج بيانات الشركات بمرونة تامة
const CompanySchema = new mongoose.Schema({
    companyId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    phone: String,
    address: String,
    username: String,
    password: String,
    status: { type: String, default: 'active' }
}, { timestamps: true });

const Company = mongoose.model('Company', CompanySchema);

// تعريف نموذج بيانات الموظفين
const EmployeeSchema = new mongoose.Schema({
    companyId: { type: String, required: true },
    name: { type: String, required: true },
    email: String,
    specialty: String,
    workplace: String,
    username: String,
    password: String,
    deviceId: String,
    location: Object,
    photo: String
}, { timestamps: true });

const Employee = mongoose.model('Employee', EmployeeSchema);

// مسار فحص الاتصال (خاص بمؤشر الدائرة الخضراء/الحمراء)
app.get('/api/ping', (req, res) => {
    res.status(200).json({ status: 'online', message: 'Server is running' });
});

// مسار الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// مسار جلب الشركات
app.get('/api/developer/companies', async (req, res) => {
    try {
        const companies = await Company.find();
        res.json(companies);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch data" });
    }
});

// مسار حفظ أو تحديث الشركة
app.post('/api/developer/company/create', async (req, res) => {
    const newCompany = req.body;
    try {
        await Company.findOneAndUpdate(
            { companyId: newCompany.companyId },
            newCompany,
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.json({ success: true, message: "تم الحفظ بنجاح" });
    } catch (error) {
        res.status(500).json({ error: "Failed to save data" });
    }
});

// مسار تسجيل الموظف الجديد
app.post('/api/employee/register', async (req, res) => {
    try {
        const empData = req.body;
        const newEmployee = new Employee(empData);
        await newEmployee.save();
        res.status(200).json({ success: true, message: "تم تسجيل الموظف بنجاح" });
    } catch (error) {
        console.error("خطأ في تسجيل الموظف:", error);
        res.status(500).json({ success: false, message: "فشل حفظ بيانات الموظف في السيرفر" });
    }
});

// مسار تسجيل دخول الموظفين
app.post('/api/employee/login', async (req, res) => {
    const { companyId, username, password } = req.body;
    try {
        const employee = await Employee.findOne({ companyId, username, password });
        if (employee) {
            return res.json({ success: true, employeeName: employee.name });
        } else {
            return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
});

// مسار تسجيل الدخول للشركات
app.post('/api/auth/login', async (req, res) => {
    const { companyId, phone, username, password } = req.body;
    try {
        const company = await Company.findOne({ companyId });
        
        if (!company) {
            return res.status(404).json({ success: false, message: "رمز الشركة غير موجود في قاعدة البيانات" });
        }

        if (company.status === 'stopped') {
            return res.status(403).json({ success: false, message: "حساب الشركة متوقف مؤقتاً" });
        }

        const isPhoneMatch = phone && company.phone === phone;
        const isCredentialMatch = username && password && company.username === username && company.password === password;

        if (isPhoneMatch || isCredentialMatch) {
            return res.json({ success: true, message: "تم تسجيل الدخول بنجاح", company });
        } else {
            return res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: "Server error" });
    }
});

// مسار أخذ نسخة احتياطية (Backup) الشامل
app.get('/api/admin/backup', async (req, res) => {
    try {
        const companies = await Company.find({});
        const employees = await Employee.find({});
        
        const backupData = {
            exportDate: new Date().toISOString(),
            system: "AlMoraqebPro",
            data: { companies, employees }
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=AlMoraqebPro-Backup-${Date.now()}.json`);
        res.status(200).send(JSON.stringify(backupData, null, 2));
    } catch (error) {
        res.status(500).json({ success: false, message: "فشل إنشاء النسخة الاحتياطية من السيرفر" });
    }
});

// قاعدة توجيه عامة (Catch-all Fallback) لأي ملف HTML
app.get('/:page', (req, res, next) => {
    const pageFile = req.params.page;
    if (pageFile.startsWith('api/')) {
        return next();
    }
    const targetPath = path.join(__dirname, 'public', pageFile.endsWith('.html') ? pageFile : `${pageFile}.html`);
    res.sendFile(targetPath, (err) => {
        if (err) {
            res.status(404).send('الصفحة غير موجودة');
        }
    });
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
