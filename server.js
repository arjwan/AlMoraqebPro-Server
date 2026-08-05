const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(express.json());
app.use(cors());

// مسار ملف تخزين الشركات محلياً على السيرفر
const DATA_FILE = path.join(__dirname, 'companies.json');

// دالة لقراءة الشركات من الملف
function readCompanies() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
        }
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("Error reading companies file:", err);
        return [];
    }
}

// دالة لحفظ الشركات في الملف
function saveCompanies(companies) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(companies, null, 2));
    } catch (err) {
        console.error("Error saving companies file:", err);
    }
}

// حماية صفحة الأدمن والتحقق من وجود معرف الشركة
function verifyAdminAccess(req, res, next) {
    const companyId = req.query.company;
    
    if (!companyId) {
        return res.status(403).send("<h1>403 Forbidden</h1><p>غير مسموح بالوصول المباشر لهذه الصفحة. يرجى إنشاء الشركة أو التفعيل أولاً.</p>");
    }

    // السماح للحساب العام مباشرة
    if (companyId === 'default_company') {
        return next();
    }

    const companies = readCompanies();
    const company = companies.find(c => c.company_id === companyId);
    
    if (!company) {
        return res.status(403).send("<h1>403 Forbidden</h1><p>معرف الشركة غير صالح أو غير مسجل في النظام.</p>");
    }

    if (company.status === 'stopped') {
        return res.status(403).send("<h1>403 Forbidden</h1><p>عذراً، هذا الحساب متوقف مؤقتاً من قبل الإدارة.</p>");
    }

    next();
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin-register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-register.html'));
});

app.get('/create-company.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'create-company.html'));
});

app.get('/company-register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'company-register.html'));
});

app.get('/admin.html', verifyAdminAccess, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/status', (req, res) => {
    res.json({ success: true, message: 'AlMoraqeb Pro Server & Local JSON Database are running perfectly!' });
});

app.get('/company-activate.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'company-activate.html'));
});

// ==================== مسار تسجيل الدخول (عبر ملف JSON) ====================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }

    const inputVal = username.trim().toLowerCase();

    // 1. التحقق من الحساب العام الافتراضي
    if (inputVal === 'admin' && password === 'admin123') {
        return res.json({ 
            success: true, 
            role: 'admin', 
            companyId: 'default_company',
            redirectUrl: '/admin.html?company=default_company' 
        });
    }

    // 2. البحث عن الشركة في الملف المحلي
    const companies = readCompanies();
    const company = companies.find(c => 
        (c.company_id && c.company_id.toLowerCase() === inputVal) || 
        (c.username && c.username.toLowerCase() === inputVal) || 
        (c.email && c.email.toLowerCase() === inputVal)
    );

    if (!company) {
        return res.status(400).json({ success: false, message: 'بيانات الدخول غير صحيحة، لم يتم العثور على الحساب' });
    }

    // التحقق من حالة الحساب
    if (company.status === 'stopped') {
        return res.status(403).json({ success: false, message: 'عذراً، هذا الحساب متوقف مؤقتاً من قبل الإدارة.' });
    }

    // التحقق من كلمة المرور
    if (company.password && company.password !== password) {
        return res.status(400).json({ success: false, message: 'كلمة المرور غير صحيحة' });
    }

    res.json({ 
        success: true, 
        role: 'company', 
        companyId: company.company_id,
        redirectUrl: `/admin.html?company=${company.company_id}`,
        message: 'تم تسجيل الدخول بنجاح' 
    });
});

// مسار جلب معلومات الشركة لعرض اسمها في لوحة التحكم
app.get('/api/companies/info', (req, res) => {
    const companyId = req.query.company;
    if (!companyId) {
        return res.status(400).json({ success: false, message: 'معرف الشركة مفقود' });
    }

    if (companyId === 'default_company') {
        return res.json({ 
            success: true, 
            company: { company_name: 'الحساب العام الافتراضي', company_id: 'default_company' } 
        });
    }

    const companies = readCompanies();
    const company = companies.find(c => c.company_id === companyId);
    
    if (!company) {
        return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
    }

    res.json({ success: true, company });
});

// مسار استقبال بيانات إنشاء الشركة وحفظها في ملف JSON
app.post('/api/companies/register', (req, res) => {
    const { companyName, companyIdInput, username, email, password, branch, province, address, baseSalary } = req.body;
    
    if (!companyName) {
        return res.status(400).json({ success: false, message: 'اسم الشركة مطلوب' });
    }

    try {
        const sanitizedName = companyName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const companyId = companyIdInput ? companyIdInput.trim() : `${sanitizedName}_${Math.floor(Math.random() * 9000) + 1000}`;
        const companyPassword = password || '123456';

        const companies = readCompanies();

        // التأكد من عدم تكرار معرف الشركة
        if (companies.some(c => c.company_id === companyId)) {
            return res.status(400).json({ success: false, message: 'معرف الشركة مستخدم مسبقاً، ي اختيار معرف آخر' });
        }

        const newCompany = {
            id: Date.now(),
            company_id: companyId,
            company_name: companyName,
            username: username || '',
            email: email || '',
            password: companyPassword,
            branch: branch || '',
            province: province || '',
            address: address || '',
            base_salary: baseSalary || 0,
            status: 'active',
            created_at: new Date().toISOString()
        };

        companies.push(newCompany);
        saveCompanies(companies);

        res.json({
            success: true,
            message: 'تم حفظ وتفعيل حساب الشركة بنجاح',
            companyId: newCompany.company_id,
            customUrl: `https://almoraqebpro-server.onrender.com/admin.html?company=${newCompany.company_id}`
        });

    } catch (err) {
        console.error("Save Company Error:", err);
        res.status(500).json({ success: false, message: 'حدث خطأ أثناء حفظ الشركة', error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
