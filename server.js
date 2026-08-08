const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// إعدادات Middleware
app.use(cors());
app.use(express.json());

// 1. جعل مجلد public متاحاً للمتصفح
app.use(express.static(path.join(__dirname, 'public')));

// 2. الاتصال بقاعدة البيانات باستخدام المتغير الآمن من Render
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ تم الاتصال بقاعدة البيانات بنجاح'))
  .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));

// 3. تعريف نموذج بيانات الشركات بمرونة كاملة
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

// 4. مسار الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 5. مسار جلب الشركات
app.get('/api/developer/companies', async (req, res) => {
    try {
        const companies = await Company.find();
        res.json(companies);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch data" });
    }
});

// 6. مسار حفظ أو تحديث الشركة بحرية تامة
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

// 7. مسار تسجيل الدخول المباشر (يتحقق من البيانات المخزنة في قاعدة البيانات فقط دون أي شروط مسبقة)
app.post('/api/auth/login', async (req, res) => {
    const { companyId, username, password } = req.body;
    try {
        const company = await Company.findOne({ companyId });
        
        if (!company) {
            return res.status(404).json({ success: false, message: "رمز الشركة غير موجود" });
        }

        // مطابقة مرنة للبيانات التي أدخلتها أنت يدوياً
        if (company.username === username && company.password === password) {
            return res.json({ success: true, message: "تم تسجيل الدخول بنجاح", company });
        } else {
            return res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: "Server error" });
    }
});

// 8. تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
