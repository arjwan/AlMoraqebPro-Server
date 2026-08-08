const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// إعدادات Middleware
app.use(cors());
app.use(express.json());

// 1. جعل مجلد public متاحاً للمتصفح (يحتوي على index.html والصور وملفات CSS)
app.use(express.static(path.join(__dirname, 'public')));

// 2. الاتصال بقاعدة البيانات باستخدام المتغير الآمن من Render
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ تم الاتصال بقاعدة البيانات بنجاح'))
  .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));

// 3. تعريف نموذج بيانات الشركات
const CompanySchema = new mongoose.Schema({
    companyId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    phone: String,
    address: String
}, { timestamps: true });

const Company = mongoose.model('Company', CompanySchema);

// 4. مسار الصفحة الرئيسية (يفتح index.html تلقائياً)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 5. مسار الـ API لجلب الشركات
app.get('/api/developer/companies', async (req, res) => {
    try {
        const companies = await Company.find();
        res.json(companies);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch data" });
    }
});

// 6. مسار الـ API لحفظ البيانات
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

// 7. تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
