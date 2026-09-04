Warning: truncated output (original token count: 86317)
Total output lines: 12761

const express = require('express');
const crypto = require('crypto');

if (!globalThis.crypto) {
    globalThis.crypto = crypto.webcrypto;
}

const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const dotenv = require('dotenv');

/*
 * تحميل المتغيرات من ملف .env المحلي (إن وُجد).
 * على Render تُحقن المتغيرات من لوحة التحكم، وليس من ملف .env.
 * dotenv لا يتجاوز المتغيرات الموجودة مسبقًا في البيئة.
 * quiet: منع طباعة رسائل التلميح أثناء الإقلاع.
 */
dotenv.config({ quiet: true });

const app = express();

// Render terminates HTTPS at its proxy. This makes req.secure and secure
// cookies reflect the original client connection.
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const DEVELOPER_PASSWORD = process.env.DEVELOPER_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET || DEVELOPER_PASSWORD;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

/*
=========================================================
  إعدادات الاتصال
=========================================================
*/

if (!MONGO_URI) {
    console.error('❌ MONGO_URI is not configured. أضِفه إلى ملف .env أو إلى متغيرات البيئة في Render.');
    process.exit(1);
}

if (!DEVELOPER_PASSWORD) {
    console.error('❌ DEVELOPER_PASSWORD is not configured. أضِفه إلى ملف .env أو إلى متغيرات البيئة في Render.');
    process.exit(1);
}

if (!SESSION_SECRET) {
    console.log('⚠️ SESSION_SECRET غير محدد، سيُستخدم DEVELOPER_PASSWORD لفترة محدودة.');
}

app.disable('x-powered-by');

/*
 * CORS: يُسمح لكل الأصلان افتراضيًا (نفس السلوك السابق) حتى لا تُكسر الوظائف الحالية،
 * ويمكن تقييده عبر متغير البيئة:
 *   ALLOWED_ORIGINS = "https://app1.example.com,https://app2.example.com"
 */
app.use(cors(
    ALLOWED_ORIGINS.length
        ? { origin: ALLOWED_ORIGINS, credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }
        : { origin: true, credentials: true }
));

/*
 * ترويسات أمان أساسية دون حظر النصوص والتنسيقات المضمّنة في الصفحات الموجودة.
 */
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

app.use(express.json({
    limit: '50mb'
}));

app.use(express.urlencoded({
    extended: true,
    limit: '50mb'
}));

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads', {
        recursive: true
    });
}

app.use(
    express.static(path.join(__dirname, 'public'))
);

/*
=========================================================
  SIGNED PRIVATE MEDIA
=========================================================
*/

const MEDIA_URL_TTL_SECONDS = 10 * 60;

function signedMediaUrl(fileUrl) {

    const value =
        String(fileUrl || '').trim();

    if (!value) {
        return '';
    }

    if (!value.startsWith('/uploads/')) {
        return value;
    }

    if (!SESSION_SECRET) {
        return '';
    }

    const filename =
        path.basename(value);

    const expires =
        Math.floor(Date.now() / 1000) +
        MEDIA_URL_TTL_SECONDS;

    const signature =
        crypto
            .createHmac(
                'sha256',
                SESSION_SECRET
            )
            .update(
                `${filename}:${expires}`
            )
            .digest('hex');

    return (
        `/media/${encodeURIComponent(filename)}` +
        `?expires=${expires}` +
        `&signature=${signature}`
    );
}


app.get(
    '/media/:filename',
    (req, res) => {

        if (!SESSION_SECRET) {
            return res.status(503).json({
                success: false,
                message: 'حماية الوسائط غير مهيأة'
            });
        }

        const filename =
            String(req.params.filename || '');

        if (
            !filename ||
            filename !== path.basename(filename)
        ) {
            return res.status(400).json({
                success: false,
                message: 'اسم الملف غير صالح'
            });
        }

        const expires =
            Number(req.query.expires);

        const signature =
            String(
                req.query.signature || ''
            );

        if (
            !Number.isInteger(expires) ||
            expires < Math.floor(Date.now() / 1000) ||
            !signature
        ) {
            return res.status(403).json({
                success: false,
                message: 'رابط الوسائط منتهي أو غير صالح'
            });
        }

        const expected =
            crypto
                .createHmac(
                    'sha256',
                    SESSION_SECRET
                )
                .update(
                    `${filename}:${expires}`
                )
                .digest('hex');

        const suppliedBuffer =
            Buffer.from(signature);

        const expectedBuffer =
            Buffer.from(expected);

        if (
            suppliedBuffer.length !== expectedBuffer.length ||
            !crypto.timingSafeEqual(
                suppliedBuffer,
                expectedBuffer
            )
        ) {
            return res.status(403).json({
                success: false,
                message: 'توقيع الوسائط غير صالح'
            });
        }

        const filePath =
            path.join(
                __dirname,
                'uploads',
                filename
            );

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'الملف غير موجود'
            });
        }

        res.setHeader(
            'Cache-Control',
            'private, max-age=60'
        );

        return res.sendFile(filePath);
    }
);


/*
=========================================================
  COMPANY
=========================================================
*/

const companySchema = new mongoose.Schema({

    /*
     * رمز الشركة الرئيسي
     */
    companyId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    /*
     * كود المطور الخاص بالشركة
     * يمكن للمطور إدخاله بأي صيغة يريدها.
     */
    developerCode: {
        type: String,
        default: '',
        index: true
    },

    name: {
        type: String,
        required: true
    },

    email: {
        type: String,
        default: ''
    },

    phone: {
        type: String,
        default: ''
    },

    /*
     * بيانات مدير الشركة
     */
    managerName: {
        type: String,
        default: ''
    },

    managerPhone: {
        type: String,
        default: ''
    },

    adminUsername: {
        type: String,
        default: 'admin'
    },

    /*
     * كلمة المرور لا تخزن كنص صريح.
     */
    adminPasswordHash: {
        type: String,
        default: ''
    },

    subscription: {
        type: String,
        default: 'annual'
    },

    systemState: {
        type: String,
        enum: [
            'active',
            'stopped',
            'expired'
        ],
        default: 'active'
    },

    subscriptionStartDate: Date,

    subscriptionEndDate: Date,

    latitude: Number,

    longitude: Number,

    geofenceRadiusMeters: {
        type: Number,
        default: 200
    },

    uiLanguage: {
        type: String,
        enum: ['ar', 'en', 'ku', 'fa', 'tr'],
        default: 'ar'
    },

    uiTheme: {
        type: String,
        enum: ['light', 'dark'],
        default: 'light'
    },

    attendanceRetentionDays: {
        type: Number,
        enum: [7, 15, 30],
        default: 30
    },

    approvedLocations: [{
        name: {
            type: String,
            default: ''
        },

        type: {
            type: String,
            enum: [
                'headquarters',
                'branch',
                'worksite',
                'warehouse',
                'project',
                'temporary'
            ],
            default: 'worksite'
        },

        province: {
            type: String,
            default: ''
        },

        fullAddress: {
            type: String,
            default: ''
        },

        parentLocationId: {
            type: String,
            default: ''
        },

        latitude: Number,

        longitude: Number,

        radiusMeters: {
            type: Number,
            default: 200
        },

        active: {
            type: Boolean,
            default: true
        },

        clientOfflineId: {
            type: String,
            default: ''
        },

        createdAt: {
            type: Date,
            default: Date.now
        }
    }],

    /*
     * آخر نشاط حقيقي للشركة.
     */
    lastSeenAt: {
        type: Date,
        default: null,
        index: true
    },

    /*
     * تاريخ إنشاء الشركة.
     */
    createdAt: {
        type: Date,
        default: Date.now
    }

});

const Company =
    mongoose.model('Company', companySchema);

/*
=========================================================
  DEVELOPER SUPPORT REQUEST
=========================================================
*/
const supportRequestSchema = new mongoose.Schema({

    companyId: {
        type: String,
        required: true,
        index: true
    },

    companyName: {
        type: String,
        default: ''
    },

    subject: {
        type: String,
        required: true
    },

    message: {
        type: String,
        required: true
    },

    priority: {
        type: String,
        enum: ['normal', 'high', 'urgent'],
        default: 'normal'
    },

    status: {
        type: String,
        enum: ['open', 'in_progress', 'closed'],
        default: 'open',
        index: true
    },

    createdAt: {
        type: Date,
        default: Date.now
    },

    closedAt: Date
});

const SupportRequest =
    mongoose.model(
        'SupportRequest',
        supportRequestSchema
    );




/*
=========================================================
  EMPLOYEE REQUEST
=========================================================
*/

const employeeRequestSchema = new mongoose.Schema({

    companyId: {
        type: String,
        required: true,
        index: true
    },

    companyName: String,

    name: {
        type: String,
        required: true
    },

    phoneNumber: {
        type: String,
        default: ''
    },

    jobTitle: String,

    workLocation: String,

    salary: Number,

    shift: String,

    workHours: Number,

    wageType: String,

    socialSecurity: String,

    location: String,

    lastKnownLocation: {
        latitude: Number,
        longitude: Number,
        accuracyMeters: Number,
        timestamp: Date
    },

    username: String,

    password: String,

    deviceId: {
        type: String,
        default: ''
    },

    status: {
        type: String,
        default: 'pending',
        index: true
    },

    createdAt: {
        type: Date,
        default: Date.now
    }

});

const EmployeeRequest =
    mongoose.model(
        'EmployeeRequest',
        employeeRequestSchema
    );


/*
=========================================================
  EMPLOYEE
=========================================================
*/

const employeeSchema = new mongoose.Schema({

    companyId: {
        type: String,
        required: true,
        index: true
    },

    companyName: String,

    name: {
        type: String,
        required: true
    },

    email: String,

    /*
     * رقم الهاتف يُستخدم لربط طلبات الهاتف
     * بالموظف الموجود داخل نفس الشركة.
     */
    phoneNumber: {
        type: String,
        default: ''
    },

    salary: Number,

    wageType: {
        type: String,
        enum: ['monthly', 'weekly', 'daily'],
        default: 'monthly'
    },

    shift: {
        type: String,
        default: ''
    },

    socialSecurity: {
        type: String,
        default: ''
    },

    employeeSerial: {
        type: String,
        default: '',
        index: true
    },

    /*
     * معرف العملية عند إنشاء الموظف Offline.
     * يستخدم لمنع التكرار عند إعادة المزامنة.
     */
    clientOfflineId: {
        type: String,
        default: '',
        index: true
    },

    workHours: Number,

    specialty: String,

    workplace: String,

    username: {
        type: String,
        default: ''
    },

    /*
     * يبقى كما هو في النظام الحالي
     * حتى لا نكسر تسجيل الدخول الحالي.
     */
    password: {
        type: String,
        default: ''
    },

    credentialsStatus: {
        type: String,
        enum: [
            'pending',
            'active'
        ],
        default: 'pending'
    },

    /*
     * الجهاز المرتبط بالموظف.
     */
    deviceId: {
        type: String,
        default: ''
    },

    deviceBoundAt: Date,

    photoUrl: String,

    location: String,

    lastKnownLocation: {
        latitude: Number,
        longitude: Number,
        accuracyMeters: Number,
        timestamp: Date
    },

    province: {
        type: String,
        default: ''
    },

    district: {
        type: String,
        default: ''
    },

    fullAddress: {
        type: String,
        default: ''
    },

    nationality: { type: String, default: '' },
    city: { type: String, default: '' },
    neighborhood: { type: String, default: '' },
    street: { type: String, default: '' },
    alley: { type: String, default: '' },
    buildingNumber: { type: String, default: '' },
    nearestLandmark: { type: String, default: '' },
    certificate: { type: String, default: '' },

    unifiedCardNumber: { type: String, default: '' },
    unifiedCardIssuer: { type: String, default: '' },
    unifiedCardIssueDate: Date,
    unifiedCardExpiryDate: Date,

    residenceCardNumber: { type: String, default: '' },
    residenceCardIssuer: { type: String, default: '' },
    residenceCardIssueDate: Date,
    residenceCardExpiryDate: Date,

    passportNumber: { type: String, default: '' },
    passportIssuer: { type: String, default: '' },
    passportIssueDate: Date,
    passportExpiryDate: Date,

    branch: {
        type: String,
        default: ''
    },

    hireDate: Date,

    employmentStatus: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    },

    documents: [{
        type: {
            type: String,
            default: 'other'
        },
        title: {
            type: String,
            default: ''
        },
        fileUrl: {
            type: String,
            default: ''
        },
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],

    delegation: {
        active: {
            type: Boolean,
            default: false
        },
        from: Date,
        to: Date,
        province: {
            type: String,
            default: ''
        },
        locationName: {
            type: String,
            default: ''
        },
        latitude: Number,
        longitude: Number,
        radiusMeters: {
            type: Number,
            default: 200
        },
        allowProvinceWide: {
            type: Boolean,
            default: false
        },
        reason: {
            type: String,
            default: ''
        }
    },

    replacement: {
        active: { type: Boolean, default: false },
        name: { type: String, default: '' },
        from: Date,
        to: Date,
        note: { type: String, default: '' }
    },

    createdAt: {
        type: Date,
        default: Date.now
    },

    loans: [{
        loanAmount: Number,
        monthlyInstallment: Number,
        remainingAmount: Number,
        startDate: {
            type: Date,
            default: Date.now
        }
    }]

});

const Employee =
    mongoose.model(
        'Employee',
        employeeSchema
    );


/*
=========================================================
  ATTENDANCE
=========================================================
*/

const attendanceSchema = new mongoose.Schema({

    employeeId: {
        type: String,
        required: true,
        index: true
    },

    companyId: {
        type: String,
        index: true
    },

    deviceId: {
        type: String,
        default: ''
    },

    fingerprintToken: String,

    verificationMethod: {
        type: String,
        default: 'device-biometric'
    },

    shiftId: { type: String, default: '', index: true },
    shiftName: { type: String, default: '' },
    workplace: { type: String, default: '' },

    latitude: Number,

    longitude: Number,

    timestamp: {
        type: Date,
        default: Date.now
    },

    type: {
        type: String,
        default: 'attendance'
    },

    employeeName: {
        type: String,
        default: ''
    },

    attendanceStatus: {
        type: String,
        enum: [
            'normal',
            'delegation'
        ],
        default: 'normal',
        index: true
    },

    delegationApplied: {
        type: Boolean,
        default: false
    },

    delegationReason: {
        type: String,
        default: ''
    },

    delegationProvince: {
        type: String,
        default: ''
    },

    delegationLocationName: {
        type: String,
        default: ''
    },

    locationStatus: {
        type: String,
        enum: [
            'approved',
            'delegation'
        ],
        default: 'approved'
    },

    timeStatus: {
        type: String,
        enum: [
            'within-shift',
            'late',
            'absent-late',
            'delegation',
            'early-exit-pending',
            'early-exit-approved'
        ],
        default: 'within-shift'
    },

    lateMinutes: { type: Number, default: 0 },

    managerApprovalStatus: {
        type: String,
        enum: ['not-required', 'pending', 'approved', 'rejected'],
        default: 'not-required',
        index: true
    },
    managerApprovedAt: Date,
    managerApprovedBy: { type: String, default: '' }

});

const Attendance =
    mongoose.model(
        'Attendance',
        attendanceSchema
    );


/*
=========================================================
  SERVICE REQUEST
=========================================================
*/

const serviceRequestSchema = new mongoose.Schema({

    companyId: {
        type: String,
        required: true,
        index: true
    },

    employeeId: {
        type: String,
        required: true,
        index: true
    },

    employeeName: {
        type: String,
        required: true
    },

    type: {
        type: String,
        enum: [
            'leave',
            'loan',
            'ambulance'
        ],
        required: true
    },

    reason: {
        type: String,
        default: ''
    },

    amount: Number,

    requestedDate: Date,

    fromDate: Date,

    toDate: Date,

    leavePaymentType: {
        type: String,
        enum: ['paid', 'unpaid'],
        default: 'paid'
    },

    payrollApplied: {
        type: Boolean,
        default: false
    },

    payrollAppliedAt: Date,

    deviceId: {
        type: String,
        default: ''
    },

    processedAt: Date,

    processedBy: String,

    status: {
        type: String,
        enum: [
            'pending',
            'approved',
            'rejected'
        ],
        default: 'pending',
        index: true
    },

    createdAt: {
        type: Date,
        default: Date.now
    }

});

const ServiceRequest =
    mongoose.model(
        'ServiceRequest',
        serviceRequestSchema
    );


/*
=========================================================
  NOTIFICATION
=========================================================
*/

const notificationSchema = new mongoose.Schema({

    companyId: {
        type: String,
        required: true,
        index: true
    },

    employeeId: {
        type: String,
        required: true,
        index: true
    },

    type: {
        type: String,
        enum: [
            'text',
            'voice'
        ],
        required: true
    },

    message: {
        type: String,
        default: ''
    },

    audioUrl: {
        type: String,
        default: ''
    },

    priority: {
        type: String,
        enum: ['normal', 'urgent'],
        default: 'normal',
        index: true
    },

    targetType: {
        type: String,
        enum: ['employee', 'branch', 'all'],
        default: 'employee'
    },

    targetLabel: { type: String, default: '' },
    campaignId: { type: String, default: '', index: true },
    scheduledAt: { type: Date, default: null, index: true },
    readAt: { type: Date, default: null },
    listenedAt: { type: Date, default: null },

    createdAt: {
        type: Date,
        default: Date.now
    }

});

const Notification =
    mongoose.model(
        'Notification',
        notificationSchema
    );

/*
=========================================================
  IMMUTABLE SYSTEM ARCHIVE
=========================================================
*/

const archiveRecordSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true, immutable: true },
    category: {
        type: String,
        enum: ['employee_document', 'information', 'operation'],
        required: true,
        index: true,
        immutable: true
    },
    sourceType: { type: String, default: '', index: true, immutable: true },
    sourceId: { type: String, default: '', index: true, immutable: true },
    snapshotId: { type: String, default: '', index: true, immutable: true },
    employeeId: { type: String, default: '', index: true, immutable: true },
    employeeName: { type: String, default: '', immutable: true },
    title: { type: String, default: '' },
    documentType: { type: String, default: '' },
    fileUrl: { type: String, default: '', immutable: true },
    note: { type: String, default: '' },
    payload: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
    archivedBy: { type: String, default: 'admin', immutable: true },
    createdAt: { type: Date, default: Date.now, index: true, immutable: true }
}, {
    versionKey: false
});

archiveRecordSchema.pre(
    [
        'updateOne',
        'updateMany',
        'findOneAndUpdate',
        'replaceOne',
        'deleteOne',
        'deleteMany',
        'findOneAndDelete'
    ],
    function preventArchiveMutation(next) {
        const query = this.getQuery ? this.getQuery() : {};
        if (query.category === 'employee_document') {
            return next();
        }
        next(new Error('سجلات الأرشيف دائمة ولا تقبل التعديل أو الحذف'));
    }
);

const ArchiveRecord = mongoose.model('ArchiveRecord', archiveRecordSchema);

/*
=========================================================
  SHIFT MODEL (جديد)
=========================================================
*/
const shiftSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    name: { type: String, enum: ['صباحي', 'مسائي', 'ليلي', 'مرن'], required: true },
    branch: { type: String, default: '' },

    locationId: {
        type: String,
        default: '',
        index: true
    },

    locationName: {
        type: String,
        default: ''
    },

    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    radiusMeters: { type: Number, default: null },

    employeeIds: { type: [String], default: [] },
    attendanceStart: { type: String, default: '' },
    attendanceEnd: { type: String, default: '' },
    lateFrom: { type: String, default: '' },
    lateTo: { type: String, default: '' },
    departureStart: { type: String, default: '' },
    departureEnd: { type: String, default: '' },
    overtimeStart: { type: String, default: '' },
    overtimeEnd: { type: String, default: '' },

    clientOfflineId: {
        type: String,
        default: '',
        index: true
    },

    createdAt: { type: Date, default: Date.now }
});
const Shift = mongoose.model('Shift', shiftSchema);

/*
=========================================================
  SALARY RECORD MODEL (جديد)
=========================================================
*/
const salaryRecordSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    employeeId: { type: String, required: true, index: true },
    employeeName: { type: String, default: '' },
    specialty: { type: String, default: '' },
    workplace: { type: String, default: '' },
    shiftName: { type: String, default: '' },
    lateFrom: { type: String, default: '' },
    lateTo: { type: String, default: '' },
    socialSecurity: { type: String, default: 'غير مسجل' },
    employeeSerial: { type: String, default: '', index: true },

    wageType: {
        type: String,
        enum: ['monthly', 'weekly', 'daily'],
        default: 'monthly'
    },

    payrollFrom: Date,
    payrollTo: Date,

    basicSalary: { type: Number, default: 0 },

    dailyRate: { type: Number, default: 0 },
    weeklyRate: { type: Number, default: 0 },

    allowances: { type: Number, default: 0 },

    loans: { type: Number, default: 0 },
    loanDeduction: { type: Number, default: 0 },

    replacementDeduction: { type: Number, default: 0 },
    absenceDeduction: { type: Number, default: 0 },
    lateMinutes: { type: Number, default: 0 },
    lateDeduction: { type: Number, default: 0 },

    socialSecurityStatus: {
        type: String,
        enum: ['registered', 'unregistered'],
        default: 'unregistered'
    },

    socialSecurityDeduction: { type: Number, default: 0 },

    securityDeduction: { type: Number, default: 0 },
    otherDeductions: { type: Number, default: 0 },

    bonuses: { type: Number, default: 0 },
    overtimeAmount: { type: Number, default: 0 },

    paidLeaveDays: { type: Number, default: 0 },
    unpaidLeaveDays: { type: Number, default: 0 },
    absenceDays: { type: Number, default: 0 },

    replacementDays: { type: Number, default: 0 },

    replacementActive: { type: Boolean, default: false },
    replacementName: { type: String, default: '' },
    replacementFrom: Date,
    replacementTo: Date,
    replacementNote: { type: String, default: '' },

    totalDeductions: { type: Number, default: 0 },
    grossSalary: { type: Number, default: 0 },
    netSalary: { type: Number, default: 0 },
    carriedBalance: { type: Number, default: 0 },
    currentPeriodEarnings: { type: Number, default: 0 },

    attendanceDays: { type: Number, default: 0 },
    attendanceCount: { type: Number, default: 0 },

    calculatedAt: Date,

    calculationKey: {
        type: String,
        default: '',
        index: true
    },

    lastAttendanceAt: Date,

    /*
     * طريقة صرف الراتب.
     * cash = صرف يدوي
     * card = بطاقة / محفظة رواتب
     * bank = حساب مصرفي
     */
    payoutMethod: {
        type: String,
        enum: ['cash', 'card', 'bank'],
        default: 'cash',
        index: true
    },

    payoutSelected: {
        type: Boolean,
        default: false
    },

    payoutBankName: {
        type: String,
        default: ''
    },

    payoutAccountName: {
        type: String,
        default: ''
    },

    /*
     * مرجع التحويل.
     * لا نخزن PIN أو CVV.
     */
    payoutReference: {
        type: String,
        default: ''
    },

    payoutLast4: {
        type: String,
        default: ''
    },

    payoutStatus: {
        type: String,
        enum: [
            'unpaid',
            'ready',
            'processing',
            'transferred',
            'cash-paid',
            'failed'
        ],
        default: 'unpaid',
        index: true
    },

    lastPayoutAt: Date,

    lastPaidAmount: { type: Number, default: 0 },
    lastPaidPeriod: { type: String, default: '' },
    lastPaidBatchId: { type: String, default: '', index: true },

    pendingPayoutBatchId: { type: String, default: '', index: true },

    createdAt: { type: Date, default: Date.now }
});
const SalaryRecord = mongoose.model('SalaryRecord', salaryRecordSchema);

/*
=========================================================
  PAYROLL PAYOUT BATCH
=========================================================
*/

const payrollBatchSchema = new mongoose.Schema({

    companyId: {
        type: String,
        required: true,
        index: true
    },

    batchNumber: {
        type: String,
        required: true,
        index: true
    },

    payoutType: {
        type: String,
        enum: ['card', 'bank', 'cash'],
        required: true,
        index: true
    },

    branch: {
        type: String,
        default: '',
        index: true
    },

    payrollFrom: Date,
    payrollTo: Date,

    status: {
        type: String,
        enum: [
            'prepared',
            'approved',
            'processing',
            'completed',
            'partially-completed',
            'failed',
            'cancelled'
        ],
        default: 'prepared',
        index: true
    },

    items: [{
        salaryRecordId: {
            type: String,
            default: ''
        },

        employeeId: {
            type: String,
            required: true
        },

        employeeName: {
            type: String,
            default: ''
        },

        employeeSerial: {
            type: String,
            default: ''
        },

        specialty: {
            type: String,
            default: ''
        },

        workplace: {
            type: String,
            default: ''
        },

        payoutMethod: {
            type: String,
            enum: ['cash', 'card', 'bank'],
            default: 'cash'
        },

        bankName: {
            type: String,
            default: ''
        },

        accountName: {
            type: String,
            default: ''
        },

        payoutReference: {
            type: String,
            default: ''
        },

        payoutLast4: {
            type: String,
            default: ''
        },

        basicSalary: {
            type: Number,
            default: 0
        },

        allowances: {
            type: Number,
            default: 0
        },

        loans: {
            type: Number,
            default: 0
        },

        loanDeduction: {
            type: Number,
            default: 0
        },

        absenceDeduction: { type: Number, default: 0 },
        lateMinutes: { type: Number, default: 0 },
        lateDeduction: { type: Number, default: 0 },

        securityDeduction: {
            type: Number,
            default: 0
        },

        otherDeductions: {
            type: Number,
            default: 0
        },

        bonuses: {
            type: Number,
            default: 0
        },

        totalDeductions: {
            type: Number,
            default: 0
        },

        netSalary: {
            type: Number,
            default: 0
        },

        payoutStatus: {
            type: String,
            enum: [
                'ready',
                'processing',
                'transferred',
                'cash-paid',
                'failed'
            ],
            default: 'ready'
        },

        paidAt: Date,

        notes: {
            type: String,
            default: ''
        }
    }],

    employeesCount: {
        type: Number,
        default: 0
    },

    totalAmount: {
        type: Number,
        default: 0
    },

    preparedBy: {
        type: String,
        default: ''
    },

    approvedBy: {
        type: String,
        default: ''
    },

    approvedAt: Date,

    completedAt: Date,

    paymentConfirmedBy: {
        type: String,
        default: ''
    },

    paymentConfirmedAt: Date,

    paymentPeriod: {
        type: String,
        default: ''
    },

    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }

});

payrollBatchSchema.index({
    companyId: 1,
    batchNumber: 1
}, {
    unique: true
});

const PayrollBatch =
    mongoose.model(
        'PayrollBatch',
        payrollBatchSchema
    );


/*
=========================================================
  EMPLOYEE EVALUATION
=========================================================
*/
const employeeEvaluationSchema = new mongoose.Schema({

    companyId: {
        type: String,
        required: true,
        index: true
    },

    employeeId: {
        type: String,
        required: true,
        index: true
    },

    employeeName: {
        type: String,
        default: ''
    },

    branch: {
        type: String,
        default: '',
        index: true
    },

    periodType: {
        type: String,
        enum: ['monthly', 'semiannual', 'annual'],
        required: true,
        index: true
    },

    fromDate: {
        type: Date,
        required: true
    },

    toDate: {
        type: Date,
        required: true
    },

    attendanceScore: {
        type: Number,
        default: 0
    },

    punctualityScore: {
        type: Number,
        default: 0
    },

    disciplineScore: {
        type: Number,
        default: 0
    },

    performanceScore: {
        type: Number,
        default: 0
    },

    managerScore: {
        type: Number,
        default: 0
    },

    totalScore: {
        type: Number,
        default: 0
    },

    grade: {
        type: String,
        default: ''
    },

    notes: {
        type: String,
        default: ''
    },

    createdAt: {
        type: Date,
        default: Date.now
    }

});

const EmployeeEvaluation =
    mongoose.model(
        'EmployeeEvaluation',
        employeeEvaluationSchema
    );



/*
=========================================================
  LOAN RECORD MODEL (جديد)
=========================================================
*/
const loanRecordSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    employeeId: { type: String, required: true, index: true },
    employeeName: { type: String, default: '' },
    specialty: { type: String, default: '' },
    workplace: { type: String, default: '' },
    totalLoanAmount: { type: Number, default: 0 },
    monthlyInstallment: { type: Number, default: 0 },
    manualPaidAdjustment: { type: Number, default: 0 },
    loanDate: { type: Date, default: Date.now },
    repayments: [{
        date: { type: Date, default: Date.now },
        amount: { type: Number, default: 0 },

        clientOfflineId: {
            type: String,
            default: ''
        }
    }],
    remainingAmount: { type: Number, default: 0 },

    clientOfflineId: {
        type: String,
        default: '',
        index: true
    },

    createdAt: { type: Date, default: Date.now }
});
const LoanRecord = mongoose.model('LoanRecord', loanRecordSchema);

function loanPaidAmount(loan) {
    return (loan.repayments || []).reduce((sum, row) => sum + Number(row.amount || 0), 0) +
        Number(loan.manualPaidAdjustment || 0);
}

function loanRemainingAmount(loan) {
    return Math.max(0, Number(loan.totalLoanAmount || 0) - loanPaidAmount(loan));
}

async function syncEmployeeLoanSummary(companyId, employeeId) {
    const loans = await LoanRecord.find({ companyId, employeeId: String(employeeId) });
    let balance = 0;
    let installment = 0;
    for (const loan of loans) {
        const remaining = loanRemainingAmount(loan);
        balance += remaining;
        installment += Math.min(remaining, Math.max(0, Number(loan.monthlyInstallment || 0)));
    }
    await SalaryRecord.updateOne(
        { companyId, employeeId: String(employeeId) },
        { $set: { loans: balance, loanDeduction: Math.min(balance, installment) } }
    );
}


/*
=========================================================
  DAILY WORKER / REPLACEMENT RECORD
=========================================================
*/
const dailyWorkerRecordSchema = new mongoose.Schema({

    companyId: {
        type: String,
        required: true,
        index: true
    },

    branch: {
        type: String,
        default: '',
        index: true
    },

    workerName: {
        type: String,
        required: true
    },

    workerEmployeeId: {
        type: String,
        default: '',
        index: true
    },

    specialty: {
        type: String,
        default: ''
    },

    workplace: {
        type: String,
        default: ''
    },

    workDate: {
        type: Date,
        required: true,
        index: true
    },

    days: {
        type: Number,
        default: 1
    },

    dailyRate: {
        type: Number,
        required: true,
        min: 0
    },

    totalAmount: {
        type: Number,
        default: 0
    },

    isReplacement: {
        type: Boolean,
        default: false
    },

    replacementForEmployeeId: {
        type: String,
        default: '',
        index: true
    },

    replacementForEmployeeName: {
        type: String,
        default: ''
    },

    deductionPolicy: {
        type: String,
        enum: ['company', 'employee'],
        default: 'company'
    },

    payrollApplied: {
        type: Boolean,
        default: false
    },

    payrollAppliedAt: Date,

    notes: {
        type: String,
        default: ''
    },

    createdAt: {
        type: Date,
        default: Date.now
    }

});

dailyWorkerRecordSchema.pre('save', function() {

    const days =
        Number(this.days) > 0
            ? Number(this.days)
            : 1;

    const rate =
        Number(this.dailyRate) >= 0
            ? Number(this.dailyRate)
            : 0;

    this.totalAmount =
        days * rate;

});

const DailyWorkerRecord =
    mongoose.model(
        'DailyWorkerRecord',
        dailyWorkerRecordSchema
    );


/*
=========================================================
  SECURITY
=========================================================
*/

function hashPassword(password) {

    const salt =
        crypto.randomBytes(16).toString('hex');

    const hash =
        crypto.scryptSync(
            String(password),
            salt,
            64
        ).toString('hex');

    return `${salt}:${hash}`;
}


function verifyPassword(
    password,
    storedHash
) {

    if (
        !storedHash ||
        !storedHash.includes(':')
    ) {
        return false;
    }

    const parts =
        storedHash.split(':');

    const salt = parts[0];

    const expectedHash = parts[1];

    const actualHash =
        crypto.scryptSync(
            String(password),
            salt,
            64
        ).toString('hex');

    return crypto.timingSafeEqual(
        Buffer.from(
            expectedHash,
            'hex'
        ),
        Buffer.from(
            actualHash,
            'hex'
        )
    );
}


/*
=========================================================
  TOKEN
=========================================================
*/

function createToken(payload) {

    const body =
        Buffer.from(
            JSON.stringify({
                ...payload,
                exp:
                    Date.now() +
                    8 * 60 * 60 * 1000
            })
        ).toString('base64url');

    const signature =
        crypto
            .createHmac(
                'sha256',
                SESSION_SECRET
            )
            .update(body)
            .digest('base64url');

    return `${body}.${signature}`;
}


function readToken(token) {

    if (
        !SESSION_SECRET ||
        !token ||
        !token.includes('.')
    ) {
        return null;
    }

    const [
        body,
        signature
    ] = token.split('.');

    const expected =
        crypto
            .createHmac(
                'sha256',
                SESSION_SECRET
            )
            .update(body)
            .digest('base64url');

    if (
        signature.length !==
        expected.length
    ) {
        return null;
    }

    if (
        !crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expected)
        )
    ) {
        return null;
    }

    try {

        const payload =
            JSON.parse(
                Buffer
                    .from(
                        body,
                        'base64url'
                    )
                    .toString()
            );

        return payload.exp > Date.now()
            ? payload
            : null;

    } catch {

        return null;

    }
}



function developerTokenFromRequest(req) {

    const bearer =
        req.headers.authorization
            ?.replace(/^Bearer\s+/i, '')
            ?.trim();

    if (bearer) return bearer;

    const cookies =
        String(req.headers.cookie || '')
            .split(';');

    for (const cookie of cookies) {

        const [name, ...value] =
            cookie.trim().split('=');

        if (
            name ===
            'almoraqeb_developer_session'
        ) {

            try {
                return decodeURIComponent(
                    value.join('=')
                );
            } catch {
                return null;
            }
        }
    }

    return null;
}

function adminTokenFromRequest(req) {
    const cookies = String(req.headers.cookie || '').split(';');
    for (const cookie of cookies) {
        const [name, ...value] = cookie.trim().split('=');
        if (name === 'almoraqeb_admin_session') {
            try {
                return decodeURIComponent(value.join('='));
            } catch {
                return null;
            }
        }
    }
    return null;
}

function setAdminCookie(req, res, token) {
    const secure = req.secure ||
        String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
    const parts = [
        'almoraqeb_admin_session=' + encodeURIComponent(token),
        'HttpOnly',
        'Path=/',
        'SameSite=Lax',
        'Max-Age=28800'
    ];
    if (secure) parts.push('Secure');
    res.append('Set-Cookie', parts.join('; '));
}

function clearAdminCookie(req, res) {
    const secure = req.secure ||
        String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
    const parts = [
        'almoraqeb_admin_session=',
        'HttpOnly',
        'Path=/',
        'SameSite=Lax',
        'Max-Age=0'
    ];
    if (secure) parts.push('Secure');
    res.append('Set-Cookie', parts.join('; '));
}


function setDeveloperCookie(req, res, token) {

    const secure =
        req.secure ||
        String(
            req.headers['x-forwarded-proto'] || ''
        ).toLowerCase() === 'https';

    const parts = [
        'almoraqeb_developer_session=' +
            encodeURIComponent(token),
        'HttpOnly',
        'Path=/',
        'SameSite=Strict',
        'Max-Age=28800'
    ];

    if (secure) parts.push('Secure');

    res.setHeader(
        'Set-Cookie',
        parts.join('; ')
    );
}


function clearDeveloperCookie(req, res) {

    const secure =
        req.secure ||
        String(
            req.headers['x-forwarded-proto'] || ''
        ).toLowerCase() === 'https';

    const parts = [
        'almoraqeb_developer_session=',
        'HttpOnly',
        'Path=/',
        'SameSite=Strict',
        'Max-Age=0'
    ];

    if (secure) parts.push('Secure');

    res.setHeader(
        'Set-Cookie',
        parts.join('; ')
    );
}


/*
=========================================================
  AUTH
=========================================================
*/

function requireDeveloper(
    req,
    res,
    next
) {

    const token =
        readToken(
            developerTokenFromRequest(
                req
            )
        );

    if (
        !token ||
        token.role !== 'developer'
    ) {

        return res.status(401).json({
            success: false,
            message:
                'جلسة المطور غير صالحة'
        });

    }

    req.session = token;

    next();
}


function requireDeveloperPage(req, res, next) {

    const token = readToken(
        developerTokenFromRequest(req)
    );

    if (!token || token.role !== 'developer') {
        const nextPath = encodeURIComponent(
            req.originalUrl || '/developer/create-company'
        );

        return res.redirect(
            '/developer/login?next=' + nextPath
        );
    }

    req.session = token;
    next();
}


function requireAdmin(
    req,
    res,
    next
) {

    const bearer = req.headers.authorization
        ?.replace(/^Bearer\s+/i, '')
        ?.trim();
    const token = readToken(bearer) || readToken(adminTokenFromRequest(req));

    if (
        !token ||
        token.role !== 'admin'
    ) {

        return res.status(401).json({
            success: false,
            message:
                'جلسة المدير غير صالحة'
        });

    }

    req.session = token;

    next();
}


/*
=========================================================
  PUBLIC DATA
=========================================================
*/

function publicEmployee(employee) {

    const value =
        employee.toObject
            ? employee.toObject()
            : employee;

    const {
        password,
        ...safeEmployee
    } = value;

    // توحيد الحقل الذي تستخدمه لوحة المدير مع حالة بيانات الدخول في MongoDB.
    // النظام يحفظ credentialsStatus فقط للموظف، بينما الواجهة القديمة تقرأ status.
    if (!safeEmployee.status) {
        safeEmployee.status =
            safeEmployee.credentialsStatus === 'active'
                ? 'active'
                : 'pending';
    }

    return safeEmployee;
}


function employeeWithSignedMedia(employee) {

    const safeEmployee =
        publicEmployee(employee);

    return {
        ...safeEmployee,
        photoUrl:
            signedMediaUrl(
                safeEmployee.photoUrl
            )
    };
}


function publicCompany(company) {

    const value =
        company.toObject
            ? company.toObject()
            : company;

    const {
        adminPasswordHash,
        ...safeCompany
    } = value;

    return safeCompany;
}

function logEmployeeRequestEvent(event, meta = {}) {

   const payload = {
       event,
       endpoint: meta.endpoint || null,
       companyId: meta.companyId || null,
       deviceId: meta.deviceId || null,
       requestId: meta.requestId || null,
       httpStatus: meta.httpStatus || null,
       error: meta.error ? String(meta.error).slice(0, 200) : null
   };

   console.log('[employee-request]', JSON.stringify(payload));
}


/*
=========================================================
  COMPANY CONNECTION STATUS
=========================================================
*/

const COMPANY_ONLINE_WINDOW_MS =
    5 * 60 * 1000;


function getCompanyConnectionStatus(
    company
) {

    if (!company) {

        return {
            status: 'unknown',
            label: 'غير معروف',
            downtimeMs: null,
            downtimeMinutes: null
        };

    }

    if (!company.lastSeenAt) {

        return {
            status: 'never',
            label: 'لم تتصل بعد',
            downtimeMs: null,
            downtimeMinutes: null
        };

    }

    const lastSeen =
        new Date(
            company.lastSeenAt
        ).getTime();

    const now =
        Date.now();

    const difference =
        Math.max(
            0,
            now - lastSeen
        );

    const online =
        difference <=
        COMPANY_ONLINE_WINDOW_MS;

    return {

        status:
            online
                ? 'connected'
                : 'stopped',

        label:
            online
                ? 'متصلة'
                : 'متوقفة',

        downtimeMs:
            online
                ? 0
                : difference,

        downtimeMinutes:
            online
                ? 0
                : Math.floor(
                    difference /
                    60000
                )

    };

}


function buildCompanyReport(
    company
) {

    const connection =
        getCompanyConnectionStatus(
            company
        );

    const endDate =
        company.subscriptionEndDate
            ? new Date(
                company.subscriptionEndDate
            )
            : null;

    const expired =
        endDate &&
        !Number.isNaN(
            endDate.getTime()
        ) &&
        endDate < new Date();

    return {

        companyId:
            company.companyId,

        developerCode:
            company.developerCode || '',

        name:
            company.name || '',

        email:
            company.email || '',

        phone:
            company.phone || '',

        managerName:
            company.managerName || '',

        managerPhone:
            company.managerPhone ||
            company.phone ||
            '',

        adminUsername:
            company.adminUsername || '',

        subscription:
            company.subscription || '',

        systemState:
            expired
                ? 'expired'
                : company.systemState,

        subscriptionStartDate:
            company.subscriptionStartDate ||
            null,

        subscriptionEndDate:
            company.subscriptionEndDate ||
            null,

        createdAt:
            company.createdAt,

        lastSeenAt:
            company.lastSeenAt ||
            null,

        connectionStatus:
            connection.status,

        connectionLabel:
            connection.label,

        downtimeMinutes:
            connection.downtimeMinutes,

        expired,

        gps:
            {
                latitude:
                    company.latitude ??
                    null,

                longitude:
                    company.longitude ??
                    null,

                radius:
                    company.geofenceRadiusMeters ??
                    200
            }

    };

}


/*
=========================================================
  UPLOAD
=========================================================
*/

const storage =
    multer.diskStorage({

        destination:
            (req, file, cb) =>
                cb(
                    null,
                    'uploads/'
                ),

        filename:
            (req, file, cb) =>
                cb(
                    null,
                    Date.now() +
                    '-' +
                    Math.round(
                        Math.random() *
                        1E9
                    ) +
                    path.extname(
                        file.originalname
                    )
                )

    });

const upload =
    multer({
        storage,
        limits: {
            fileSize:
                5 * 1024 * 1024
        }
    });


/*
=========================================================
  PING
=========================================================
*/

app.get(
    '/api/ping',
    (req, res) => {

        res.status(200).json({

            success: true,

            status:
                'connected',

            database:
                'mongodb',

            message:
                'السيرفر يعمل ومتصل بنجاح',

            time:
                new Date().toISOString()

        });

    }
);

/*
=========================================================
  HEALTH CHECK
=========================================================
*/

/*
 * نقطة فحص الحالة لـ Render Health Check.
 * تُرجع 200 عندما تكون قاعدة البيانات متصلة، و 503 عند ضعف الاتصال
 * (لكن الخادم يبقى قيد التشغيل حتى يمكن إعادة الاتصال تلقائيًا).
 */
app.get(
    '/health',
    (req, res) => {

        const dbState =
            mongoose.connection.readyState;

        const dbLabels = [
            'disconnected',
            'connected',
            'connecting',
            'disconnecting'
        ];

        const dbLabel =
            dbLabels[dbState] || 'unknown';

        const healthy =
            dbState === 1;

        res.status(
            healthy ? 200 : 503
        ).json({

            success: healthy,

            status:
                healthy ? 'ok' : 'degraded',

            service:
                'almoraqebpro-server',

            database: dbLabel,

            uptime:
                process.uptime(),

            timestamp:
                new Date().toISOString()

        });

    }
);

/*
=========================================================
  DEVELOPER LOGIN
=========================================================
*/

app.post(
    '/api/developer/login',
    (req, res) => {

        if (
            !DEVELOPER_PASSWORD ||
            !SESSION_SECRET
        ) {

            return res.status(503).json({

                success: false,

                message:
                    'لم تُضبط حماية لوحة المطور'

            });

        }

        const password =
            String(
                req.body.password || ''
            );

        if (
            password !==
            DEVELOPER_PASSWORD
        ) {

            return res.status(401).json({

                success: false,

                message:
                    'كلمة مرور المطور غير صحيحة'

            });

        }

        const token =
            createToken({
                role:
                    'developer'
            });

        setDeveloperCookie(
            req,
            res,
            token
        );

        res.json({

            success: true,

            token

        });

    }
);



/*
=========================================================
  DEVELOPER PRIVATE PAGES
=========================================================
*/

app.get(
    '/developer/login',
    (req, res) => {

        const token =
            readToken(
                developerTokenFromRequest(
                    req
                )
            );

        if (
            token &&
            token.role === 'developer'
        ) {

            return res.redirect(
                '/developer/create-company'
            );

        }

        res.sendFile(
            path.join(
                __dirname,
                'public',
                'developer_login.html'
            )
        );
    }
);

app.get('/developer', (req, res) => {
    res.redirect('/developer/create-company');
});

app.get('/developer/options', (req, res) => {
    res.redirect('/developer/create-company');
});

app.post(
    '/developer/session',
    (req, res) => {

        if (
            !DEVELOPER_PASSWORD ||
            !SESSION_SECRET
        ) {

            return res
                .status(503)
                .send(
                    'حماية المطور غير مهيأة'
                );

        }

        const password =
            String(
                req.body.password ||
                ''
            );

        if (
            password !==
            DEVELOPER_PASSWORD
        ) {

            return res
                .status(401)
                .type('html')
                .send(
                    '<h3 dir="rtl">❌ كلمة مرور المطور غير صحيحة</h3>' +
                    '<p dir="rtl"><a href="/developer/login">العودة</a></p>'
                );

        }

        const token =
            createToken({
                role:
                    'developer'
            });

        setDeveloperCookie(
            req,
            res,
            token
        );

        res.redirect(
            '/developer/create-company'
        );
    }
);

app.get(
    '/developer/create-company',
    requireDeveloperPage,
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'developer',
                'create-company.html'
            )
        );

    }
);

app.get(
    '/developer/master',
    requireDeveloperPage,
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'developer',
                'super-master-key-v92.html'
            )
        );

    }
);

app.get(
    '/developer/logout',
    (req, res) => {

        clearDeveloperCookie(
            req,
            res
        );

        res.redirect(
            '/developer/login'
        );

    }
);

/*
=========================================================
  DEVELOPER - COMPANIES
=========================================================
*/

app.get(
    '/api/developer/companies',
    requireDeveloper,
    async (req, res) => {

        try {

            const companies =
                await Company
                    .find()
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            const report =
                companies.map(
                    buildCompanyReport
                );

            res.json({

                success: true,

                companies:
                    companies.map(
                        publicCompany
                    ),

                report

            });

        } catch (err) {

            res.status(500).json({

                success: false,

                error:
                    err.message

            });

        }

    }
);


/*
=========================================================
  DEVELOPER - COMPANY REPORT
=========================================================
*/

app.get(
    '/api/developer/company-report/:companyId',
    requireDeveloper,
    async (req, res) => {

        try {

            const companyId =
                String(
                    req.params.companyId ||
                    ''
                ).trim();

            const company =
                await Company
                    .findOne({
                        companyId
                    })
                    .lean();

            if (!company) {

                return res.status(404).json({

                    success: false,

                    message:
                        'الشركة غير موجودة'

                });

            }

            res.json({

                success: true,

                report:
                    buildCompanyReport(
                        company
                    )

            });

        } catch (err) {

            res.status(500).json({

                success: false,

                error:
                    err.message

            })…56317 tokens truncated…                    title: String(req.body.title || '').trim(),
                    documentType: String(req.body.documentType || 'other').trim(),
                    note: String(req.body.note || '').trim()
                }
            },
            { new: true, runValidators: true }
        );
        if (!record) {
            return res.status(404).json({ success: false, message: 'الوثيقة غير موجودة' });
        }
        return res.json({ success: true, record });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/admin/archive/employee-documents/:id', requireAdmin, async (req, res) => {
    try {
        const record = await ArchiveRecord.findOne({
            _id: req.params.id,
            companyId: req.session.companyId,
            category: 'employee_document'
        }).lean();
        if (!record) {
            return res.status(404).json({ success: false, message: 'الوثيقة غير موجودة' });
        }
        await ArchiveRecord.deleteOne({
            _id: record._id,
            companyId: req.session.companyId,
            category: 'employee_document'
        });

        if (record.fileUrl) {
            const filename = path.basename(record.fileUrl);
            const filePath = path.join(__dirname, 'uploads', filename);
            await fs.promises.unlink(filePath).catch(err => {
                if (err.code !== 'ENOENT') {
                    console.warn('تعذر حذف ملف الوثيقة:', err.message);
                }
            });
        }
        return res.json({ success: true, message: 'تم حذف الوثيقة' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/archive/snapshots', requireAdmin, async (req, res) => {
    try {
        const companyId = req.session.companyId;
        const snapshotId = crypto.randomUUID();
        const sources = [
            ['Employee', Employee],
            ['Attendance', Attendance],
            ['SalaryRecord', SalaryRecord],
            ['PayrollBatch', PayrollBatch],
            ['LoanRecord', LoanRecord],
            ['ServiceRequest', ServiceRequest],
            ['EmployeeEvaluation', EmployeeEvaluation],
            ['DailyWorkerRecord', DailyWorkerRecord],
            ['Notification', Notification]
        ];
        let archivedCount = 0;

        for (const [sourceType, Model] of sources) {
            const items = await Model.find({ companyId }).lean();
            if (!items.length) continue;
            await ArchiveRecord.insertMany(items.map(item => ({
                companyId,
                category: 'information',
                sourceType,
                sourceId: String(item._id || ''),
                snapshotId,
                employeeId: String(item.employeeId || (sourceType === 'Employee' ? item._id : '') || ''),
                employeeName: item.employeeName || item.name || '',
                title: `${sourceType} - ${item.employeeName || item.name || item._id}`,
                payload: item,
                archivedBy: req.session.username || 'admin'
            })));
            archivedCount += items.length;
        }

        const operation = await new ArchiveRecord({
            companyId,
            category: 'operation',
            sourceType: 'SystemSnapshot',
            sourceId: snapshotId,
            snapshotId,
            title: 'حفظ نسخة أرشيفية شاملة للنظام',
            note: String(req.body.note || '').trim(),
            payload: { archivedCount, sources: sources.map(([name]) => name) },
            archivedBy: req.session.username || 'admin'
        }).save();

        return res.status(201).json({
            success: true,
            snapshotId,
            archivedCount,
            operation
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/*
=========================================================
  NOTIFICATIONS
=========================================================
*/

app.post(
    '/api/admin/notifications',
    requireAdmin,
    upload.single('audio'),
    async (req, res) => {

        try {
            const targetType = String(req.body.targetType || 'employee').trim();
            const employeeId = String(req.body.employeeId || '').trim();
            const branch = String(req.body.branch || '').trim();

            if (!['employee', 'branch', 'all'].includes(targetType)) {
                return res.status(400).json({ success: false, message: 'نوع المستلمين غير صحيح' });
            }

            const employeeQuery = { companyId: req.session.companyId };
            if (targetType === 'employee') employeeQuery._id = employeeId;
            if (targetType === 'branch') {
                if (!branch) {
                    return res.status(400).json({ success: false, message: 'اختر الفرع' });
                }
                employeeQuery.$or = [{ workplace: branch }, { branch }];
            }

            const employees = await Employee.find(employeeQuery).lean();
            if (!employees.length) {
                return res.status(404).json({ success: false, message: 'لا يوجد موظفون مطابقون' });
            }

            const message =
                String(
                    req.body.message ||
                    ''
                ).trim();

            const audioUrl =
                req.file
                    ? `/uploads/${req.file.filename}`
                    : '';

            if (
                !message &&
                !audioUrl
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'أدخل نص الإشعار أو أرفق رسالة صوتية'

                });
            }

            const priority = req.body.priority === 'urgent' ? 'urgent' : 'normal';
            const scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;
            if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
                return res.status(400).json({ success: false, message: 'موعد الإرسال غير صحيح' });
            }

            const campaignId = crypto.randomUUID();
            const targetLabel = targetType === 'all'
                ? 'جميع الموظفين'
                : targetType === 'branch'
                    ? branch
                    : employees[0].name || '';

            const notifications = await Notification.insertMany(
                employees.map(employee => ({
                    companyId: employee.companyId,
                    employeeId: String(employee._id),
                    type: audioUrl ? 'voice' : 'text',
                    message,
                    audioUrl,
                    priority,
                    targetType,
                    targetLabel,
                    campaignId,
                    scheduledAt
                }))
            );

            res.status(201).json({
                success: true,
                count: notifications.length,
                notifications
            });

        } catch (err) {

            res.status(500).json({

                success: false,

                error:
                    err.message

            });

        }

    }
);

app.get(
    '/api/admin/notifications',
    requireAdmin,
    async (req, res) => {
        try {
            const query = {
                companyId: req.session.companyId
            };

            const employeeId =
                String(req.query.employeeId || '').trim();

            if (employeeId) {
                query.employeeId = employeeId;
            }

            const notifications =
                await Notification.find(query)
                    .sort({ createdAt: -1 })
                    .limit(500)
                    .lean();

            const employeeIds = [
                ...new Set(
                    notifications.map(item => item.employeeId)
                )
            ];

            const employees =
                await Employee.find({
                    companyId: req.session.companyId,
                    _id: { $in: employeeIds }
                })
                    .select('name branch workplace')
                    .lean();

            const employeeMap = new Map(
                employees.map(employee => [
                    String(employee._id),
                    employee
                ])
            );

            return res.json({
                success: true,
                notifications:
                    notifications.map(item => ({
                        ...item,
                        audioUrl:
                            signedMediaUrl(
                                item.audioUrl
                            ),
                        employeeName:
                            employeeMap.get(item.employeeId)?.name || '',
                        workplace:
                            employeeMap.get(item.employeeId)?.workplace ||
                            employeeMap.get(item.employeeId)?.branch || ''
                    }))
            });
        } catch (err) {
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }
);

app.put('/api/admin/notifications/:id', requireAdmin, async (req, res) => {
    try {
        const notification = await Notification.findOne({
            _id: req.params.id,
            companyId: req.session.companyId
        });
        if (!notification) {
            return res.status(404).json({ success: false, message: 'الإشعار غير موجود' });
        }
        if (req.body.message !== undefined) {
            notification.message = String(req.body.message || '').trim();
        }
        if (req.body.priority !== undefined) {
            notification.priority = req.body.priority === 'urgent' ? 'urgent' : 'normal';
        }
        if (req.body.scheduledAt !== undefined) {
            notification.scheduledAt = req.body.scheduledAt
                ? new Date(req.body.scheduledAt)
                : null;
        }
        if (!notification.message && !notification.audioUrl) {
            return res.status(400).json({ success: false, message: 'لا يمكن حفظ إشعار فارغ' });
        }
        await notification.save();
        return res.json({ success: true, notification });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/admin/notifications/:id', requireAdmin, async (req, res) => {
    try {
        const notification = await Notification.findOneAndDelete({
            _id: req.params.id,
            companyId: req.session.companyId
        });
        if (!notification) {
            return res.status(404).json({ success: false, message: 'الإشعار غير موجود' });
        }
        return res.json({ success: true, message: 'تم حذف الإشعار' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/employee/notifications/:id/status', async (req, res) => {
    try {
        const employeeId = String(req.body.employeeId || '').trim();
        const deviceId = String(req.body.deviceId || '').trim();
        const employee = await Employee.findById(employeeId).lean();
        if (!employee || !deviceId || employee.deviceId !== deviceId) {
            return res.status(403).json({ success: false, message: 'لا يمكن تحديث الإشعار من هذا الجهاز' });
        }
        const update = {};
        if (req.body.read === true) update.readAt = new Date();
        if (req.body.listened === true) {
            update.readAt = new Date();
            update.listenedAt = new Date();
        }
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, employeeId },
            { $set: update },
            { new: true }
        );
        if (!notification) {
            return res.status(404).json({ success: false, message: 'الإشعار غير موجود' });
        }
        return res.json({ success: true, notification });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});


app.get(
    '/api/employee/notifications',
    async (req, res) => {

        try {

            const employeeId =
                String(
                    req.query.employeeId ||
                    ''
                ).trim();

            const deviceId =
                String(
                    req.query.deviceId ||
                    ''
                ).trim();

            const employee =
                await Employee.findById(
                    employeeId
                ).lean();

            if (
                !employee ||
                !deviceId ||
                employee.deviceId !==
                    deviceId
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        'لا يمكن قراءة الإشعارات من هذا الجهاز'

                });

            }

            await Company.updateOne(

                {
                    companyId:
                        employee.companyId
                },

                {
                    $set: {
                        lastSeenAt:
                            new Date()
                    }
                }

            );

            const notifications =
                await Notification
                    .find({
                        employeeId,
                        $or: [
                            { scheduledAt: null },
                            { scheduledAt: { $exists: false } },
                            { scheduledAt: { $lte: new Date() } }
                        ]
                    })
                    .sort({
                        createdAt: -1
                    })
                    .limit(50)
                    .lean();

            res.json({

                success: true,

                notifications:
                    notifications.map(
                        notification => ({
                            ...notification,
                            audioUrl:
                                signedMediaUrl(
                                    notification.audioUrl
                                )
                        })
                    )

            });

        } catch (err) {

            res.status(500).json({

                success: false,

                error:
                    err.message

            });

        }

    }
);


/*
=========================================================
  GPS
=========================================================
*/

function haversineMeters(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const toRad =
        value =>
            value *
            Math.PI /
            180;

    const R =
        6371000;

    const dLat =
        toRad(
            lat2 - lat1
        );

    const dLon =
        toRad(
            lon2 - lon1
        );

    const a =
        Math.sin(
            dLat / 2
        ) ** 2 +

        Math.cos(
            toRad(lat1)
        ) *

        Math.cos(
            toRad(lat2)
        ) *

        Math.sin(
            dLon / 2
        ) ** 2;

    return (
        2 *
        R *
        Math.asin(
            Math.sqrt(a)
        )
    );

}

function validGeoPoint(latitude, longitude) {
    return Number.isFinite(Number(latitude)) &&
        Number(latitude) >= -90 &&
        Number(latitude) <= 90 &&
        Number.isFinite(Number(longitude)) &&
        Number(longitude) >= -180 &&
        Number(longitude) <= 180 &&
        !(Number(latitude) === 0 && Number(longitude) === 0);
}

function companyLocationById(company, locationId) {
    const id = String(locationId || '').trim();
    if (!id) return null;

    if (id === 'headquarters') {
        if (!validGeoPoint(company.latitude, company.longitude)) return null;
        return {
            _id: 'headquarters',
            name: company.name || 'المقر الرئيسي',
            branch: company.name || 'المقر الرئيسي',
            latitude: Number(company.latitude),
            longitude: Number(company.longitude),
            radiusMeters: Number(company.geofenceRadiusMeters) > 0
                ? Number(company.geofenceRadiusMeters)
                : 200,
            active: true
        };
    }

    const location = (company.approvedLocations || []).find(item =>
        String(item._id) === id ||
        String(item.clientOfflineId || '') === id
    );
    if (!location || location.active === false ||
        !validGeoPoint(location.latitude, location.longitude)) {
        return null;
    }

    return {
        _id: String(location._id),
        name: String(location.name || '').trim(),
        branch: String(location.name || '').trim(),
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        radiusMeters: Number(location.radiusMeters) > 0
            ? Number(location.radiusMeters)
            : 200,
        active: true
    };
}

function resolveShiftLocation(company, shift) {
    const byId = companyLocationById(company, shift.locationId);
    if (byId) return byId;

    // Legacy shifts may be linked only by an exact, unique old name.
    const legacyName = String(shift.locationName || shift.branch || '').trim();
    if (!legacyName) return null;
    const candidates = [];
    if (String(company.name || '').trim() === legacyName) candidates.push('headquarters');
    for (const location of company.approvedLocations || []) {
        if (String(location.name || '').trim() === legacyName) candidates.push(String(location._id));
    }
    if (candidates.length !== 1) return null;
    return companyLocationById(company, candidates[0]);
}


/*
=========================================================
  ATTENDANCE BIOMETRIC CHALLENGES

  تحديات بصمة أحادية الاستخدام:
  لا يمكن إرسال حضور بدون تحدي صادر من السيرفر
  ومرتبط بالموظف وجهازه، وصلاحيته دقيقتان.
=========================================================
*/

const attendanceChallenges = new Map();

const CHALLENGE_TTL_MS = 2 * 60 * 1000;

function issueAttendanceChallenge(employeeId, deviceId) {
    const challengeId = require('crypto').randomBytes(16).toString('hex');
    const nonce = require('crypto').randomBytes(32);
    attendanceChallenges.set(challengeId, {
        nonce: nonce.toString('hex'),
        employeeId,
        deviceId,
        expiresAt: Date.now() + CHALLENGE_TTL_MS,
        used: false
    });
    return {
        challengeId,
        challenge: nonce.toString('base64url'),
        expiresInSeconds: CHALLENGE_TTL_MS / 1000
    };
}

function consumeAttendanceChallenge(challengeId, employeeId, deviceId) {
    const c = attendanceChallenges.get(String(challengeId || ''));
    if (!c) return { ok: false, reason: 'تحدي البصمة غير موجود. أعد المحاولة.' };
    if (c.used) return { ok: false, reason: 'تحدي البصمة مستخدم مسبقاً. أعد المحاولة.' };
    if (Date.now() > c.expiresAt) {
        attendanceChallenges.delete(challengeId);
        return { ok: false, reason: 'انتهت صلاحية تحدي البصمة. أعد المحاولة.' };
    }
    if (c.employeeId !== String(employeeId) || c.deviceId !== String(deviceId)) {
        return { ok: false, reason: 'تحدي البصمة لا يطابق هذا الموظف/الجهاز.' };
    }
    c.used = true;
    setTimeout(() => attendanceChallenges.delete(challengeId), CHALLENGE_TTL_MS);
    return { ok: true };
}

function shiftTimeInMinutes(value) {
    const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value || '').trim());
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function clockPlusMinutes(value, extraMinutes) {
    const minutes = shiftTimeInMinutes(value);
    if (minutes === null) return '';
    const result = (minutes + Number(extraMinutes || 0) + 24 * 60) % (24 * 60);
    return `${String(Math.floor(result / 60)).padStart(2, '0')}:${String(result % 60).padStart(2, '0')}`;
}

function isWithinShiftWindow(timestamp, start, end) {
    const startMinutes = shiftTimeInMinutes(start);
    const endMinutes = shiftTimeInMinutes(end);
    if (startMinutes === null || endMinutes === null) return false;
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(timestamp);
    const minutes = Number(parts.find(part => part.type === 'hour').value) * 60 +
        Number(parts.find(part => part.type === 'minute').value);
    return startMinutes <= endMinutes
        ? minutes >= startMinutes && minutes <= endMinutes
        : minutes >= startMinutes || minutes <= endMinutes;
}

function isBeforeShiftWindow(timestamp, start, end) {
    const startMinutes = shiftTimeInMinutes(start);
    const endMinutes = shiftTimeInMinutes(end);
    if (startMinutes === null || endMinutes === null) return false;
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(timestamp);
    const minutes = Number(parts.find(part => part.type === 'hour').value) * 60 +
        Number(parts.find(part => part.type === 'minute').value);
    return startMinutes <= endMinutes
        ? minutes < startMinutes
        : minutes > endMinutes && minutes < startMinutes;
}

function attendanceClockMinutes(timestamp) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(timestamp);
    return Number(parts.find(part => part.type === 'hour').value) * 60 +
        Number(parts.find(part => part.type === 'minute').value);
}

function minutesAfterClock(timestamp, clock) {
    const clockMinutes = shiftTimeInMinutes(clock);
    if (clockMinutes === null) return 0;
    let difference = attendanceClockMinutes(timestamp) - clockMinutes;
    if (difference < -720) difference += 24 * 60;
    return Math.max(0, difference);
}

async function attendanceRequirementForEmployee(employee, at = new Date()) {
    const dayStart = new Date(at);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(at);
    dayEnd.setHours(23, 59, 59, 999);
    const leave = await ServiceRequest.findOne({
        companyId: employee.companyId,
        employeeId: String(employee._id),
        type: 'leave',
        status: 'approved',
        $or: [
            { fromDate: { $lte: dayEnd }, toDate: { $gte: dayStart } },
            { requestedDate: { $gte: dayStart, $lte: dayEnd } }
        ]
    }).lean();
    if (leave) {
        const paid = leave.leavePaymentType !== 'unpaid';
        return {
            requiresAttendance: false,
            code: paid ? 'PAID_LEAVE' : 'UNPAID_LEAVE',
            message: paid
                ? 'الموظف في إجازة براتب اليوم ولا تُطلب منه البصمة'
                : 'الموظف في إجازة بدون راتب اليوم ولا تُطلب منه البصمة',
            leavePaymentType: leave.leavePaymentType || 'paid'
        };
    }
    const candidates = await DailyWorkerRecord.find({
        companyId: employee.companyId,
        replacementForEmployeeId: String(employee._id),
        workDate: { $lte: dayEnd }
    }).sort({ workDate: -1 }).limit(100).lean();
    const replacement = candidates.find(item => {
        const start = new Date(item.workDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + Math.max(1, Number(item.days || 1)) - 1);
        end.setHours(23, 59, 59, 999);
        return at >= start && at <= end;
    });
    if (replacement) {
        return {
            requiresAttendance: false,
            code: 'REPLACED',
            message: `تم تعيين ${replacement.workerName || 'موظف بديل'} بديلًا اليوم؛ لا تُطلب البصمة من الموظف الأصلي`
        };
    }
    const delegation = employee.delegation || {};
    const activeDelegation = delegation.active && delegation.from && delegation.to &&
        at >= new Date(delegation.from) && at <= new Date(delegation.to);
    return {
        requiresAttendance: true,
        code: activeDelegation ? 'DELEGATION' : 'REGULAR',
        message: activeDelegation
            ? `البصمة مطلوبة في موقع الإيفاد: ${delegation.locationName || delegation.province || 'الموقع المعتمد'}`
            : 'البصمة مطلوبة حسب الشفت وموقع العمل'
    };
}

app.get('/api/employee/attendance-requirement', async (req, res) => {
    try {
        const employeeId = String(req.query.employeeId || '').trim();
        const deviceId = String(req.query.deviceId || '').trim();
        const employee = await Employee.findById(employeeId).lean();
        if (!employee || !employee.deviceId || employee.deviceId !== deviceId) {
            return res.status(403).json({ success: false, message: 'هذا الجهاز غير مرتبط بالموظف' });
        }
        return res.json({ success: true, ...(await attendanceRequirementForEmployee(employee)) });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/employee/location', async (req, res) => {
    try {
        const employeeId = String(req.body.employeeId || '').trim();
        const companyId = String(req.body.companyId || '').trim();
        const deviceId = String(req.body.deviceId || '').trim();
        const latitude = Number(req.body.latitude);
        const longitude = Number(req.body.longitude);
        const timestamp = req.body.timestamp ? new Date(req.body.timestamp) : new Date();

        if (!employeeId || !companyId || !deviceId ||
            !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
            !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
            (latitude === 0 && longitude === 0) || Number.isNaN(timestamp.getTime())) {
            return res.status(400).json({ success: false, message: 'بيانات الموقع غير صحيحة' });
        }

        const employee = await Employee.findOne({ _id: employeeId, companyId, deviceId });
        if (!employee) {
            return res.status(403).json({ success: false, message: 'هذا الجهاز غير مرتبط بالموظف' });
        }

        employee.lastKnownLocation = { latitude, longitude, timestamp };
        await employee.save();
        return res.json({ success: true, message: 'تم حفظ الموقع الحالي' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.get(
    '/api/attendance/challenge',
    async (req, res) => {

        try {

            const employeeId =
                String(req.query.employeeId || '').trim();

            const deviceId =
                String(req.query.deviceId || '').trim();

            if (!employeeId || !deviceId) {
                return res.status(400).json({
                    success: false,
                    message: 'employeeId وdeviceId مطلوبان'
                });
            }

            const employee =
                await Employee.findById(employeeId).lean();

            if (
                !employee ||
                !employee.deviceId ||
                employee.deviceId !== deviceId
            ) {
                return res.status(403).json({
                    success: false,
                    message: 'هذا الجهاز غير مرتبط بالموظف'
                });
            }

            const requirement = await attendanceRequirementForEmployee(employee);
            if (!requirement.requiresAttendance) {
                return res.status(409).json({
                    success: false,
                    ...requirement
                });
            }

            res.json({
                success: true,
                ...issueAttendanceChallenge(employeeId, deviceId)
            });

        } catch (err) {
            res.status(500).json({
                success: false,
                error: err.message
            });
        }

    }
);


/*
=========================================================
  ATTENDANCE
=========================================================
*/

app.post(
    '/api/attendance',
    async (req, res) => {

        try {

            const employeeId =
                String(
                    req.body.employeeId ||
                    ''
                ).trim();

            const deviceId =
                String(
                    req.body.deviceId ||
                    ''
                ).trim();

            const fingerprintToken =
                String(
                    req.body.fingerprintToken ||
                    ''
                ).trim();

            const type =
                String(
                    req.body.type ||
                    'attendance'
                ).trim();

            const latitude =
                Number(
                    req.body.latitude
                );

            const longitude =
                Number(
                    req.body.longitude
                );

            const challengeId =
                String(
                    req.body.challengeId ||
                    ''
                ).trim();

            if (
                !employeeId ||
                !deviceId ||
                !fingerprintToken
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'employeeId وdeviceId ونجاح التحقق بالبصمة مطلوبة'

                });

            }

            if (
                !Number.isFinite(
                    latitude
                ) ||
                latitude < -90 ||
                latitude > 90 ||
                !Number.isFinite(
                    longitude
                ) ||
                longitude < -180 ||
                longitude > 180
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'إحداثيات GPS غير صحيحة'

                });

            }

            const employee =
                await Employee.findById(
                    employeeId
                ).lean();

            if (!employee) {

                return res.status(404).json({

                    success: false,

                    message:
                        'الموظف غير موجود'

                });

            }

            /*
             * التحقق الحقيقي من البصمة:
             * لا يُقبل حضور بدون تحدي بصمة صالح صادر
             * من السيرفر لهذا الموظف/الجهاز ولم يُستخدم.
             */
            const challengeCheck =
                consumeAttendanceChallenge(
                    challengeId,
                    employeeId,
                    deviceId
                );

            if (!challengeCheck.ok) {

                return res.status(403).json({

                    success: false,

                    message:
                        challengeCheck.reason

                });

            }

            if (
                !employee.deviceId ||
                employee.deviceId !==
                    deviceId
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        'هذا الجهاز غير مرتبط بالموظف'

                });

            }

            const company =
                await Company.findOne({

                    companyId:
                        employee.companyId

                });

            if (!company) {

                return res.status(404).json({

                    success: false,

                    message:
                        'الشركة غير موجودة'

                });

            }

            if (
                company.systemState !==
                'active'
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        'الشركة متوقفة حالياً'

                });

            }

            if (
                company.subscriptionEndDate &&
                new Date(
                    company.subscriptionEndDate
                ) < new Date()
            ) {

                company.systemState =
                    'expired';

                await company.save();

                return res.status(403).json({

                    success: false,

                    message:
                        'اشتراك الشركة منتهي'

                });

            }

            /*
             * وقت العملية المعتمد.
             */
            let attendanceTime =
                req.body.timestamp
                    ? new Date(req.body.timestamp)
                    : new Date();

            if (
                Number.isNaN(
                    attendanceTime.getTime()
                )
            ) {
                attendanceTime = new Date();
            }

            /*
             * الإيفاد يكون فعّالاً فقط داخل الفترة المحددة.
             */
            const delegation =
                employee.delegation || {};

            const delegationFrom =
                delegation.from
                    ? new Date(delegation.from)
                    : null;

            const delegationTo =
                delegation.to
                    ? new Date(delegation.to)
                    : null;

            const activeDelegation =
                delegation.active === true &&
                delegationFrom &&
                delegationTo &&
                !Number.isNaN(delegationFrom.getTime()) &&
                !Number.isNaN(delegationTo.getTime()) &&
                attendanceTime >= delegationFrom &&
                attendanceTime <= delegationTo;

            /*
             * تحديد الشفت المرتبط بالموظف.
             */
            const shiftCandidates =
                await Shift.find({
                    companyId: employee.companyId,
                    employeeIds: String(employee._id)
                }).sort({ createdAt: 1, _id: 1 }).lean();
            const shift = shiftCandidates.find(candidate => {
                const start = type === 'attendance'
                    ? candidate.attendanceStart
                    : candidate.departureStart;
                const end = type === 'attendance'
                    ? candidate.attendanceEnd
                    : candidate.departureEnd;
                return isWithinShiftWindow(attendanceTime, start, end) ||
                    (type === 'attendance' && isWithinShiftWindow(attendanceTime, candidate.lateFrom, candidate.lateTo));
            }) || shiftCandidates[0] || null;

            /*
             * الموظف العادي يجب أن يمتلك شفتاً.
             * الموظف الموفد يمكنه التسجيل أثناء فترة الإيفاد
             * حتى لو لم يكن وقت الشفت الحالي مناسباً.
             */
            if (!shift && !activeDelegation) {

                return res.status(403).json({

                    success: false,

                    message:
                        'لا يوجد شفت مسجل لهذا الموظف'

                });

            }

            /*
             * التحقق من وقت الشفت.
             * attendance = حضور
             * exit / departure = انصراف
             */
            const isCheckIn =
                type === 'attendance';

            const shiftStart =
                shift
                    ? (
                        isCheckIn
                            ? shift.attendanceStart
                            : shift.departureStart
                    )
                    : '';

            const shiftEnd =
                shift
                    ? (
                        isCheckIn
                            ? shift.attendanceEnd
                            : shift.departureEnd
                    )
                    : '';

            let earlyExitPending = false;
            let checkInTimeStatus = 'within-shift';
            let lateMinutes = 0;

            if (!activeDelegation) {

                if (
                    !shiftStart ||
                    !shiftEnd
                ) {

                    return res.status(403).json({

                        success: false,

                        message:
                            isCheckIn
                                ? 'أوقات الحضور غير محددة لهذا الشفت'
                                : 'أوقات الانصراف غير محددة لهذا الشفت'

                    });

                }

                if (isCheckIn && !isWithinShiftWindow(attendanceTime, shiftStart, shiftEnd)) {
                    if (isBeforeShiftWindow(attendanceTime, shiftStart, shiftEnd)) {
                        return res.status(403).json({ success: false, message: 'أنت خارج وقت الشفت.' });
                    }
                    const lateFrom = shift.lateFrom || '';
                    const lateTo = shift.lateTo || '';
                    if (!lateFrom || !lateTo) {
                        return res.status(403).json({
                            success: false,
                            message: 'فترة التأخير غير محددة لهذا الشفت'
                        });
                    }
                    lateMinutes = minutesAfterClock(attendanceTime, shiftEnd);
                    if (isWithinShiftWindow(attendanceTime, lateFrom, lateTo)) {
                        checkInTimeStatus = 'late';
                    } else if (isWithinShiftWindow(attendanceTime, lateTo, shift.departureEnd)) {
                        checkInTimeStatus = 'absent-late';
                    } else {
                        return res.status(403).json({ success: false, message: 'أنت خارج وقت الشفت.' });
                    }
                } else if (!isCheckIn && !isWithinShiftWindow(attendanceTime, shiftStart, shiftEnd)) {

                    if (!isCheckIn && isBeforeShiftWindow(attendanceTime, shiftStart, shiftEnd)) {
                        earlyExitPending = true;
                    } else {

                        return res.status(403).json({

                            success: false,

                            message:
                                'أنت خارج وقت الشفت.'

                        });
                    }

                }

            }

            /*
             * التحقق من الموقع:
             *
             * الموظف العادي:
             *   يجب أن يكون داخل أحد مواقع الشركة المعتمدة.
             *
             * الموظف الموفد:
             *   يسمح له بالتسجيل خارج مواقع الشركة.
             *   وإذا حدد المدير موقعاً جغرافياً للإيفاد
             *   فيجب أن يكون داخل نطاق ذلك الموقع.
             */
            let matchedLocation = null;
            let nearestDistance = null;

            if (activeDelegation) {

                const delegationLat =
                    Number(delegation.latitude);

                const delegationLng =
                    Number(delegation.longitude);

                const delegationRadius =
                    Number(delegation.radiusMeters) > 0
                        ? Number(delegation.radiusMeters)
                        : 200;

                /*
                 * إذا حدد المدير إحداثيات للإيفاد،
                 * نتحقق من وجود الموظف داخل نطاق الإيفاد.
                 */
                if (
                    Number.isFinite(delegationLat) &&
                    Number.isFinite(delegationLng)
                ) {

                    const delegationDistance =
                        haversineMeters(
                            latitude,
                            longitude,
                            delegationLat,
                            delegationLng
                        );

                    if (
                        delegationDistance >
                        delegationRadius
                    ) {

                        return res.status(403).json({

                            success: false,

                            message:
                                `فشل تسجيل البصمة: الموظف خارج موقع الإيفاد المحدد (${Math.round(delegationDistance)}م)`

                        });

                    }

                    matchedLocation = {

                        name:
                            delegation.locationName ||
                            delegation.province ||
                            'موقع الإيفاد',

                        latitude:
                            delegationLat,

                        longitude:
                            delegationLng,

                        radiusMeters:
                            delegationRadius

                    };

                } else {

                    /*
                     * إيفاد بدون إحداثيات:
                     * يسمح بالبصمة خارج مواقع الشركة
                     * لأن المدير اعتمد الإيفاد مسبقاً.
                     */
                    matchedLocation = {

                        name:
                            delegation.locationName ||
                            delegation.province ||
                            'إيفاد خارجي',

                        latitude,
                        longitude,
                        radiusMeters: 0

                    };

                }

            } else {
                const shiftLocation = resolveShiftLocation(company, shift);
                if (!shiftLocation) {
                    return res.status(403).json({
                        success: false,
                        message: 'فشل تسجيل البصمة: موقع الشفت غير محدد أو لا يملك إحداثيات صالحة'
                    });
                }

                nearestDistance = haversineMeters(
                    latitude,
                    longitude,
                    shiftLocation.latitude,
                    shiftLocation.longitude
                );

                if (nearestDistance > shiftLocation.radiusMeters) {
                    return res.status(403).json({
                        success: false,
                        distanceMeters: Math.round(nearestDistance),
                        message: `فشل تسجيل البصمة: أنت خارج نطاق موقع الشفت (${Math.round(nearestDistance)}م)`
                    });
                }

                matchedLocation = shiftLocation;
            }

            /*
             * منع تكرار نفس عملية البصمة خلال دقيقتين.
             * يحمي من الضغط المتكرر أو إعادة إرسال الطلب.
             */
            const duplicateSince =
                new Date(
                    attendanceTime.getTime() -
                    (2 * 60 * 1000)
                );

            const duplicateAttendance =
                await Attendance.findOne({

                    companyId:
                        employee.companyId,

                    employeeId:
                        String(employee._id),

                    type,

                    timestamp: {
                        $gte: duplicateSince,
                        $lte: attendanceTime
                    }

                }).lean();

            if (duplicateAttendance) {

                return res.status(409).json({

                    success: false,

                    message:
                        isCheckIn
                            ? 'تم تسجيل حضور الموظف مسبقاً قبل قليل'
                            : 'تم تسجيل انصراف الموظف مسبقاً قبل قليل'

                });

            }

            const attendance =
                await new Attendance({

                    employeeId:
                        String(
                            employee._id
                        ),

                    employeeName:
                        employee.name || '',

                    companyId:
                        employee.companyId,

                    attendanceStatus:
                        activeDelegation
                            ? 'delegation'
                            : 'normal',

                    delegationApplied:
                        activeDelegation,

                    delegationReason:
                        activeDelegation
                            ? String(delegation.reason || '')
                            : '',

                    delegationProvince:
                        activeDelegation
                            ? String(delegation.province || '')
                            : '',

                    delegationLocationName:
                        activeDelegation
                            ? String(delegation.locationName || '')
                            : '',

                    locationStatus:
                        activeDelegation
                            ? 'delegation'
                            : 'approved',

                    timeStatus:
                        activeDelegation
                            ? 'delegation'
                            : earlyExitPending
                                ? 'early-exit-pending'
                                : checkInTimeStatus,

                    lateMinutes,

                    managerApprovalStatus:
                        earlyExitPending
                            ? 'pending'
                            : 'not-required',

                    deviceId,

                    fingerprintToken,

                    verificationMethod:
                        'device-biometric',

                    shiftId:
                        shift
                            ? String(shift._id)
                            : '',

                    shiftName:
                        shift
                            ? (shift.name || '')
                            : '',

                    workplace:
                        matchedLocation
                            ? matchedLocation.name
                            : shift.branch || employee.workplace || '',

                    latitude,

                    longitude,

                    timestamp:
                        attendanceTime,

                    type

                }).save();

            /*
             * أهم نقطة:
             * نجاح البصمة + الجهاز + GPS
             * يعتبر اتصالاً حقيقياً للشركة.
             */
            company.lastSeenAt =
                new Date();

            await company.save();

            res.status(201).json({

                success: true,

                message:
                    earlyExitPending
                        ? 'تم تسجيل الخروج المبكر وهو بانتظار موافقة المدير'
                        : checkInTimeStatus === 'absent-late'
                            ? 'تم تسجيل البصمة، ويُحتسب اليوم غياباً لتجاوز مهلة التأخير'
                            : checkInTimeStatus === 'late'
                                ? `تم تسجيل الحضور متأخراً ${lateMinutes} دقيقة وسيُخصم التأخير من الراتب`
                        : 'تم تسجيل الحضور بالبصمة والجهاز والموقع وحفظه في MongoDB',

                attendanceId:
                    attendance._id,
                distanceMeters:
                    nearestDistance === null
                        ? null
                        : Math.round(nearestDistance),
                timeStatus: attendance.timeStatus,
                lateMinutes: attendance.lateMinutes

            });

        } catch (err) {

            res.status(500).json({

                success: false,

                error:
                    err.message

            });

        }

    }
);


/*
=========================================================
  ATTENDANCE HISTORY
=========================================================
*/

app.get(
    '/api/employees/:employeeId/attendance',
    async (req, res) => {

        try {

            const attendance =
                await Attendance
                    .find({
                        employeeId:
                            req.params.employeeId
                    })
                    .sort({
                        timestamp: -1
                    })
                    .limit(100)
                    .lean();

            res.json({

                success: true,

                attendance

            });

        } catch (err) {

            res.status(500).json({

                success: false,

                error:
                    err.message

            });

        }

    }
);


/*
=========================================================
  LOAN
=========================================================
*/

app.post(
    '/api/employees/:employeeId/loan',
    requireAdmin,
    async (req, res) => {

        try {

            const employee =
                await Employee.findOne({
                    _id:
                        req.params.employeeId,
                    companyId:
                        req.session.companyId
                });

            if (!employee) {

                return res.status(404).json({

                    success: false,

                    message:
                        'الموظف غير موجود'

                });

            }

            const loanAmount =
                parseFloat(
                    req.body.loanAmount
                );

            const monthlyInstallment =
                parseFloat(
                    req.body.monthlyInstallment
                );

            if (
                !Number.isFinite(
                    loanAmount
                ) ||
                !Number.isFinite(
                    monthlyInstallment
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'بيانات السلفة غير صحيحة'

                });

            }

            employee.loans.push({

                loanAmount,

                monthlyInstallment,

                remainingAmount:
                    loanAmount

            });

            await employee.save();

            res.json({

                success: true,

                message:
                    'تم إضافة السلفة بنجاح',

                employee:
                    employeeWithSignedMedia(
                        employee
                    )

            });

        } catch (err) {

            res.status(500).json({

                success: false,

                error:
                    err.message

            });

        }

    }
);


/*
=========================================================
  LOAN DEDUCTION
=========================================================
*/

app.get(
    '/api/employees/:employeeId/loan-deduction',
    async (req, res) => {

        try {

            const employee =
                await Employee.findById(
                    req.params.employeeId
                );

            if (!employee) {

                return res.status(404).json({

                    success: false,

                    message:
                        'الموظف غير موجود'

                });

            }

            const totalMonthlyDeduction =
                (
                    employee.loans ||
                    []
                ).reduce(

                    (
                        sum,
                        loan
                    ) =>
                        sum +
                        (
                            loan.remainingAmount >
                            0
                                ? loan.monthlyInstallment
                                : 0
                        ),

                    0

                );

            res.json({

                success: true,

                employeeId:
                    employee._id,

                totalMonthlyDeduction

            });

        } catch (err) {

            res.status(500).json({

                success: false,

                error:
                    err.message

            });

        }

    }
);


/*
=========================================================
  INDEX MIGRATION
=========================================================
*/

async function migrateCompanyIndexes() {

    try {

        const indexes =
            await Company.collection
                .indexes();

        const legacyIdIndex =
            indexes.find(
                index =>
                    index.name ===
                    'id_1'
            );

        if (legacyIdIndex) {

            await Company.collection
                .dropIndex(
                    legacyIdIndex.name
                );

            console.log(
                'ℹ️ تمت إزالة فهرس الشركة القديم id_1'
            );

        }

        await Company.collection
            .createIndex(

                {
                    companyId: 1
                },

                {
                    unique: true,

                    name:
                        'companyId_1'
                }

            );

        await Company.collection
            .createIndex(

                {
                    lastSeenAt: 1
                },

                {
                    name:
                        'lastSeenAt_1'
                }

            );

    } catch (error) {

        console.error(
            '⚠️ Company index migration:',
            error.message
        );

    }

}


/*
=========================================================
  ERROR HANDLING & 404
=========================================================
*/

/*
 * معالجة أخطاء تنسيق JSON غير الصالح (قادمة من express.json).
 */
app.use((err, req, res, next) => {

    if (
        err instanceof SyntaxError &&
        err.status === 400 &&
        'body' in err
    ) {

        return res.status(400).json({
            success: false,
            message: 'طلب JSON غير صالح'
        });

    }

    // أخطاء multer (حجم/نوع ملف) تملك statusCode و code
    if (err && err.statusCode && err.code) {

        return res.status(err.statusCode).json({
            success: false,
            message: err.message
        });

    }

    next(err);

});

/*
 * 404 مخصص لمسارات /api غير المعروفة.
 */
app.use('/api', (req, res) => {

    res.status(404).json({
        success: false,
        message: 'المسار غير موجود'
    });

});

/*
 * معالج أخطاء مركزي نهائي: يمنع تسريب تفاصيل داخلية للعميل.
 */
app.use((err, req, res, next) => {

    console.error(
        '❌ خطأ غير معالج:',
        err && err.message ? err.message : err
    );

    res.status(500).json({
        success: false,
        message: 'حدث خطأ داخلي في الخادم'
    });

});

/*
=========================================================
  GRACEFUL SHUTDOWN & PROCESS HANDLERS
=========================================================
*/

async function gracefulShutdown(signal) {

    console.log(
        `\n🛑 استقبال إشارة ${signal}، إيقاف تشغيل نظيف...`
    );

    try {

        await mongoose.connection.close();

        console.log('🔌 تم إغلاق اتصال MongoDB.');

    } catch (err) {

        console.error(
            '⚠️ خطأ أثناء إغلاق MongoDB:',
            err.message
        );

    }

    process.exit(0);

}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', reason => {
    console.error('⚠️ وعد غير معالج:', reason);
});

process.on('uncaughtException', err => {
    console.error(
        '⚠️ استثناء غير ملتقط:',
        err && err.message ? err.message : err
    );
});

/*
=========================================================
  START
=========================================================
*/

function startServer() {

    app.listen(
        PORT,
        () => {

            console.log(
                `🚀 AlMoraqebPro Server يعمل الآن على المنفذ ${PORT}`
            );

        }
    );

}

/*
 * الاتصال بقاعدة البيانات مع إعادة محاولة تلقائية بفاصل زمني تصاعدي.
 * الخادم يبقى قيد التشغيل دائمًا، ونقطة /health تعكس حالة الاتصال
 * حتى يمكن لـ Render اكتشاف المشكلة والتعافي منها.
 */
async function connectWithRetry(attempt = 1) {

    try {

        await mongoose.connect(
            MONGO_URI,
            {
                serverSelectionTimeoutMS: 10000,
                connectTimeoutMS: 10000
            }
        );

        console.log(
            '✅ تم الاتصال بقاعدة بيانات MongoDB بنجاح'
        );

        await migrateCompanyIndexes();

    } catch (err) {

        console.error(
            `❌ محاولة الاتصال بـ MongoDB رقم ${attempt} فشلت:`,
            err.message
        );

        const delay = Math.min(1000 * attempt, 15000);

        setTimeout(
            () => connectWithRetry(attempt + 1),
            delay
        );

    }

}

// استمع أولاً كي يكون الخادم متاحًا فورًا، ثم اتصل بقاعدة البيانات في الخلفية.
startServer();
connectWithRetry();

mongoose.connection.on('error', err => {
    console.error('🔄 خطأ في اتصال MongoDB:', err.message);
});

mongoose.connection.on('disconnected', () => {
    console.warn('🔌 تم فصل اتصال MongoDB.');
});

mongoose.connection.on('reconnected', () => {
    console.log('🔁 تمت إعادة الاتصال بـ MongoDB.');
});
