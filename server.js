const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// مسار تخزين قاعدة البيانات والمجلدات
const DATA_DIR = path.join(__dirname, 'data');
const COMPANIES_DIR = path.join(DATA_DIR, 'companies');
const DB_PATH = path.join(DATA_DIR, 'almaqeb_pro.db');

// التأكد من وجود مجلدات التخزين عند بدء التشغيل
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(COMPANIES_DIR)) fs.mkdirSync(COMPANIES_DIR, { recursive: true });
if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ companies: [] }, null, 2));
}

// 1. مسار جلب قائمة الشركات المسجلة
app.get('/api/developer/companies', (req, res) => {
    try {
        const dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        res.json({ success: true, companies: dbData.companies || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في قراءة قاعدة البيانات: ' + error.message });
    }
});

// 2. مسار إنشاء وتسجيل شركة جديدة وربطها برمز القاعدة والمجلدات
app.post('/api/developer/company/create', (req, res) => {
    try {
        const newComp = req.body;
        const compId = newComp.companyId || newComp.id;

        if (!compId) {
            return.status(400).json({ success: false, message: 'رمز الشركة (المعرف) مطلوب!' });
        }

        let dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        
        // التحقق من عدم تكرار المعرف
        const existingIndex = dbData.companies.findIndex(c => (c.companyId || c.id) === compId);
        if (existingIndex !== -1) {
            return.status(400).json({ success: false, message: 'رمز الشركة موجود مسبقاً في النظام!' });
        }

        // إنشاء مجلد خاص بالشركة على الهارد دسك باستخدام رمز القاعدة الخاص بها
        const compFolder = path.join(COMPANIES_DIR, compId);
        if (!fs.existsSync(compFolder)) {
            fs.mkdirSync(compFolder, { recursive: true });
        }

        // إضافة الشركة للقاعدة
        dbData.companies.push(newComp);
        fs.writeFileSync(DB_PATH, JSON.stringify(dbData, null, 2));

        res.json({ success: true, message: '✨ تم تأسيس الشركة وربطها بالهارد دسك بنجاح!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في السيرفر أثناء إنشاء الشركة: ' + error.message });
    }
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بكفاءة على المنفذ: ${PORT}`);
});
