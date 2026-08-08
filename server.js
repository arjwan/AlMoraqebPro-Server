const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// المسارات الأساسية على الهارد دسك
const ROOT_DATA_DIR = path.join(__dirname, 'data');
const COMPANIES_DIR = path.join(ROOT_DATA_DIR, 'companies');
const MASTER_DB_PATH = path.join(__dirname, 'almaqeb_pro.db'); // القاعدة الأم الحالية

// تهيئة القاعدة الأم وقواعد الـ 10 شركات الفرعية
function initSystemWithTenDatabases() {
    if (!fs.existsSync(ROOT_DATA_DIR)) fs.mkdirSync(ROOT_DATA_DIR, { recursive: true });
    if (!fs.existsSync(COMPANIES_DIR)) fs.mkdirSync(COMPANIES_DIR, { recursive: true });

    // 1. تهيئة القاعدة الأم إذا لم تكن موجودة
    let masterData;
    if (fs.existsSync(MASTER_DB_PATH)) {
        try {
            masterData = JSON.parse(fs.readFileSync(MASTER_DB_PATH, 'utf8'));
        } catch (e) {
            masterData = { developer: "Mohammed Al-Obeidi", companies: [] };
        }
    } else {
        masterData = { developer: "Mohammed Al-Obeidi", companies: [] };
    }

    // 2. إنشاء 10 قواعد بيانات فرعية برموز قابلة للتغيير إذا لم تكن موجودة
    const defaultCompanies = [
        { id: "ARJ-307", name: "شركة الأرجوان" },
        { id: "COMP-001", name: "الشركة الفرعية الأولى" },
        { id: "COMP-002", name: "الشركة الفرعية الثانية" },
        { id: "COMP-003", name: "الشركة الفرعية الثالثة" },
        { id: "COMP-004", name: "الشركة الفرعية الرابعة" },
        { id: "COMP-005", name: "الشركة الفرعية الخامسة" },
        { id: "COMP-006", name: "الشركة الفرعية السادسة" },
        { id: "COMP-007", name: "الشركة الفرعية السابعة" },
        { id: "COMP-008", name: "الشركة الفرعية الثامنة" },
        { id: "COMP-009", name: "الشركة الفرعية التاسعة" },
        { id: "COMP-010", name: "الشركة الفرعية العاشرة" }
    ];

    defaultCompanies.forEach(comp => {
        const compDir = path.join(COMPANIES_DIR, comp.id);
        const compDbFile = path.join(compDir, 'database.json');

        if (!fs.existsSync(compDir)) {
            fs.mkdirSync(compDir, { recursive: true });
            fs.mkdirSync(path.join(compDir, 'uploads'), { recursive: true });
        }

        if (!fs.existsSync(compDbFile)) {
            const initialData = {
                companyId: comp.id,
                companyName: comp.name,
                employees: [],
                branches: [],
                shifts: [],
                settings: {}
            };
            fs.writeFileSync(compDbFile, JSON.stringify(initialData, null, 2), 'utf8');
        }

        // تسجيلها في القاعدة الأم إن لم تكن مسجلة
        if (!masterData.companies.some(c => c.companyId === comp.id)) {
            masterData.companies.push({
                companyId: comp.id,
                companyName: comp.name,
                status: "active",
                createdAt: new Date().toISOString(),
                dbPath: compDbFile
            });
        }
    });

    // حفظ القاعدة الأم
    fs.writeFileSync(MASTER_DB_PATH, JSON.stringify(masterData, null, 2), 'utf8');
    console.log("تم اعتماد القاعدة الأم وإنشاء الـ 10 قواعد الفرعية بنجاح على الهارد دسك.");
}

// تشغيل التهيئة عند بدء السيرفر
initSystemWithTenDatabases();

// --- مسارات الـ API لإدارة الشركات والقواعد من لوحة المطور ---

// جلب كافة الشركات وقواعدها
app.get('/api/developer/companies', (req, res) => {
    try {
        const masterData = JSON.parse(fs.readFileSync(MASTER_DB_PATH, 'utf8'));
        res.json({ success: true, companies: masterData.companies });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// تعديل رمز أو اسم الشركة (قابل للتغيير)
app.put('/api/developer/company/update', (req, res) => {
    const { oldCompanyId, newCompanyId, newCompanyName } = req.body;
    try {
        const masterData = JSON.parse(fs.readFileSync(MASTER_DB_PATH, 'utf8'));
        const company = masterData.companies.find(c => c.companyId === oldCompanyId);

        if (!company) {
            return res.status(404).json({ success: false, message: "الشركة غير موجودة." });
        }

        // تحديث البيانات والرمز على الهارد دسك إذا تم تغييره
        if (newCompanyId && newCompanyId !== oldCompanyId) {
            const oldDir = path.join(COMPANIES_DIR, oldCompanyId);
            const newDir = path.join(COMPANIES_DIR, newCompanyId);
            if (fs.existsSync(oldDir)) {
                fs.renameSync(oldDir, newDir);
            }
            company.companyId = newCompanyId;
            company.dbPath = path.join(newDir, 'database.json');
        }

        if (newCompanyName) {
            company.companyName = newCompanyName;
        }

        fs.writeFileSync(MASTER_DB_PATH, JSON.stringify(masterData, null, 2), 'utf8');
        res.json({ success: true, message: "تم تحديث بيانات الشركة والرمز بنجاح." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// تشغيل أو إيقاف شركة
app.put('/api/developer/company/status', (req, res) => {
    const { companyId, status } = req.body; // 'active' أو 'suspended'
    try {
        const masterData = JSON.parse(fs.readFileSync(MASTER_DB_PATH, 'utf8'));
        const company = masterData.companies.find(c => c.companyId === companyId);
        if (!company) return res.status(404).json({ success: false, message: "الشركة غير موجودة." });

        company.status = status;
        fs.writeFileSync(MASTER_DB_PATH, JSON.stringify(masterData, null, 2), 'utf8');
        res.json({ success: true, message: `تم تغيير حالة الشركة ${companyId} إلى (${status}).` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`الخادم يعمل على المنفذ: ${PORT}`);
});
