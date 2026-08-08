const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const COMPANIES_DIR = path.join(DATA_DIR, 'companies');
const DB_PATH = path.join(DATA_DIR, 'almaqeb_pro.db');

// --- دالة التأسيس التلقائي للشركات العشر ---
function initializeSystem() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(COMPANIES_DIR)) fs.mkdirSync(COMPANIES_DIR, { recursive: true });

    const initialCompanies = [
        { name: 'الأرجوان للبرمجيات', companyId: 'arjwan' },
        { name: 'البغدادي للخدمات التقنية', companyId: 'albaghdadi' },
        { name: 'آفاق للتجارة العامة', companyId: 'afaqpro' },
        { name: 'النخبة للحلول الذكية', companyId: 'nukhbapros' },
        { name: 'مسارات للنقل واللوجستيك', companyId: 'masaratlog' },
        { name: 'البناء الحديث للهندسة', companyId: 'modernbuild' },
        { name: 'المشرق للاستشارات', companyId: 'almashreq' },
        { name: 'رويال للخدمات العقارية', companyId: 'royalreal' },
        { name: 'القمة للأنظمة الأمنية', companyId: 'alqimasec' },
        { name: 'الوفاق للصناعات الغذائية', companyId: 'alwifaqfood' }
    ];

    let dbData = { companies: [] };

    // إذا كانت القاعدة موجودة، نقرأها، وإلا نبدأ من الصفر
    if (fs.existsSync(DB_PATH)) {
        dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }

    initialCompanies.forEach(comp => {
        // إنشاء المجلد إذا لم يكن موجوداً
        const dir = path.join(COMPANIES_DIR, comp.companyId);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // إضافة الشركة للقاعدة إذا لم تكن موجودة مسبقاً
        if (!dbData.companies.find(c => c.companyId === comp.companyId)) {
            dbData.companies.push({
                ...comp,
                username: 'admin',
                password: 'admin123',
                createdAt: new Date().toISOString()
            });
        }
    });

    fs.writeFileSync(DB_PATH, JSON.stringify(dbData, null, 2));
    console.log("✅ تم التحقق من سلامة قاعدة البيانات وتأسيس الشركات العشر.");
}

// تشغيل عملية التأسيس
initializeSystem();

// المسارات
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/developer', (req, res) => res.sendFile(path.join(__dirname, 'public', 'create-company.html')));

app.get('/api/developer/companies', (req, res) => {
    const dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    res.json({ success: true, companies: dbData.companies });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل بكفاءة على المنفذ: ${PORT}`));
