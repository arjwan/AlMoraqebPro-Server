const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware لتنظيم استقبال البيانات
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// السماح بقراءة الملفات الثابتة (مثل ملفات الـ HTML والـ CSS والـ JS من المجلد الحالي)
app.use(express.static(__dirname));

// مسارات ملفات وقواعد البيانات على الهارد دسك
const DATA_DIR = path.join(__dirname, 'data');
const COMPANIES_DIR = path.join(DATA_DIR, 'companies');
const MAIN_DB_PATH = path.join(DATA_DIR, 'almaqeb_pro.db');

// التأكد من وجود المجلدات عند تشغيل السيرفر
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(COMPANIES_DIR)) fs.mkdirSync(COMPANIES_DIR, { recursive: true });
if (!fs.existsSync(MAIN_DB_PATH)) {
    fs.writeFileSync(MAIN_DB_PATH, JSON.stringify({ companies: [] }, null, 2));
}

// 1. مسار جلب جميع الشركات المسجلة
app.get('/api/developer/companies', (req, res) => {
    try {
        const dbData = JSON.parse(fs.readFileSync(MAIN_DB_PATH, 'utf8'));
        res.json({ success: true, companies: dbData.companies || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في قراءة قاعدة البيانات الرئيسية' });
    }
});

// 2. مسار إنشاء شركة جديدة وحفظها على الهارد دسك
app.post('/api/developer/company/create', (req, res) => {
    try {
        const companyData = req.body;
        const companyId = companyData.companyId || companyData.id;

        if (!companyId) {
            return res.status(400).json({ success: false, message: 'معرف الشركة (ID) مطلوب!' });
        }

        // قراءة القاعدة الرئيسية
        let dbData = JSON.parse(fs.readFileSync(MAIN_DB_PATH, 'utf8'));
        
        // التحقق مما إذا كانت الشركة موجودة مسبقاً
        const existingIndex = dbData.companies.findIndex(c => (c.id === companyId || c.companyId === companyId));
        if (existingIndex !== -1) {
            dbData.companies[existingIndex] = companyData;
        } else {
            dbData.companies.push(companyData);
        }

        // حفظ التحديث في القاعدة الرئيسية
        fs.writeFileSync(MAIN_DB_PATH, JSON.stringify(dbData, null, 2));

        // إنشاء مجلد خاص وقاعدة بيانات فرعية لهذه الشركة على الهارد دسك
        const specificCompanyDir = path.join(COMPANIES_DIR, companyId);
        if (!fs.existsSync(specificCompanyDir)) {
            fs.mkdirSync(specificCompanyDir, { recursive: true });
        }
        
        const companyDbPath = path.join(specificCompanyDir, 'database.json');
        fs.writeFileSync(companyDbPath, JSON.stringify({
            info: companyData,
            employees: [],
            requests: [],
            attendance: [],
            settings: {}
        }, null, 2));

        res.json({ success: true, message: `تم تأسيس وحفظ شركة (${companyId}) وقاعدة بياناتها على الهارد دسك بنجاح!` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'حدث خطأ داخلي أثناء حفظ الشركة' });
    }
});

// توجيه صريح لصفحة الإدارة لتجنب مشاكل Cannot GET
app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل الآن بكفاءة على البورت: ${PORT}`);
});
