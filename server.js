const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// الرابط الافتراضي لقاعدة بيانات MongoDB (يمكن تغليفه بمتغير بيئي لاحقاً)
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/almoraqebpro";

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// إتاحة مجلد الملفات والرفع والصور للعام
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 1. تعريف نماذج قاعدة البيانات (Mongoose Schemas)
// ==========================================

// نموذج الشركة
const companySchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const Company = mongoose.model('Company', companySchema);

// نموذج الموظف (تمت إضافة حقل السلف والاستقطاعات)
const employeeSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    companyName: { type: String },
    name: { type: String, required: true },
    email: { type: String },
    salary: { type: Number },
    specialty: { type: String },
    workplace: { type: String },
    username: { type: String, required: true },
    password: { type: String, required: true },
    photoUrl: { type: String },
    location: { type: String },
    createdAt: { type: Date, default: Date.now },
    // إضافة مصفوفة السلف النشطة والمرتبطة بالموظف
    loans: [{
        loanAmount: Number,
        monthlyInstallment: Number,
        remainingAmount: Number,
        startDate: { type: Date, default: Date.now }
    }]
});
const Employee = mongoose.model('Employee', employeeSchema);

// ==========================================
// 2. إعداد Multer لرفع الصور والملفات
// ==========================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB كحد أقصى للصورة
});

// ==========================================
// 3. المسارات البرمجية (API Endpoints)
// ==========================================

// مسار فحص الاتصال (Ping)
app.get('/api/ping', (req, res) => {
    res.status(200).json({ status: 'connected', message: 'السيرفر يعمل بكفاءة ومتصل بنجاح' });
});

// تسجيل شركة جديدة
app.post('/api/companies/register', async (req, res) => {
    try {
        const { id, name, email, phone } = req.body;
        let existingCompany = await Company.findOne({ id });
        if (existingCompany) {
            return res.status(200).json({ success: true, message: 'الشركة مسجلة مسبقاً', company: existingCompany });
        }
        const newCompany = new Company({ id, name, email, phone });
        await newCompany.save();
        res.status(201).json({ success: true, message: 'تم تسجيل الشركة بنجاح في قاعدة البيانات', company: newCompany });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// جلب قائمة الشركات
app.get('/api/companies', async (req, res) => {
    try {
        const companies = await Company.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, companies });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// تسجيل موظف جديد مع رفع صورة بصمة الوجه
app.post('/api/employee/register', upload.single('photo'), async (req, res) => {
    try {
        const photoPath = req.file ? `/uploads/${req.file.filename}` : (req.body.photo || '');
        
        const newEmployee = new Employee({
            companyId: req.body.companyId,
            companyName: req.body.companyName,
            name: req.body.name,
            email: req.body.email,
            salary: req.body.salary,
            specialty: req.body.specialty,
            workplace: req.body.workplace,
            username: req.body.username,
            password: req.body.password,
            photoUrl: photoPath,
            location: req.body.location,
            loans: []
        });

        await newEmployee.save();
        res.status(201).json({ success: true, message: 'تم تسجيل الموظف وحفظه في السيرفر وقاعدة البيانات بنجاح', employee: newEmployee });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// جلب موظفي شركة معينة مع دعم التقسيم (Pagination) لآلاف الموظفين
app.get('/api/employees/:companyId', async (req, res) => {
    try {
        const { companyId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50; // جلب 50 موظفاً كدفعة افتراضية لضمان السرعة

        const employees = await Employee.find({ companyId })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await Employee.countDocuments({ companyId });

        res.status(200).json({
            success: true,
            total,
            page,
            pages: Math.ceil(total / limit),
            employees
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// مسارات السلف والاستقطاعات الجديدة (مدمجة بأمان)
// ==========================================

// إضافة سلفة جديدة للموظف وتحديد القسط
app.post('/api/employees/:employeeId/loan', async (req, res) => {
    try {
        const { loanAmount, monthlyInstallment } = req.body;
        const employee = await Employee.findById(req.params.employeeId);
        
        if (!employee) {
            return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
        }

        employee.loans.push({
            loanAmount: parseFloat(loanAmount),
            monthlyInstallment: parseFloat(monthlyInstallment),
            remainingAmount: parseFloat(loanAmount)
        });

        await employee.save();
        res.status(200).json({ success: true, message: 'تم إضافة السلفة بنجاح وتحديث حسابات الموظف', employee });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// حساب إجمالي الاستقطاعات الشهرية للسلف الخاصة بالموظف (لتحديث الرواتب)
app.get('/api/employees/:employeeId/loan-deduction', async (req, res) => {
    try {
        const employee = await Employee.findById(req.params.employeeId);
        if (!employee) {
            return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
        }

        let totalMonthlyDeduction = 0;
        if (employee.loans && employee.loans.length > 0) {
            employee.loans.forEach(loan => {
                if (loan.remainingAmount > 0) {
                    totalMonthlyDeduction += loan.monthlyInstallment;
                }
            });
        }

        res.status(200).json({ success: true, employeeId: employee._id, totalMonthlyDeduction });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 4. الاتصال بقاعدة البيانات وتشغيل السيرفر
// ==========================================
mongoose.connect(MONGO_URI)
.then(() => {
    console.log('✅ تم الاتصال بقاعدة بيانات MongoDB بنجاح واستقرار تام');
    app.listen(PORT, () => {
        console.log(`🚀 السيرفر يعمل الآن على المنفذ: ${PORT}`);
    });
})
.catch(err => {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
});
