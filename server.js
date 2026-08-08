const express = require('express');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// مسارات الهارد دسك
const DATA_DIR = path.join(__dirname, 'data');

// --- خطوة التنظيف الجذري بناءً على رغبتك (حذف القديم بالكامل لبيئة نظيفة) ---
if (fs.existsSync(DATA_DIR)) {
    try {
        fs.rmSync(DATA_DIR, { recursive: true, force: true });
        console.log("🧹 تم مسح جميع البيانات والمجلدات القديمة بالكامل بنجاح.");
    } catch (err) {
        console.error("خطأ أثناء تنظيف الملفات القديمة:", err);
    }
}

// إعادة إنشاء مجلد data نظيف وخالٍ من أي مخلفات
fs.mkdirSync(DATA_DIR, { recursive: true });

// --- دالة إنشاء قاعدة بيانات حقيقية ومستقلة لكل شركة جديدة ---
function createCompanyDatabase(companyId) {
    const compDir = path.join(DATA_DIR, companyId);
    if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });
    
    const dbPath = path.join(compDir, 'company.db');
    const db = new sqlite3.Database(dbPath);
    
    db.serialize(() => {
        db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, password TEXT, role TEXT)");
        db.run("INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin')");
    });
    db.close();
    return dbPath;
}

// مسار تسجيل شركة جديدة وحفظها حقيقياً على الهارد دسك
app.post('/api/developer/company/create', (req, res) => {
    const { companyId, companyName, manager, phone, email, username, password } = req.body;
    
    if (!companyId) return res.status(400).json({ success: false, message: "رمز الشركة مطلوب" });

    // 1. إنشاء المجلد وقاعدة البيانات SQLite
    createCompanyDatabase(companyId);
    
    // 2. حفظ ملف المعلومات الثابت info.json داخل مجلد الشركة
    const infoPath = path.join(DATA_DIR, companyId, 'info.json');
    fs.writeFileSync(infoPath, JSON.stringify({ companyId, companyName, manager, phone, email, username, password }, null, 2));

    res.json({ success: true, message: "تم بناء كيان الشركة وقاعدتها ومجلدها على الهارد دسك بنجاح." });
});

// مسار جلب الشركات الحقيقية من الهارد دسك فقط
app.get('/api/developer/companies', (req, res) => {
    const companies = [];
    if (!fs.existsSync(DATA_DIR)) return res.json({ success: true, companies: [] });

    const dirs = fs.readdirSync(DATA_DIR);
    
    dirs.forEach(dir => {
        const infoPath = path.join(DATA_DIR, dir, 'info.json');
        if (fs.existsSync(infoPath)) {
            try {
                companies.push(JSON.parse(fs.readFileSync(infoPath, 'utf8')));
            } catch (e) {
                // تجاهل الملفات التالفة إن وجدت
            }
        }
    });
    
    res.json({ success: true, companies });
});

// المسارات الأساسية للواجهات
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/developer', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'create-company.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل بقواعد بيانات حقيقية على المنفذ ${PORT}`));
