const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const DEVELOPER_PASSWORD = process.env.DEVELOPER_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET || DEVELOPER_PASSWORD;

if (!MONGO_URI) {
    console.error('❌ MONGO_URI is not configured. The server will not start without MongoDB.');
    process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads', { recursive: true });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

const companySchema = new mongoose.Schema({
    companyId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    adminUsername: { type: String, default: 'admin' },
    adminPasswordHash: { type: String, default: '' },
    subscription: { type: String, default: 'annual' },
    systemState: { type: String, enum: ['active', 'stopped', 'expired'], default: 'active' },
    subscriptionStartDate: Date,
    subscriptionEndDate: Date,
    createdAt: { type: Date, default: Date.now }
});
const Company = mongoose.model('Company', companySchema);

const employeeRequestSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    companyName: String,
    name: { type: String, required: true },
    jobTitle: String,
    workLocation: String,
    salary: Number,
    shift: String,
    workHours: Number,
    wageType: String,
    socialSecurity: String,
    location: String,
    username: String,
    password: String,
    status: { type: String, default: 'pending', index: true },
    createdAt: { type: Date, default: Date.now }
});
const EmployeeRequest = mongoose.model('EmployeeRequest', employeeRequestSchema);

const employeeSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    companyName: String,
    name: { type: String, required: true },
    email: String,
    salary: Number,
    specialty: String,
    workplace: String,
    username: { type: String, required: true },
    password: { type: String, required: true },
    deviceId: { type: String, default: '' },
    deviceBoundAt: Date,
    photoUrl: String,
    location: String,
    createdAt: { type: Date, default: Date.now },
    loans: [{
        loanAmount: Number,
        monthlyInstallment: Number,
        remainingAmount: Number,
        startDate: { type: Date, default: Date.now }
    }]
});
const Employee = mongoose.model('Employee', employeeSchema);

const attendanceSchema = new mongoose.Schema({
    employeeId: { type: String, required: true, index: true },
    companyId: { type: String, index: true },
    fingerprintToken: String,
    latitude: Number,
    longitude: Number,
    timestamp: { type: Date, default: Date.now },
    type: { type: String, default: 'attendance' }
});
const Attendance = mongoose.model('Attendance', attendanceSchema);

const serviceRequestSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    employeeId: { type: String, required: true, index: true },
    employeeName: { type: String, required: true },
    type: { type: String, enum: ['leave', 'loan'], required: true },
    reason: { type: String, default: '' },
    amount: Number,
    requestedDate: Date,
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    createdAt: { type: Date, default: Date.now }
});
const ServiceRequest = mongoose.model('ServiceRequest', serviceRequestSchema);

const notificationSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    employeeId: { type: String, required: true, index: true },
    type: { type: String, enum: ['text', 'voice'], required: true },
    message: { type: String, default: '' },
    audioUrl: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});
const Notification = mongoose.model('Notification', notificationSchema);

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
    if (!storedHash || !storedHash.includes(':')) return false;
    const [salt, expectedHash] = storedHash.split(':');
    const actualHash = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(expectedHash, 'hex'), Buffer.from(actualHash, 'hex'));
}

function createToken(payload) {
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
    const signature = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
    return `${body}.${signature}`;
}

function readToken(token) {
    if (!SESSION_SECRET || !token || !token.includes('.')) return null;
    const [body, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
        return payload.exp > Date.now() ? payload : null;
    } catch {
        return null;
    }
}

function requireDeveloper(req, res, next) {
    const token = readToken(req.headers.authorization?.replace(/^Bearer\s+/i, ''));
    if (!token || token.role !== 'developer') return res.status(401).json({ success: false, message: 'جلسة المطور غير صالحة' });
    req.session = token;
    next();
}

function requireAdmin(req, res, next) {
    const token = readToken(req.headers.authorization?.replace(/^Bearer\s+/i, ''));
    if (!token || token.role !== 'admin') return res.status(401).json({ success: false, message: 'جلسة المدير غير صالحة' });
    req.session = token;
    next();
}

function publicEmployee(employee) {
    const { password, ...safeEmployee } = employee.toObject ? employee.toObject() : employee;
    return safeEmployee;
}

function publicCompany(company) {
    const value = company.toObject ? company.toObject() : company;
    const { adminPasswordHash, ...safeCompany } = value;
    return safeCompany;
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.get('/api/ping', (req, res) => {
    res.status(200).json({ status: 'connected', database: 'mongodb', message: 'السيرفر يعمل ومتصل بنجاح' });
});

app.post('/api/developer/login', (req, res) => {
    if (!DEVELOPER_PASSWORD || !SESSION_SECRET) {
        return res.status(503).json({ success: false, message: 'لم تُضبط حماية لوحة المطور في إعدادات الخادم' });
    }
    const password = String(req.body.password || '');
    if (password !== DEVELOPER_PASSWORD) {
        return res.status(401).json({ success: false, message: 'كلمة مرور المطور غير صحيحة' });
    }
    res.json({ success: true, token: createToken({ role: 'developer' }) });
});

app.get('/api/developer/companies', requireDeveloper, async (req, res) => {
    try {
        const companies = await Company.find().sort({ createdAt: -1 }).lean();
        res.json({ success: true, companies: companies.map(publicCompany) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.patch('/api/developer/companies/:companyId', requireDeveloper, async (req, res) => {
    try {
        const allowed = ['name', 'email', 'phone', 'subscription', 'systemState', 'subscriptionStartDate', 'subscriptionEndDate', 'adminUsername'];
        const updates = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) updates[key] = typeof req.body[key] === 'string' ? req.body[key].trim() : req.body[key];
        }
        if (req.body.adminPassword) updates.adminPasswordHash = hashPassword(req.body.adminPassword);
        const company = await Company.findOneAndUpdate({ companyId: String(req.params.companyId).trim() }, updates, { new: true, runValidators: true });
        if (!company) return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
        res.json({ success: true, company: publicCompany(company) });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.delete('/api/developer/companies/:companyId', requireDeveloper, async (req, res) => {
    try {
        const companyId = String(req.params.companyId).trim();
        const company = await Company.findOneAndDelete({ companyId });
        if (!company) return res.status(404).json({ success: false, message: 'الشركة غير موجودة' });
        await Promise.all([Employee.deleteMany({ companyId }), EmployeeRequest.deleteMany({ companyId }), Attendance.deleteMany({ companyId })]);
        res.json({ success: true, message: 'تم حذف الشركة وبياناتها المرتبطة' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/login', async (req, res) => {
    try {
        const companyId = String(req.body.companyId || '').trim();
        const username = String(req.body.username || '').trim();
        const password = String(req.body.password || '');
        const company = await Company.findOne({ companyId });
        if (!company || company.systemState !== 'active') return res.status(401).json({ success: false, message: 'الشركة غير متاحة أو غير موجودة' });
        if (company.adminUsername !== username || !verifyPassword(password, company.adminPasswordHash)) {
            return res.status(401).json({ success: false, message: 'بيانات المدير غير صحيحة' });
        }
        res.json({ success: true, company: publicCompany(company), token: createToken({ role: 'admin', companyId }) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/admin/session', requireAdmin, (req, res) => {
    res.json({ success: true, companyId: req.session.companyId });
});

app.post('/api/companies/register', async (req, res) => {
    try {
        const canonicalCompanyId = String(req.body.companyId || req.body.id || '').trim();
        const name = String(req.body.name || '').trim();
        if (!canonicalCompanyId || !name) {
            return res.status(400).json({ success: false, message: 'بيانات الشركة ناقصة' });
        }

        const existingCompany = await Company.findOne({ companyId: canonicalCompanyId }).lean();
        if (existingCompany) {
            return res.status(200).json({ success: true, message: 'الشركة مسجلة مسبقاً', company: publicCompany(existingCompany) });
        }

        const company = await new Company({
            companyId: canonicalCompanyId,
            name,
            email: req.body.email || '',
            phone: req.body.phone || '',
            adminUsername: String(req.body.adminUsername || 'admin').trim(),
            adminPasswordHash: req.body.adminPassword ? hashPassword(req.body.adminPassword) : '',
            subscription: req.body.subscription || 'annual',
            systemState: req.body.systemState || 'active',
            subscriptionStartDate: req.body.subscriptionStartDate || new Date(),
            subscriptionEndDate: req.body.subscriptionEndDate || undefined
        }).save();

        res.status(201).json({ success: true, message: 'تم تسجيل الشركة بنجاح في MongoDB', company: publicCompany(company) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/companies', async (req, res) => {
    try {
        const companies = await Company.find().sort({ createdAt: -1 }).lean();
        res.json({ success: true, companies: companies.map(publicCompany) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/employee/request', async (req, res) => {
    try {
        const companyId = String(req.body.companyId || req.body.companyCode || req.body.id || '').trim();
        const name = String(req.body.name || '').trim();
        if (!companyId || !name) {
            return res.status(400).json({ success: false, message: 'بيانات طلب الموظف ناقصة' });
        }

        const company = await Company.findOne({ companyId }).lean();
        if (!company) {
            return res.status(404).json({ success: false, message: 'رمز الشركة غير مسجل في MongoDB' });
        }

        const request = await new EmployeeRequest({
            ...req.body,
            companyId,
            companyName: req.body.companyName || company.name,
            name,
            salary: req.body.salary !== undefined && req.body.salary !== '' ? Number(req.body.salary) : undefined,
            status: 'pending'
        }).save();

        res.status(201).json({
            success: true,
            message: 'تم إرسال الطلب إلى MongoDB بانتظار موافقة الشركة',
            requestId: request._id
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'تعذر حفظ طلب الموظف', error: err.message });
    }
});

app.get('/api/employee/requests/:companyId', async (req, res) => {
    try {
        const companyId = String(req.params.companyId || '').trim();
        const requests = await EmployeeRequest.find({ companyId }).sort({ createdAt: -1 }).lean();
        res.json({ success: true, requests });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/employee/requests/:companyId/pending', async (req, res) => {
    try {
        const companyId = String(req.params.companyId || '').trim();
        const requests = await EmployeeRequest.find({ companyId, status: 'pending' }).sort({ createdAt: -1 }).lean();
        res.json({ success: true, requests });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/employee/request/:requestId/approve', async (req, res) => {
    try {
        const request = await EmployeeRequest.findById(req.params.requestId);
        if (!request) return res.status(404).json({ success: false, message: 'طلب الموظف غير موجود' });
        if (request.status === 'approved') return res.status(200).json({ success: true, message: 'الطلب معتمد مسبقاً' });

        const username = String(req.body.username || request.username || '').trim();
        const password = String(req.body.password || request.password || '').trim();
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'اسم المستخدم وكلمة المرور مطلوبان لاعتماد الموظف' });
        }

        const existing = await Employee.findOne({ companyId: request.companyId, username }).lean();
        if (existing) return res.status(409).json({ success: false, message: 'اسم المستخدم مستخدم مسبقاً' });

        const employee = await new Employee({
            companyId: request.companyId,
            companyName: request.companyName,
            name: request.name,
            email: req.body.email || '',
            salary: request.salary,
            specialty: request.jobTitle,
            workplace: request.workLocation,
            username,
            password,
            location: request.location,
            loans: []
        }).save();

        request.status = 'approved';
        await request.save();

        res.status(201).json({ success: true, message: 'تم اعتماد الموظف وحفظه في MongoDB', employee });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/employee/register', upload.single('photo'), async (req, res) => {
    try {
        const companyId = String(req.body.companyId || req.body.companyCode || '').trim();
        if (!companyId || !req.body.name || !req.body.username || !req.body.password) {
            return res.status(400).json({ success: false, message: 'بيانات الموظف الأساسية ناقصة' });
        }

        const photoPath = req.file ? `/uploads/${req.file.filename}` : (req.body.photo || '');
        const employee = await new Employee({
            companyId,
            companyName: req.body.companyName,
            name: req.body.name,
            email: req.body.email,
            salary: req.body.salary ? Number(req.body.salary) : undefined,
            specialty: req.body.specialty,
            workplace: req.body.workplace,
            username: req.body.username,
            password: req.body.password,
            photoUrl: photoPath,
            location: req.body.location,
            loans: []
        }).save();

        res.status(201).json({ success: true, message: 'تم تسجيل الموظف وحفظه في MongoDB', employee });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/employees', async (req, res) => {
    try {
        const companyId = String(req.query.companyId || '').trim();
        if (!companyId) return res.status(400).json({ success: false, message: 'companyId مطلوب' });
        const employees = await Employee.find({ companyId }).sort({ createdAt: -1 }).lean();
        res.json({ success: true, total: employees.length, employees });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/employees/:companyId', async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
        const filter = { companyId: String(req.params.companyId).trim() };
        const employees = await Employee.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
        const total = await Employee.countDocuments(filter);
        res.json({ success: true, total, page, pages: Math.ceil(total / limit), employees });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/mobile/login', async (req, res) => {
    try {
        const companyId = String(req.body.companyId || req.body.companyCode || '').trim();
        const username = String(req.body.username || '').trim();
        const password = String(req.body.password || '');
        const deviceId = String(req.body.deviceId || '').trim();
        if (!companyId || !username || !password || !deviceId) {
            return res.status(400).json({ success: false, message: 'بيانات الدخول ناقصة' });
        }

        const employee = await Employee.findOne({ companyId, username, password });
        if (!employee) return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
        if (employee.deviceId && employee.deviceId !== deviceId) {
            return res.status(403).json({ success: false, message: 'هذا الحساب مرتبط بجهاز آخر. راجع مدير الشركة لإعادة ربط الجهاز.' });
        }
        if (!employee.deviceId) {
            employee.deviceId = deviceId;
            employee.deviceBoundAt = new Date();
            await employee.save();
        }
        res.json({ success: true, message: 'تم تسجيل الدخول بنجاح', employee: publicEmployee(employee) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/employees/:employeeId/device/reset', requireAdmin, async (req, res) => {
    try {
        const employee = await Employee.findById(req.params.employeeId);
        if (!employee || employee.companyId !== req.session.companyId) {
            return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
        }
        employee.deviceId = '';
        employee.deviceBoundAt = undefined;
        await employee.save();
        res.json({ success: true, message: 'تم فك ارتباط الجهاز؛ يستطيع الموظف الربط من جهازه الجديد عند الدخول القادم.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/employee/service-request', async (req, res) => {
    try {
        const employeeId = String(req.body.employeeId || '').trim();
        const deviceId = String(req.body.deviceId || '').trim();
        const type = String(req.body.type || '').trim();
        if (!employeeId || !deviceId || !['leave', 'loan'].includes(type)) {
            return res.status(400).json({ success: false, message: 'بيانات طلب الخدمة ناقصة' });
        }
        const employee = await Employee.findById(employeeId).lean();
        if (!employee || employee.deviceId !== deviceId) {
            return res.status(403).json({ success: false, message: 'لا يمكن إرسال الطلب من هذا الجهاز' });
        }
        const amount = req.body.amount === '' || req.body.amount == null ? undefined : Number(req.body.amount);
        if (type === 'loan' && (!Number.isFinite(amount) || amount <= 0)) {
            return res.status(400).json({ success: false, message: 'أدخل مبلغ سلفة صحيحاً' });
        }
        if (type === 'leave' && !req.body.requestedDate) {
            return res.status(400).json({ success: false, message: 'حدد تاريخ الإجازة' });
        }
        const request = await new ServiceRequest({
            companyId: employee.companyId,
            employeeId: String(employee._id),
            employeeName: employee.name,
            type,
            reason: String(req.body.reason || '').trim(),
            amount,
            requestedDate: req.body.requestedDate ? new Date(req.body.requestedDate) : undefined
        }).save();
        res.status(201).json({ success: true, message: 'تم إرسال الطلب إلى لوحة المدير', requestId: request._id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/admin/service-requests', requireAdmin, async (req, res) => {
    try {
        const requests = await ServiceRequest.find({ companyId: req.session.companyId }).sort({ createdAt: -1 }).lean();
        res.json({ success: true, requests });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/notifications', requireAdmin, upload.single('audio'), async (req, res) => {
    try {
        const employeeId = String(req.body.employeeId || '').trim();
        const employee = await Employee.findById(employeeId).lean();
        if (!employee || employee.companyId !== req.session.companyId) {
            return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
        }
        const message = String(req.body.message || '').trim();
        const audioUrl = req.file ? `/uploads/${req.file.filename}` : '';
        if (!message && !audioUrl) return res.status(400).json({ success: false, message: 'أدخل نص الإشعار أو أرفق رسالة صوتية' });
        const notification = await new Notification({
            companyId: employee.companyId, employeeId: String(employee._id),
            type: audioUrl ? 'voice' : 'text', message, audioUrl
        }).save();
        res.status(201).json({ success: true, notification });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/employee/notifications', async (req, res) => {
    try {
        const employeeId = String(req.query.employeeId || '').trim();
        const deviceId = String(req.query.deviceId || '').trim();
        const employee = await Employee.findById(employeeId).lean();
        if (!employee || !deviceId || employee.deviceId !== deviceId) {
            return res.status(403).json({ success: false, message: 'لا يمكن قراءة الإشعارات من هذا الجهاز' });
        }
        const notifications = await Notification.find({ employeeId }).sort({ createdAt: -1 }).limit(50).lean();
        res.json({ success: true, notifications });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/attendance', async (req, res) => {
    try {
        const { employeeId, fingerprintToken, latitude, longitude, timestamp, type } = req.body;
        if (!employeeId) return res.status(400).json({ success: false, message: 'معرف الموظف مطلوب' });

        const employee = await Employee.findById(employeeId).lean();
        if (!employee) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });

        const attendance = await new Attendance({
            employeeId: String(employee._id),
            companyId: employee.companyId,
            fingerprintToken: fingerprintToken || '',
            latitude: latitude != null ? Number(latitude) : undefined,
            longitude: longitude != null ? Number(longitude) : undefined,
            timestamp: timestamp ? new Date(timestamp) : new Date(),
            type: type || 'attendance'
        }).save();

        res.status(201).json({ success: true, message: 'تم تسجيل الحضور وحفظه في MongoDB', attendanceId: attendance._id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/employees/:employeeId/attendance', async (req, res) => {
    try {
        const attendance = await Attendance.find({ employeeId: req.params.employeeId }).sort({ timestamp: -1 }).limit(100).lean();
        res.json({ success: true, attendance });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/employees/:employeeId/loan', async (req, res) => {
    try {
        const employee = await Employee.findById(req.params.employeeId);
        if (!employee) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
        const loanAmount = parseFloat(req.body.loanAmount);
        const monthlyInstallment = parseFloat(req.body.monthlyInstallment);
        if (!Number.isFinite(loanAmount) || !Number.isFinite(monthlyInstallment)) {
            return res.status(400).json({ success: false, message: 'بيانات السلفة غير صحيحة' });
        }
        employee.loans.push({ loanAmount, monthlyInstallment, remainingAmount: loanAmount });
        await employee.save();
        res.json({ success: true, message: 'تم إضافة السلفة بنجاح', employee });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/employees/:employeeId/loan-deduction', async (req, res) => {
    try {
        const employee = await Employee.findById(req.params.employeeId);
        if (!employee) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
        const totalMonthlyDeduction = (employee.loans || []).reduce(
            (sum, loan) => sum + (loan.remainingAmount > 0 ? loan.monthlyInstallment : 0),
            0
        );
        res.json({ success: true, employeeId: employee._id, totalMonthlyDeduction });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

async function migrateCompanyIndexes() {
    const indexes = await Company.collection.indexes();
    const legacyIdIndex = indexes.find(index => index.name === 'id_1');
    if (legacyIdIndex) {
        await Company.collection.dropIndex(legacyIdIndex.name);
        console.log('ℹ️ تمت إزالة فهرس الشركة القديم id_1');
    }
    await Company.collection.createIndex({ companyId: 1 }, { unique: true, name: 'companyId_1' });
}

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('✅ تم الاتصال بقاعدة بيانات MongoDB بنجاح');
        await migrateCompanyIndexes();
        app.listen(PORT, () => console.log(`🚀 السيرفر يعمل الآن على المنفذ: ${PORT}`));
    })
    .catch(err => {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
        process.exit(1);
    });
