const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// توجيه مسار الملفات الثابتة لمجلد public الأساسي
app.use(express.static(path.join(__dirname, 'public')));

// مسار تخزين قاعدة البيانات والمجلدات
const DATA_DIR = path.join(__dirname, 'data');
const COMPANIES_DIR = path.join(DATA_DIR, 'companies');
const DB_PATH = path.join(DATA_DIR, 'almaqeb_pro.db');

// --- دالة التأسيس والتحقق التلقائي للشركات العشر ---
function initializeSystem() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(COMPANIES_DIR)) fs.mkdirSync(COMPANIES_DIR, { recursive: true });

    const initialCompanies = [
        { companyName: 'الأرجوان للبرمجيات', name: 'الأرجوان للبرمجيات', companyId: 'arjwan' },
        { companyName: 'البغدادي للخدمات التقنية', name: 'البغدادي للخدمات التقنية', companyId: 'albaghdadi' },
        { companyName: 'آفاق للتجارة العامة', name: 'آفاق للتجارة العامة', companyId: 'afaqpro' },
        { companyName: 'النخبة للحلول الذكية', name: 'النخبة للحلول الذكية', companyId: 'nukhbapros' },
        { companyName: 'مسارات للنقل واللوجستيك', name: 'مسارات للنقل واللوجستيك', companyId: 'masaratlog' },
        { companyName: 'البناء الحديث للهندسة', name: 'البناء الحديث للهندسة', companyId: 'modernbuild' },
        { companyName: 'المشرق للاستشارات', name: 'المشرق للاستشارات', companyId: 'almashreq' },
        { companyName: 'رويال للخدمات العقارية', name: 'رويال للخدمات العقارية', companyId: 'royalreal' },
        { companyName: 'القمة للأنظمة الأمنية', name: 'القمة للأنظمة الأمنية', companyId: 'alqimasec' },
        { companyName: 'الوفاق للصناعات الغذائية', name: 'الوفاق للصناعات الغذائية', companyId: 'alwifaqfood' }
    ];

    let dbData = { companies: [] };

    if (fs.existsSync(DB_PATH)) {
        try {
            dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        } catch (e) {
            dbData = { companies: [] };
        }
    }

    initialCompanies.forEach(comp => {
        // التأكد من وجود مجلد خاص بكل شركة داخل مجلد companies على الهارد دسك
        const dir = path.join(COMPANIES_DIR, comp.companyId);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // إضافة الشركة للقاعدة إذا لم تكن مسجلة مسبقاً
        const existing = dbData.companies.find(c => (c.companyId || c.id) === comp.companyId);
        if (!existing) {
            dbData.companies.push({
                ...comp,
                username: 'admin',
                password: 'admin123',
                createdAt: new Date().toISOString()
            });
        } else {
            // تحديث الاسم لضمان عدم ظهور undefined
            existing.companyName = comp.companyName;
            existing.name = comp.name;
        }
    });

    fs.writeFileSync(DB_PATH, JSON.stringify(dbData, null, 2));
    console.log("✅ تم التحقق من سلامة قاعدة البيانات وتحديث الشركات العشر ومجلداتها على الهارد دسك.");
}

// تشغيل النظام
initializeSystem();

// مسار العميل الرئيسي
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// مسار لوحة تحكم المطور
app.get('/developer', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'create-company.html'));
});

// مسار جلب قائمة الشركات المسجلة من الهارد دسك
app.get('/api/developer/companies', (req, res) => {
    try {
        if (!fs.existsSync(DB_PATH)) {
            return res.json({ success: true, companies: [] });
        }
        const dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        res.json({ success: true, companies: dbData.companies || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في قراءة قاعدة البيانات: ' + error.message });
    }
});

// مسار إنشاء وتسجيل شركة جديدة وتحديث بياناتها وحفظها على الهارد دسك
app.post('/api/developer/company/create', (req, res) => {
    try {
        const newComp = req.body;
        const compId = newComp.companyId || newComp.id;

        if (!compId) {
            return res.status(400).json({ success: false, message: 'رمز الشركة (المعرف) مطلوب!' });
        }

        let dbData = { companies: [] };
        if (fs.existsSync(DB_PATH)) {
            try {
                dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
            } catch (e) {
                dbData = { companies: [] };
            }
        }
        
        // التعامل في حال تم تغيير رمز الشركة (ID) القديم برمز جديد
        if (newComp.oldCompanyId && newComp.oldCompanyId !== compId) {
            dbData.companies = dbData.companies.filter(c => (c.companyId || c.id) !== newComp.oldCompanyId);
            const oldFolder = path.join(COMPANIES_DIR, newComp.oldCompanyId);
            if (fs.existsSync(oldFolder)) {
                // نقل أو ترك المجلد القديم، وإنشاء الجديد
            }
        }

        const existingIndex = dbData.companies.findIndex(c => (c.companyId || c.id) === compId);
        
        // إنشاء مجلد خاص بالشركة على الهارد دسك ضمن مسار companies
        const compFolder = path.join(COMPANIES_DIR, compId);
        if (!fs.existsSync(compFolder)) {
            fs.mkdirSync(compFolder, { recursive: true });
        }

        if (existingIndex !== -1) {
            // تحديث الشركة إذا كانت موجودة مسبقاً
            dbData.companies[existingIndex] = { ...dbData.companies[existingIndex], ...newComp };
        } else {
            // إضافة شركة جديدة
            dbData.companies.push(newComp);
        }

        // حفظ البيانات نهائياً في ملف قاعدة البيانات المركزي على الهارد دسك
        fs.writeFileSync(DB_PATH, JSON.stringify(dbData, null, 2));

        res.json({ success: true, message: '✨ تم حفظ وتحديث بيانات الشركة ومجلداتها على الهارد دسك بنجاح!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في السيرفر أثناء الحفظ على الهارد دسك: ' + error.message });
    }
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بكفاءة على المنفذ: ${PORT}`);
});
