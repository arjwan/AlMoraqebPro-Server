const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto');
const dotenv = require('dotenv');

/*
 * تحميل المتغيرات من ملف .env المحلي (إن وُجد).
 * على Render تُحقن المتغيرات من لوحة التحكم، وليس من ملف .env.
 * dotenv لا يتجاوز المتغيرات الموجودة مسبقًا في البيئة.
 * quiet: منع طباعة رسائل التلميح أثناء الإقلاع.
 */
dotenv.config({ quiet: true });

const app = express();

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
        ? { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }
        : { origin: true }
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
            'delegation'
        ],
        default: 'within-shift'
    }

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
            'loan'
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
    name: { type: String, enum: ['صباحي', 'مسائي', 'ليلي', 'طارئ'], required: true },
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

    employeeIds: { type: [String], default: [] },
    attendanceStart: { type: String, default: '' },
    attendanceEnd: { type: String, default: '' },
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

dailyWorkerRecordSchema.pre('save', function(next) {

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

    next();

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

    const token =
        readToken(
            req.headers.authorization
                ?.replace(
                    /^Bearer\s+/i,
                    ''
                )
        );

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

            });

        }

    }
);


/*
=========================================================
  DEVELOPER - ALL REPORT
=========================================================
*/

app.get(
    '/api/developer/company-report',
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

            res.json({

                success: true,

                generatedAt:
                    new Date().toISOString(),

                total:
                    companies.length,

                connected:
                    companies.filter(
                        company =>
                            getCompanyConnectionStatus(
                                company
                            ).status ===
                            'connected'
                    ).length,

                stopped:
                    companies.filter(
                        company =>
                            getCompanyConnectionStatus(
                                company
                            ).status ===
                            'stopped'
                    ).length,

                neverConnected:
                    companies.filter(
                        company =>
                            getCompanyConnectionStatus(
                                company
                            ).status ===
                            'never'
                    ).length,

                companies:
                    companies.map(
                        buildCompanyReport
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
  DEVELOPER - ALERTS
=========================================================
*/

app.get(
    '/api/developer/company-alerts',
    requireDeveloper,
    async (req, res) => {

        try {

            const companies =
                await Company
                    .find()
                    .sort({
                        lastSeenAt: 1
                    })
                    .lean();

            const alerts = [];

            for (
                const company
                of companies
            ) {

                const status =
                    getCompanyConnectionStatus(
                        company
                    );

                if (
                    status.status ===
                    'stopped'
                ) {

                    alerts.push({

                        level:
                            'warning',

                        companyId:
                            company.companyId,

                        companyName:
                            company.name,

                        message:
                            `الشركة ${company.name} (${company.companyId}) متوقفة منذ ${status.downtimeMinutes} دقيقة.`,

                        downtimeMinutes:
                            status.downtimeMinutes,

                        lastSeenAt:
                            company.lastSeenAt

                    });

                }

                if (
                    status.status ===
                    'never'
                ) {

                    alerts.push({

                        level:
                            'info',

                        companyId:
                            company.companyId,

                        companyName:
                            company.name,

                        message:
                            `الشركة ${company.name} (${company.companyId}) لم تسجل اتصالاً حتى الآن.`

                    });

                }

            }

            res.json({

                success: true,

                alerts

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
  DEVELOPER - UPDATE COMPANY
=========================================================
*/

app.patch(
    '/api/developer/companies/:companyId',
    requireDeveloper,
    async (req, res) => {

        try {

            const companyId =
                String(
                    req.params.companyId ||
                    ''
                ).trim();

            const allowed = [

                'developerCode',

                'name',

                'email',

                'phone',

                'managerName',

                'managerPhone',

                'subscription',

                'systemState',

                'subscriptionStartDate',

                'subscriptionEndDate',

                'adminUsername',

                'latitude',

                'longitude',

                'geofenceRadiusMeters'

            ];

            const updates = {};

            for (
                const key
                of allowed
            ) {

                if (
                    req.body[key] !==
                    undefined
                ) {

                    updates[key] =
                        typeof req.body[key] ===
                        'string'
                            ? req.body[key].trim()
                            : req.body[key];

                }

            }

            if (
                req.body.adminPassword
            ) {

                updates.adminPasswordHash =
                    hashPassword(
                        req.body.adminPassword
                    );

            }

            if (
                updates.latitude !==
                undefined
            ) {

                updates.latitude =
                    Number(
                        updates.latitude
                    );

            }

            if (
                updates.longitude !==
                undefined
            ) {

                updates.longitude =
                    Number(
                        updates.longitude
                    );

            }

            if (
                updates.geofenceRadiusMeters !==
                undefined
            ) {

                updates.geofenceRadiusMeters =
                    Number(
                        updates.geofenceRadiusMeters
                    );

            }

            const company =
                await Company.findOneAndUpdate(

                    {
                        companyId
                    },

                    {
                        $set:
                            updates
                    },

                    {
                        new: true,

                        runValidators:
                            true
                    }

                );

            if (!company) {

                return res.status(404).json({

                    success: false,

                    message:
                        'الشركة غير موجودة'

                });

            }

            res.json({

                success: true,

                message:
                    'تم تعديل الشركة في MongoDB',

                company:
                    publicCompany(
                        company
                    )

            });

        } catch (err) {

            res.status(400).json({

                success: false,

                error:
                    err.message

            });

        }

    }
);


/*
=========================================================
  DEVELOPER - DELETE COMPANY
=========================================================
*/

app.delete(
    '/api/developer/companies/:companyId',
    requireDeveloper,
    async (req, res) => {

        try {

            const companyId =
                String(
                    req.params.companyId ||
                    ''
                ).trim();

            const company =
                await Company.findOneAndDelete({
                    companyId
                });

            if (!company) {

                return res.status(404).json({

                    success: false,

                    message:
                        'الشركة غير موجودة'

                });

            }

            await Promise.all([

                Employee.deleteMany({
                    companyId
                }),

                EmployeeRequest.deleteMany({
                    companyId
                }),

                Attendance.deleteMany({
                    companyId
                }),

                ServiceRequest.deleteMany({
                    companyId
                }),

                Notification.deleteMany({
                    companyId
                }),

                Shift.deleteMany({
                    companyId
                }),

                SalaryRecord.deleteMany({
                    companyId
                }),

                LoanRecord.deleteMany({
                    companyId
                }),

                DailyWorkerRecord.deleteMany({
                    companyId
                })

            ]);

            res.json({

                success: true,

                message:
                    'تم حذف الشركة وجميع بياناتها المرتبطة',

                companyId

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
  ADMIN LOGIN
=========================================================
*/

app.post(
    '/api/admin/login',
    async (req, res) => {

        try {

            const companyId =
                String(
                    req.body.companyId ||
                    ''
                ).trim();

            const username =
                String(
                    req.body.username ||
                    ''
                ).trim();

            const password =
                String(
                    req.body.password ||
                    ''
                );

            const company =
                await Company.findOne({
                    companyId
                });

            if (
                !company ||
                company.systemState !==
                    'active'
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        'الشركة غير متاحة أو متوقفة'

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

            if (
                company.adminUsername !==
                    username ||
                !verifyPassword(
                    password,
                    company.adminPasswordHash
                )
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        'بيانات المدير غير صحيحة'

                });

            }

            /*
             * تسجيل اتصال الشركة الحقيقي.
             */
            company.lastSeenAt =
                new Date();

            await company.save();

            res.json({

                success: true,

                company:
                    publicCompany(
                        company
                    ),

                token:
                    createToken({

                        role:
                            'admin',

                        companyId

                    })

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
  ADMIN SESSION
=========================================================
*/


/*
=========================================================
  ADMIN COMPANY SETTINGS
=========================================================
*/


/*
=========================================================
  ADMIN SUPPORT + SAFE SYSTEM STATUS
=========================================================
*/

app.get('/api/admin/system-info', requireAdmin, async (req, res) => {
    try {

        let appVersion = '1.0.0';

        try {
            const packageJson =
                JSON.parse(
                    fs.readFileSync(
                        path.join(__dirname, 'package.json'),
                        'utf8'
                    )
                );

            appVersion =
                packageJson.version || appVersion;
        } catch (_) {}

        const dbConnected =
            mongoose.connection.readyState === 1;

        return res.json({
            success: true,

            version:
                appVersion,

            serverStatus:
                'online',

            databaseStatus:
                dbConnected
                    ? 'connected'
                    : 'disconnected',

            checkedAt:
                new Date(),

            /*
             * لا نوفر أي معلومات بنية تحتية،
             * ولا روابط Render/GitHub ولا أوامر تشغيل.
             */
            updateManagedByDeveloper:
                true
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});


app.get('/api/admin/support-requests', requireAdmin, async (req, res) => {
    try {

        const requests =
            await SupportRequest
                .find({
                    companyId:
                        req.session.companyId
                })
                .sort({
                    createdAt: -1
                })
                .limit(50)
                .lean();

        return res.json({
            success: true,
            requests
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});


app.post('/api/admin/support-requests', requireAdmin, async (req, res) => {
    try {

        const company =
            await Company.findOne({
                companyId:
                    req.session.companyId
            }).lean();

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'الشركة غير موجودة'
            });
        }

        const subject =
            String(
                req.body.subject || ''
            ).trim();

        const message =
            String(
                req.body.message || ''
            ).trim();

        const priority =
            ['normal', 'high', 'urgent']
                .includes(req.body.priority)
                ? req.body.priority
                : 'normal';

        if (!subject || !message) {
            return res.status(400).json({
                success: false,
                message:
                    'عنوان الطلب وتفاصيله مطلوبان'
            });
        }

        const request =
            await new SupportRequest({

                companyId:
                    company.companyId,

                companyName:
                    company.name || '',

                subject,

                message,

                priority,

                status:
                    'open'

            }).save();

        return res.status(201).json({
            success: true,
            message:
                'تم إرسال طلب الدعم إلى المطور',
            request
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});


app.post('/api/admin/request-update', requireAdmin, async (req, res) => {
    try {

        const company =
            await Company.findOne({
                companyId:
                    req.session.companyId
            }).lean();

        if (!company) {
            return res.status(404).json({
                success: false,
                message:
                    'الشركة غير موجودة'
            });
        }

        let currentVersion = '1.0.0';

        try {
            const packageJson =
                JSON.parse(
                    fs.readFileSync(
                        path.join(__dirname, 'package.json'),
                        'utf8'
                    )
                );

            currentVersion =
                packageJson.version ||
                currentVersion;
        } catch (_) {}

        const existing =
            await SupportRequest.findOne({
                companyId:
                    company.companyId,

                subject:
                    'طلب تحديث النسخة',

                status: {
                    $in: [
                        'open',
                        'in_progress'
                    ]
                }
            }).lean();

        if (existing) {
            return res.status(409).json({
                success: false,
                message:
                    'يوجد طلب تحديث مفتوح مسبقاً'
            });
        }

        const request =
            await new SupportRequest({

                companyId:
                    company.companyId,

                companyName:
                    company.name || '',

                subject:
                    'طلب تحديث النسخة',

                message:
                    `طلب تحديث النظام. النسخة الحالية: ${currentVersion}`,

                priority:
                    'normal',

                status:
                    'open'

            }).save();

        return res.status(201).json({
            success: true,
            message:
                'تم إرسال طلب تحديث النسخة إلى المطور',
            request
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.get('/api/admin/settings', requireAdmin, async (req, res) => {
    try {

        const company =
            await Company.findOne({
                companyId: req.session.companyId
            }).lean();

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'الشركة غير موجودة'
            });
        }

        return res.json({
            success: true,
            settings: {
                companyId: company.companyId,
                name: company.name || '',
                email: company.email || '',
                phone: company.phone || '',
                managerName: company.managerName || '',
                managerPhone: company.managerPhone || '',
                adminUsername: company.adminUsername || 'admin',

                uiLanguage:
                    company.uiLanguage || 'ar',

                uiTheme:
                    company.uiTheme || 'light',

                attendanceRetentionDays:
                    [7, 15, 30].includes(Number(company.attendanceRetentionDays))
                        ? Number(company.attendanceRetentionDays)
                        : 30,

                /*
                 * للعرض فقط في صفحة المدير.
                 * لا يسمح بتعديلها من API المدير.
                 */
                subscription: company.subscription || '',
                systemState: company.systemState || '',
                subscriptionStartDate: company.subscriptionStartDate || null,
                subscriptionEndDate: company.subscriptionEndDate || null
            }
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});


app.put('/api/admin/settings', requireAdmin, async (req, res) => {
    try {

        const company =
            await Company.findOne({
                companyId: req.session.companyId
            });

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'الشركة غير موجودة'
            });
        }

        if (req.body.name !== undefined) {
            const name =
                String(req.body.name || '').trim();

            if (!name) {
                return res.status(400).json({
                    success: false,
                    message: 'اسم الشركة مطلوب'
                });
            }

            company.name = name;
        }

        if (req.body.email !== undefined)
            company.email =
                String(req.body.email || '').trim();

        if (req.body.phone !== undefined)
            company.phone =
                String(req.body.phone || '').trim();

        if (req.body.managerName !== undefined)
            company.managerName =
                String(req.body.managerName || '').trim();

        if (req.body.managerPhone !== undefined)
            company.managerPhone =
                String(req.body.managerPhone || '').trim();

        if (req.body.adminUsername !== undefined) {

            const username =
                String(req.body.adminUsername || '').trim();

            if (!username) {
                return res.status(400).json({
                    success: false,
                    message: 'اسم مستخدم المدير مطلوب'
                });
            }

            company.adminUsername =
                username;
        }

        if (req.body.uiLanguage !== undefined) {

            const language =
                String(req.body.uiLanguage || '').trim();

            if (!['ar', 'en', 'ku', 'fa', 'tr'].includes(language)) {
                return res.status(400).json({
                    success: false,
                    message: 'اللغة غير مدعومة'
                });
            }

            company.uiLanguage = language;
        }

        if (req.body.uiTheme !== undefined) {

            const theme =
                String(req.body.uiTheme || '').trim();

            if (!['light', 'dark'].includes(theme)) {
                return res.status(400).json({
                    success: false,
                    message: 'وضع العرض غير مدعوم'
                });
            }

            company.uiTheme = theme;
        }

        if (req.body.attendanceRetentionDays !== undefined) {
            const retentionDays = Number(req.body.attendanceRetentionDays);
            if (![7, 15, 30].includes(retentionDays)) {
                return res.status(400).json({
                    success: false,
                    message: 'مدة حفظ سجلات البصمة يجب أن تكون 7 أو 15 أو 30 يومًا'
                });
            }
            company.attendanceRetentionDays = retentionDays;
        }

        if (req.body.adminPassword) {

            const password =
                String(req.body.adminPassword);

            if (password.length < 4) {
                return res.status(400).json({
                    success: false,
                    message:
                        'كلمة مرور المدير يجب أن تكون 4 أحرف على الأقل'
                });
            }

            company.adminPasswordHash =
                hashPassword(password);
        }

        await company.save();

        return res.json({
            success: true,
            message: 'تم حفظ إعدادات الشركة بنجاح'
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.get(
    '/api/admin/session',
    requireAdmin,
    async (req, res) => {

        try {

            const company =
                await Company.findOne({

                    companyId:
                        req.session.companyId

                });

            if (!company) {

                return res.status(404).json({

                    success: false,

                    message:
                        'الشركة غير موجودة'

                });

            }

            company.lastSeenAt =
                new Date();

            await company.save();

            res.json({

                success: true,

                companyId:
                    company.companyId,

                company:
                    publicCompany(
                        company
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
  COMPANY REGISTER
=========================================================
*/

app.post(
    '/api/companies/register',
    async (req, res) => {

        try {

            const canonicalCompanyId =
                String(
                    req.body.companyId ||
                    req.body.id ||
                    ''
                ).trim();

            const developerCode =
                String(
                    req.body.developerCode ||
                    ''
                ).trim();

            const name =
                String(
                    req.body.name ||
                    ''
                ).trim();

            if (
                !canonicalCompanyId ||
                !name
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'معرف الشركة واسم الشركة مطلوبان'

                });

            }

            const existingCompany =
                await Company
                    .findOne({
                        companyId:
                            canonicalCompanyId
                    })
                    .lean();

            if (existingCompany) {

                return res.status(409).json({

                    success: false,

                    message:
                        'رمز الشركة مستخدم مسبقاً'

                });

            }

            let adminPassword =
                String(
                    req.body.adminPassword ||
                    ''
                );

            if (!adminPassword) {

                return res.status(400).json({

                    success: false,

                    message:
                        'كلمة مرور المدير مطلوبة'

                });

            }

            const company =
                await new Company({

                    companyId:
                        canonicalCompanyId,

                    developerCode,

                    name,

                    email:
                        req.body.email ||
                        '',

                    phone:
                        req.body.phone ||
                        '',

                    managerName:
                        req.body.managerName ||
                        '',

                    managerPhone:
                        req.body.managerPhone ||
                        req.body.phone ||
                        '',

                    adminUsername:
                        String(
                            req.body.adminUsername ||
                            'admin'
                        ).trim(),

                    adminPasswordHash:
                        hashPassword(
                            adminPassword
                        ),

                    subscription:
                        req.body.subscription ||
                        'annual',

                    systemState:
                        req.body.systemState ||
                        'active',

                    subscriptionStartDate:
                        req.body.subscriptionStartDate ||
                        new Date(),

                    subscriptionEndDate:
                        req.body.subscriptionEndDate ||
                        undefined,

                    latitude:
                        req.body.latitude !==
                        undefined &&
                        req.body.latitude !== ''
                            ? Number(
                                req.body.latitude
                            )
                            : undefined,

                    longitude:
                        req.body.longitude !==
                        undefined &&
                        req.body.longitude !== ''
                            ? Number(
                                req.body.longitude
                            )
                            : undefined,

                    geofenceRadiusMeters:
                        req.body.geofenceRadiusMeters !==
                        undefined &&
                        req.body.geofenceRadiusMeters !== ''
                            ? Number(
                                req.body.geofenceRadiusMeters
                            )
                            : 200,

                    lastSeenAt:
                        null

                }).save();

            res.status(201).json({

                success: true,

                message:
                    'تم تسجيل الشركة بنجاح في MongoDB',

                company:
                    publicCompany(
                        company
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
  PUBLIC COMPANIES
=========================================================
*/

app.get(
    '/api/companies',
    async (req, res) => {

        try {

            const companies =
                await Company
                    .find()
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            res.json({

                success: true,

                companies:
                    companies.map(
                        publicCompany
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
  EMPLOYEE REQUEST
=========================================================
*/

app.post(
    '/api/employee/request',
    async (req, res) => {

        const companyId =
            String(
                req.body.companyId ||
                req.body.companyCode ||
                req.body.id ||
                ''
            ).trim();

        const deviceId =
            String(
                req.body.deviceId ||
                ''
            ).trim();

        const name =
            String(
                req.body.name ||
                ''
            ).trim();

        if (
            !companyId ||
            !name
        ) {

            logEmployeeRequestEvent('request-rejected', {
                endpoint: '/api/employee/request',
                companyId,
                deviceId,
                httpStatus: 400,
                error: 'missing companyId or name'
            });

            return res.status(400).json({

                success: false,

                message:
                    'بيانات طلب الموظف ناقصة'

            });

        }

        try {

            const company =
                await Company
                    .findOne({
                        companyId
                    })
                    .lean();

            if (!company) {

                logEmployeeRequestEvent('request-rejected', {
                    endpoint: '/api/employee/request',
                    companyId,
                    deviceId,
                    httpStatus: 404,
                    error: 'company not found in MongoDB'
                });

                return res.status(404).json({

                    success: false,

                    message:
                        'رمز الشركة غير مسجل في MongoDB'

                });

            }

            const phoneNumber =
                String(
                    req.body.phoneNumber ||
                    req.body.phone ||
                    ''
                ).trim();

            /*
             * تحويل آمن للحقول الرقمية:
             * القيم النصية غير الرقمية تُرفض برسالة واضحة
             * بدلاً من فشل Cast في MongoDB.
             */
            let salary;
            if (
                req.body.salary !== undefined &&
                req.body.salary !== null &&
                req.body.salary !== ''
            ) {
                salary = Number(req.body.salary);
                if (!Number.isFinite(salary) || salary < 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'أدخل راتباً صحيحاً (0 أو أكثر)'
                    });
                }
            }

            let workHours;
            if (
                req.body.workHours !== undefined &&
                req.body.workHours !== null &&
                req.body.workHours !== ''
            ) {
                workHours = Number(req.body.workHours);
                if (!Number.isInteger(workHours) || workHours <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: 'أدخل ساعات عمل صحيحة أكبر من صفر'
                    });
                }
            }

            /*
             * إذا وصل طلب من هاتف يحمل رقم موظف موجود مسبقاً
             * داخل نفس الشركة، نربط الجهاز بالموظف الحالي
             * ولا ننشئ موظفاً جديداً.
             */
            if (phoneNumber) {

                const existingEmployee =
                    await Employee.findOne({
                        companyId,
                        phoneNumber
                    }).lean();

                if (existingEmployee) {

                    const update = {};

                    if (
                        deviceId &&
                        existingEmployee.deviceId !== deviceId
                    ) {
                        update.deviceId = deviceId;
                        update.deviceBoundAt = new Date();
                    }

                    if (Object.keys(update).length) {
                        await Employee.updateOne(
                            {
                                _id: existingEmployee._id
                            },
                            {
                                $set: update
                            }
                        );
                    }

                    const linkedRequest =
                        await new EmployeeRequest({

                            ...req.body,

                            companyId,

                            companyName:
                                req.body.companyName ||
                                company.name,

                            name,

                            phoneNumber,

                            deviceId,

                            status: 'approved'

                        }).save();

                    await Company.updateOne(
                        {
                            companyId
                        },
                        {
                            $set: {
                                lastSeenAt: new Date()
                            }
                        }
                    );

                    logEmployeeRequestEvent('request-linked-existing', {
                        endpoint: '/api/employee/request',
                        companyId,
                        deviceId,
                        requestId: String(linkedRequest._id),
                        httpStatus: 200
                    });

                    return res.status(200).json({

                        success: true,

                        message:
                            'الموظف موجود مسبقاً في الشركة، وتم ربط الجهاز بالحساب الحالي.',

                        linked: true,

                        employee: publicEmployee(
                            Object.assign(
                                {},
                                existingEmployee,
                                update
                            )
                        ),

                        requestId: linkedRequest._id,

                        status: 'approved'

                    });

                }

            }

            const request =
                await new EmployeeRequest({

                    ...req.body,

                    phoneNumber,

                    companyId,

                    companyName:
                        req.body.companyName ||
                        company.name,

                    name,

                    salary,

                    workHours,

                    deviceId,

                    status:
                        'pending'

                }).save();

            await Company.updateOne(
                {
                    companyId
                },
                {
                    $set: {
                        lastSeenAt:
                            new Date()
                    }
                }
            );

            logEmployeeRequestEvent('request-created', {
                endpoint: '/api/employee/request',
                companyId,
                deviceId,
                requestId: String(request._id),
                httpStatus: 201
            });

            res.status(201).json({

                success: true,

                message:
                    'تم إرسال الطلب إلى MongoDB',

                requestId:
                    request._id,

                status:
                    'pending'

            });

        } catch (err) {

            logEmployeeRequestEvent('request-failed', {
                endpoint: '/api/employee/request',
                companyId,
                deviceId,
                httpStatus: 500,
                error: err.message
            });

            res.status(500).json({

                success: false,

                message:
                    'تعذر حفظ طلب الموظف',

                error:
                    err.message

            });

        }

    }
);


/*
=========================================================
  EMPLOYEE REQUESTS
=========================================================
*/

app.get(
    '/api/employee/requests/:companyId',
    async (req, res) => {

        try {

            const companyId =
                String(
                    req.params.companyId ||
                    ''
                ).trim();

            const sessionCompanyId =
                String(
                    req.session.companyId ||
                    ''
                ).trim();

            if (
                !sessionCompanyId ||
                companyId !== sessionCompanyId
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        'لا يمكنك عرض طلبات شركة أخرى'
                });
            }

            const requests =
                await EmployeeRequest
                    .find({
                        companyId
                    })
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            res.json({

                success: true,

                requests

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
    '/api/employee/requests/:companyId/pending',
    requireAdmin,
    async (req, res) => {

        try {

            const companyId =
                String(
                    req.params.companyId ||
                    ''
                ).trim();

            const sessionCompanyId =
                String(
                    req.session.companyId ||
                    ''
                ).trim();

            if (
                !sessionCompanyId ||
                companyId !== sessionCompanyId
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        'لا يمكنك عرض طلبات شركة أخرى'
                });
            }

            const requests =
                await EmployeeRequest
                    .find({
                        companyId,
                        status:
                            'pending'
                    })
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            res.json({

                success: true,

                requests

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
  APPROVE EMPLOYEE
=========================================================
*/

app.post(
    '/api/employee/request/:requestId/approve',
    requireAdmin,
    async (req, res) => {

        const requestId =
            String(
                req.params.requestId ||
                ''
            ).trim();

        try {

            const request =
                await EmployeeRequest
                    .findById(
                        requestId
                    );

            if (!request) {

                logEmployeeRequestEvent('approve-rejected', {
                    endpoint: '/api/employee/request/:requestId/approve',
                    requestId,
                    httpStatus: 404,
                    error: 'request not found'
                });

                return res.status(404).json({

                    success: false,

                    message:
                        'طلب الموظف غير موجود'

                });

            }

            const sessionCompanyId =
                String(
                    req.session.companyId ||
                    ''
                ).trim();

            if (
                !sessionCompanyId ||
                String(request.companyId || '').trim() !==
                    sessionCompanyId
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        'لا يمكنك اعتماد طلب تابع لشركة أخرى'
                });
            }

            if (
                request.status ===
                'approved'
            ) {

                logEmployeeRequestEvent('approve-duplicate', {
                    endpoint: '/api/employee/request/:requestId/approve',
                    companyId: request.companyId,
                    deviceId: request.deviceId || '',
                    requestId: String(request._id),
                    httpStatus: 200,
                    error: 'already approved'
                });

                return res.status(200).json({

                    success: true,

                    message:
                        'الطلب معتمد مسبقاً'

                });

            }

            const existingEmployee =
                await Employee.findOne({
                    companyId: request.companyId,
                    ...(request.phoneNumber
                        ? { phoneNumber: request.phoneNumber }
                        : {
                            name: request.name,
                            ...(request.deviceId ? { deviceId: request.deviceId } : {})
                        })
                }).lean();

            if (existingEmployee) {

                request.status = 'approved';
                await request.save();

                logEmployeeRequestEvent('approve-existing', {
                    endpoint: '/api/employee/request/:requestId/approve',
                    companyId: request.companyId,
                    deviceId: request.deviceId || '',
                    requestId: String(request._id),
                    httpStatus: 200,
                    error: 'existing employee found'
                });

                return res.status(200).json({

                    success: true,

                    message:
                        'الموظف موجود بالفعل في الشركة، وتم اعتماد الطلب فقط.',

                    employee:
                        employeeWithSignedMedia(
                            existingEmployee
                        )

                });

            }

            const employee =
                await new Employee({

                    companyId:
                        request.companyId,

                    companyName:
                        request.companyName,

                    name:
                        request.name,

                    phoneNumber:
                        request.phoneNumber ||
                        '',

                    email:
                        req.body.email ||
                        '',

                    salary:
                        request.salary,

                    workHours:
                        request.workHours,

                    specialty:
                        request.jobTitle,

                    workplace:
                        request.workLocation,

                    username:
                        '',

                    password:
                        '',

                    credentialsStatus:
                        'pending',

                    deviceId:
                        request.deviceId ||
                        '',

                    deviceBoundAt:
                        request.deviceId
                            ? new Date()
                            : undefined,

                    location:
                        request.location,

                    loans:
                        []

                }).save();

            request.status =
                'approved';

            await request.save();

            logEmployeeRequestEvent('approve-created', {
                endpoint: '/api/employee/request/:requestId/approve',
                companyId: request.companyId,
                deviceId: request.deviceId || '',
                requestId: String(request._id),
                httpStatus: 201
            });

            res.status(201).json({

                success: true,

                message:
                    'تم اعتماد الموظف. بيانات الدخول تُحدد من لوحة المدير.',

                employee:
                    employeeWithSignedMedia(
                        employee
                    )

            });

        } catch (err) {

            logEmployeeRequestEvent('approve-failed', {
                endpoint: '/api/employee/request/:requestId/approve',
                requestId,
                httpStatus: 500,
                error: err.message
            });

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
  ADMIN EMPLOYEE CREDENTIALS
=========================================================
*/

app.patch(
    '/api/admin/employees/:employeeId/credentials',
    requireAdmin,
    async (req, res) => {

        try {

            const username =
                String(
                    req.body.username ||
                    ''
                ).trim();

            const password =
                String(
                    req.body.password ||
                    ''
                );

            if (
                !username ||
                password.length < 4
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'اسم المستخدم وكلمة المرور مطلوبان'

                });

            }

            const employee =
                await Employee.findOne({
                    _id:
                        req.params.employeeId,
                    companyId:
                        req.session.companyId
                });

            if (
                !employee ||
                employee.companyId !==
                    req.session.companyId
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        'الموظف غير موجود'

                });

            }

            const duplicate =
                await Employee.findOne({

                    _id: {
                        $ne:
                            employee._id
                    },

                    companyId:
                        employee.companyId,

                    username

                }).lean();

            if (duplicate) {

                return res.status(409).json({

                    success: false,

                    message:
                        'اسم المستخدم مستخدم مسبقاً'

                });

            }

            employee.username =
                username;

            employee.password =
                password;

            employee.credentialsStatus =
                'active';

            await employee.save();

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

            res.json({

                success: true,

                message:
                    'تم تعيين بيانات دخول الموظف',

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
  EMPLOYEE REGISTER
=========================================================
*/

app.post(
    '/api/employee/register',
    upload.single('photo'),
    async (req, res) => {

        try {

            const companyId =
                String(
                    req.body.companyId ||
                    req.body.companyCode ||
                    ''
                ).trim();

            if (
                !companyId ||
                !req.body.name ||
                !req.body.username ||
                !req.body.password
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'بيانات الموظف الأساسية ناقصة'

                });

            }

            const photoPath =
                req.file
                    ? `/uploads/${req.file.filename}`
                    : (
                        req.body.photo ||
                        ''
                    );

            const employee =
                await new Employee({

                    companyId,

                    companyName:
                        req.body.companyName,

                    name:
                        req.body.name,

                    email:
                        req.body.email,

                    salary:
                        req.body.salary
                            ? Number(
                                req.body.salary
                            )
                            : undefined,

                    specialty:
                        req.body.specialty,

                    workplace:
                        req.body.workplace,

                    username:
                        req.body.username,

                    password:
                        req.body.password,

                    credentialsStatus:
                        'active',

                    deviceId:
                        req.body.deviceId ||
                        '',

                    deviceBoundAt:
                        req.body.deviceId
                            ? new Date()
                            : undefined,

                    photoUrl:
                        photoPath,

                    location:
                        req.body.location,

                    loans:
                        []

                }).save();

            await Company.updateOne(

                {
                    companyId
                },

                {
                    $set: {
                        lastSeenAt:
                            new Date()
                    }
                }

            );

            res.status(201).json({

                success: true,

                message:
                    'تم تسجيل الموظف وحفظه في MongoDB',

                employee:
                    publicEmployee(
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
  EMPLOYEES
=========================================================
*/

app.get(
    '/api/employees',
    requireAdmin,
    async (req, res) => {

        try {

            const companyId =
                String(
                    req.query.companyId ||
                    ''
                ).trim();

            if (!companyId) {

                return res.status(400).json({

                    success: false,

                    message:
                        'companyId مطلوب'

                });

            }

            const employees =
                await Employee
                    .find({
                        companyId
                    })
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            res.json({

                success: true,

                total:
                    employees.length,

                employees:
                    employees.map(
                        employee =>
                            employeeWithSignedMedia(
                                employee
                            )
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
  ADMIN EMPLOYEE CRUD
=========================================================

  لوحة المدير تستخدم /api/employees للإضافة والتعديل والحذف.
  هذه المسارات كانت ناقصة في النسخة السابقة، رغم أن الواجهة
  تستدعيها مباشرة.
*/

app.post(
    '/api/employees',
    requireAdmin,
    async (req, res) => {

        try {

            const companyId =
                String(
                    req.body.companyId ||
                    req.session.companyId ||
                    ''
                ).trim();

            const name =
                String(req.body.name || '').trim();

            const username =
                String(req.body.username || '').trim();

            const password =
                String(req.body.password || '');

            const clientOfflineId =
                String(
                    req.body.clientOfflineId || ''
                ).trim();

            /*
             * Idempotency للمزامنة:
             * إذا وصلت نفس عملية الإنشاء مرة ثانية
             * نعيد الموظف الموجود ولا ننشئ نسخة مكررة.
             */
            if (clientOfflineId) {

                const existingOfflineEmployee =
                    await Employee.findOne({
                        companyId,
                        clientOfflineId
                    });

                if (existingOfflineEmployee) {
                    return res.status(200).json({
                        success: true,
                        alreadySynced: true,
                        employee:
                            employeeWithSignedMedia(
                                existingOfflineEmployee
                            )
                    });
                }
            }

            if (!companyId || !name) {
                return res.status(400).json({
                    success: false,
                    message: 'companyId واسم الموظف مطلوبان'
                });
            }

            if (companyId !== String(req.session.companyId || '').trim()) {
                return res.status(403).json({
                    success: false,
                    message: 'لا يمكنك إضافة موظف لشركة أخرى'
                });
            }

            if (!username || password.length < 4) {
                return res.status(400).json({
                    success: false,
                    message: 'اسم المستخدم وكلمة المرور مطلوبان، وكلمة المرور 4 أحرف على الأقل'
                });
            }

            const duplicate = await Employee.findOne({
                companyId,
                username
            }).lean();

            if (duplicate) {
                return res.status(409).json({
                    success: false,
                    message: 'اسم المستخدم مستخدم مسبقاً'
                });
            }

            const phoneNumber =
                String(req.body.phoneNumber || '').trim();

            if (phoneNumber) {
                const phoneDuplicate = await Employee.findOne({
                    companyId,
                    phoneNumber
                }).lean();

                if (phoneDuplicate) {
                    return res.status(409).json({
                        success: false,
                        message: 'رقم الهاتف مستخدم مسبقاً في هذه الشركة'
                    });
                }
            }

            const employee = await new Employee({
                companyId,
                companyName: req.body.companyName || '',
                name,
                email: req.body.email || '',
                phoneNumber,
                clientOfflineId,

                salary: req.body.salary !== undefined && req.body.salary !== ''
                    ? Number(req.body.salary)
                    : undefined,
                specialty: req.body.specialty || req.body.jobTitle || '',
                workplace: req.body.workplace || req.body.workLocation || '',
                username,
                password,
                credentialsStatus: 'active',
                deviceId: String(req.body.deviceId || '').trim(),
                deviceBoundAt: req.body.deviceId ? new Date() : undefined,
                location: req.body.location || '',
                loans: []
            }).save();

            // ✅ إنشاء سجل راتب تلقائياً عند إضافة الموظف
            await new SalaryRecord({
                companyId,
                employeeId: String(employee._id),
                employeeName: employee.name,
                specialty: employee.specialty || '',
                workplace: employee.workplace || '',
                shiftName: '',
                socialSecurity: 'غير مسجل',
                basicSalary: employee.salary || 0,
                allowances: 0,
                loans: 0,
                loanDeduction: 0,
                securityDeduction: 0,
                otherDeductions: 0,
                bonuses: 0,
                totalDeductions: 0,
                grossSalary: 0,
                netSalary: 0
            }).save();

            await Company.updateOne(
                { companyId },
                { $set: { lastSeenAt: new Date() } }
            );

            return res.status(201).json({
                success: true,
                message: 'تمت إضافة الموظف بنجاح',
                employee: employeeWithSignedMedia(employee)
            });

        } catch (err) {
            console.error('POST /api/employees failed:', err);
            return res.status(500).json({
                success: false,
                message: 'تعذر إضافة الموظف',
                error: err.message
            });
        }
    }
);


app.get(
    '/api/employees/:employeeId',
    requireAdmin,
    async (req, res, next) => {

        // إذا كان المعامل companyId وليس Mongo ObjectId نمرره لمسار
        // /api/employees/:companyId الموجود أسفل هذا المسار.
        if (!mongoose.Types.ObjectId.isValid(req.params.employeeId)) {
            return next();
        }

        try {
            const employee = await Employee.findById(req.params.employeeId).lean();

            if (
                !employee ||
                employee.companyId !== String(req.session.companyId || '').trim()
            ) {
                return res.status(404).json({
                    success: false,
                    message: 'الموظف غير موجود'
                });
            }

            return res.json({
                success: true,
                employee: employeeWithSignedMedia(employee)
            });
        } catch (err) {
            console.error('GET /api/employees/:employeeId failed:', err);
            return res.status(500).json({
                success: false,
                message: 'تعذر جلب بيانات الموظف',
                error: err.message
            });
        }
    }
);


app.put(
    '/api/employees/:employeeId',
    requireAdmin,
    async (req, res) => {

        try {
            const employee = await Employee.findById(req.params.employeeId);

            if (
                !employee ||
                employee.companyId !== String(req.session.companyId || '').trim()
            ) {
                return res.status(404).json({
                    success: false,
                    message: 'الموظف غير موجود'
                });
            }

            const usernameProvided =
                req.body.username !== undefined;

            const username =
                usernameProvided
                    ? String(req.body.username || '').trim()
                    : employee.username;

            const password =
                req.body.password !== undefined
                    ? String(req.body.password || '')
                    : '';

            /*
             * اسم المستخدم مطلوب فقط عند تغييره صراحة.
             * الموظفون المعتمدون من الطلبات لديهم username فارغ
             * ويجب السماح بتعديل بياناتهم (كرقم الهاتف) دون فرضه.
             */
            if (usernameProvided && !username) {
                return res.status(400).json({
                    success: false,
                    message: 'اسم المستخدم مطلوب'
                });
            }

            if (password && password.length < 4) {
                return res.status(400).json({
                    success: false,
                    message: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل'
                });
            }

            const phoneNumber =
                req.body.phoneNumber !== undefined
                    ? String(req.body.phoneNumber || '').trim()
                    : String(employee.phoneNumber || '').trim();

            if (phoneNumber) {
                const phoneDuplicate = await Employee.findOne({
                    _id: { $ne: employee._id },
                    companyId: employee.companyId,
                    phoneNumber
                }).lean();

                if (phoneDuplicate) {
                    return res.status(409).json({
                        success: false,
                        message: 'رقم الهاتف مستخدم مسبقاً في هذه الشركة'
                    });
                }
            }

            const duplicate = username
                ? await Employee.findOne({
                    _id: { $ne: employee._id },
                    companyId: employee.companyId,
                    username
                }).lean()
                : null;

            if (duplicate) {
                return res.status(409).json({
                    success: false,
                    message: 'اسم المستخدم مستخدم مسبقاً'
                });
            }

            employee.name = String(req.body.name || employee.name).trim();
            employee.email = req.body.email ?? employee.email;
            employee.salary = req.body.salary !== undefined && req.body.salary !== ''
                ? Number(req.body.salary)
                : employee.salary;
            employee.specialty = req.body.specialty ?? employee.specialty;
            employee.workplace = req.body.workplace ?? req.body.workLocation ?? employee.workplace;
            employee.location = req.body.location ?? employee.location;
            employee.phoneNumber = phoneNumber;
            employee.username = username;

            if (password) {
                employee.password = password;
                employee.credentialsStatus = 'active';
            } else if (req.body.status !== undefined) {
                employee.credentialsStatus =
                    String(req.body.status).toLowerCase() === 'active'
                        ? 'active'
                        : 'pending';
            }

            await employee.save();

            // تحديث سجل الراتب إذا وُجد
            await SalaryRecord.updateOne(
                { companyId: employee.companyId, employeeId: String(employee._id) },
                { $set: { employeeName: employee.name, specialty: employee.specialty || '', workplace: employee.workplace || '', basicSalary: employee.salary || 0 } }
            );

            return res.json({
                success: true,
                message: 'تم تعديل الموظف بنجاح',
                employee: employeeWithSignedMedia(employee)
            });
        } catch (err) {
            console.error('PUT /api/employees/:employeeId failed:', err);
            return res.status(500).json({
                success: false,
                message: 'تعذر تعديل الموظف',
                error: err.message
            });
        }
    }
);


app.delete(
    '/api/employees/:employeeId',
    requireAdmin,
    async (req, res) => {

        try {
            const employee = await Employee.findById(req.params.employeeId);

            if (
                !employee ||
                employee.companyId !== String(req.session.companyId || '').trim()
            ) {
                return res.status(404).json({
                    success: false,
                    message: 'الموظف غير موجود'
                });
            }

            const empId = String(employee._id);
            await Employee.deleteOne({ _id: employee._id });

            // حذف سجلات الرواتب والسلف المرتبطة
            await SalaryRecord.deleteMany({ companyId: employee.companyId, employeeId: empId });
            await LoanRecord.deleteMany({ companyId: employee.companyId, employeeId: empId });

            return res.json({
                success: true,
                message: 'تم حذف الموظف بنجاح'
            });
        } catch (err) {
            console.error('DELETE /api/employees/:employeeId failed:', err);
            return res.status(500).json({
                success: false,
                message: 'تعذر حذف الموظف',
                error: err.message
            });
        }
    }
);


app.get(
    '/api/employees/:companyId',
    async (req, res) => {

        try {

            const page =
                Math.max(
                    parseInt(
                        req.query.page
                    ) || 1,
                    1
                );

            const limit =
                Math.min(
                    Math.max(
                        parseInt(
                            req.query.limit
                        ) || 50,
                        1
                    ),
                    200
                );

            const filter = {

                companyId:
                    String(
                        req.params.companyId
                    ).trim()

            };

            const employees =
                await Employee
                    .find(filter)
                    .sort({
                        createdAt: -1
                    })
                    .skip(
                        (page - 1) *
                        limit
                    )
                    .limit(limit)
                    .lean();

            const total =
                await Employee
                    .countDocuments(
                        filter
                    );

            res.json({

                success: true,

                total,

                page,

                pages:
                    Math.ceil(
                        total / limit
                    ),

                employees:
                    employees.map(
                        publicEmployee
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
  MOBILE LOGIN
=========================================================
*/

app.post(
    '/api/mobile/login',
    async (req, res) => {

        try {

            const companyId =
                String(
                    req.body.companyId ||
                    req.body.companyCode ||
                    ''
                ).trim();

            const username =
                String(
                    req.body.username ||
                    ''
                ).trim();

            const password =
                String(
                    req.body.password ||
                    ''
                );

            const deviceId =
                String(
                    req.body.deviceId ||
                    ''
                ).trim();

            if (
                !companyId ||
                !username ||
                !password ||
                !deviceId
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'بيانات الدخول ناقصة'

                });

            }

            /*
             * تسجيل تشخيصي آمن (بدون كلمات مرور):
             * يحدد سبب فشل الدخول بالضبط.
             */
            const diagByCompany = await Employee.countDocuments({ companyId });
            const diagByUsername = await Employee.countDocuments({ companyId, username });
            const diagActive = await Employee.countDocuments({ companyId, username, credentialsStatus: 'active' });
            const diagPassword = await Employee.countDocuments({ companyId, username, password });
            console.log('[login-diag]', JSON.stringify({
                companyId,
                username,
                employeesInCompany: diagByCompany,
                usernameMatch: diagByUsername > 0,
                credentialsActive: diagActive > 0,
                passwordMatch: diagPassword > 0,
                deviceIdProvided: Boolean(deviceId)
            }));

            const employee =
                await Employee.findOne({

                    companyId,

                    username,

                    password,

                    credentialsStatus:
                        'active'

                });

            if (!employee) {

                let reason = 'بيانات الدخول غير صحيحة';
                if (diagByUsername === 0) reason = 'لا يوجد موظف بهذا الاسم في هذه الشركة';
                else if (diagPassword === 0) reason = 'كلمة المرور غير صحيحة';
                else if (diagActive === 0) reason = 'الحساب غير مفعّل بعد. راجع مدير الشركة.';

                return res.status(401).json({

                    success: false,

                    message: reason

                });

            }

            const company =
                await Company.findOne({
                    companyId
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

            if (
                employee.deviceId &&
                employee.deviceId !==
                    deviceId
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        'هذا الحساب مرتبط بجهاز آخر. راجع مدير الشركة.'

                });

            }

            if (
                !employee.deviceId
            ) {

                employee.deviceId =
                    deviceId;

                employee.deviceBoundAt =
                    new Date();

                await employee.save();

            }

            /*
             * اتصال حقيقي من هاتف الموظف.
             */
            company.lastSeenAt =
                new Date();

            await company.save();

            res.json({

                success: true,

                message:
                    'تم تسجيل الدخول بنجاح',

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
  RESET DEVICE
=========================================================
*/

app.post(
    '/api/employees/:employeeId/device/reset',
    requireAdmin,
    async (req, res) => {

        try {

            const employee =
                await Employee.findById(
                    req.params.employeeId
                );

            if (
                !employee ||
                employee.companyId !==
                    req.session.companyId
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        'الموظف غير موجود'

                });

            }

            employee.deviceId =
                '';

            employee.deviceBoundAt =
                undefined;

            await employee.save();

            res.json({

                success: true,

                message:
                    'تم فك ارتباط الجهاز'

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
  SERVICE REQUEST
=========================================================
*/

app.post(
    '/api/employee/service-request',
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

            const type =
                String(
                    req.body.type ||
                    ''
                ).trim();

            if (
                !employeeId ||
                !deviceId ||
                ![
                    'leave',
                    'loan'
                ].includes(type)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'بيانات طلب الخدمة ناقصة'

                });

            }

            const employee =
                await Employee.findById(
                    employeeId
                );

            if (
                !employee ||
                employee.deviceId !==
                    deviceId
            ) {

                return res.status(403).json({

                    success: false,

                    message:
                        'لا يمكن إرسال الطلب من هذا الجهاز'

                });

            }

            const amount =
                req.body.amount === '' ||
                req.body.amount == null
                    ? undefined
                    : Number(
                        req.body.amount
                    );

            if (
                type === 'loan' &&
                (
                    !Number.isFinite(
                        amount
                    ) ||
                    amount <= 0
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'أدخل مبلغ سلفة صحيحاً'

                });

            }

            let leaveFromDate;
            let leaveToDate;
            let leavePaymentType = 'paid';

            if (type === 'leave') {

                /*
                 * توافق مع التطبيق الحالي:
                 * requestedDate القديم = إجازة ليوم واحد.
                 * والنسخة الجديدة يمكنها إرسال fromDate وtoDate.
                 */
                const rawFromDate =
                    req.body.fromDate ||
                    req.body.requestedDate;

                const rawToDate =
                    req.body.toDate ||
                    req.body.fromDate ||
                    req.body.requestedDate;

                if (!rawFromDate || !rawToDate) {

                    return res.status(400).json({

                        success: false,

                        message:
                            'حدد تاريخ بداية ونهاية الإجازة'

                    });

                }

                leaveFromDate =
                    new Date(rawFromDate);

                leaveToDate =
                    new Date(rawToDate);

                if (
                    Number.isNaN(leaveFromDate.getTime()) ||
                    Number.isNaN(leaveToDate.getTime())
                ) {

                    return res.status(400).json({

                        success: false,

                        message:
                            'تاريخ الإجازة غير صحيح'

                    });

                }

                /*
                 * نهاية اليوم حتى تشمل الإجازة اليوم الأخير كاملاً.
                 */
                leaveFromDate.setHours(0, 0, 0, 0);
                leaveToDate.setHours(23, 59, 59, 999);

                if (
                    leaveToDate <
                    leaveFromDate
                ) {

                    return res.status(400).json({

                        success: false,

                        message:
                            'تاريخ نهاية الإجازة يجب أن يكون بعد تاريخ البداية'

                    });

                }

                /*
                 * المدير هو صاحب القرار النهائي في مدفوعة/غير مدفوعة.
                 * نقبل القيمة إن جاءت من لوحة الإدارة لاحقاً،
                 * وإلا تبقى paid افتراضياً حتى المعالجة.
                 */
                leavePaymentType =
                    req.body.leavePaymentType === 'unpaid'
                        ? 'unpaid'
                        : 'paid';

                /*
                 * منع الإجازات المتكررة أو المتداخلة.
                 * يشمل الطلبات القديمة التي كانت تحتوي requestedDate فقط.
                 */
                const existingLeaves =
                    await ServiceRequest.find({

                        companyId:
                            employee.companyId,

                        employeeId:
                            String(employee._id),

                        type:
                            'leave',

                        status: {
                            $in: [
                                'pending',
                                'approved'
                            ]
                        }

                    }).lean();

                const overlappingLeave =
                    existingLeaves.find(existing => {

                        const existingStart =
                            new Date(
                                existing.fromDate ||
                                existing.requestedDate
                            );

                        const existingEnd =
                            new Date(
                                existing.toDate ||
                                existing.fromDate ||
                                existing.requestedDate
                            );

                        if (
                            Number.isNaN(existingStart.getTime()) ||
                            Number.isNaN(existingEnd.getTime())
                        ) {
                            return false;
                        }

                        existingStart.setHours(
                            0, 0, 0, 0
                        );

                        existingEnd.setHours(
                            23, 59, 59, 999
                        );

                        return (
                            leaveFromDate <= existingEnd &&
                            leaveToDate >= existingStart
                        );

                    });

                if (overlappingLeave) {

                    return res.status(409).json({

                        success: false,

                        code:
                            'OVERLAPPING_LEAVE',

                        message:
                            'يوجد طلب إجازة آخر لنفس الموظف ضمن هذه الفترة',

                        existingRequestId:
                            overlappingLeave._id,

                        existingFromDate:
                            overlappingLeave.fromDate ||
                            overlappingLeave.requestedDate,

                        existingToDate:
                            overlappingLeave.toDate ||
                            overlappingLeave.fromDate ||
                            overlappingLeave.requestedDate

                    });

                }

            }

            const request =
                await new ServiceRequest({

                    companyId:
                        employee.companyId,

                    employeeId:
                        String(
                            employee._id
                        ),

                    employeeName:
                        employee.name,

                    type,

                    reason:
                        String(
                            req.body.reason ||
                            ''
                        ).trim(),

                    deviceId,

                    amount,

                    requestedDate:
                        type === 'leave'
                            ? leaveFromDate
                            : (
                                req.body.requestedDate
                                    ? new Date(
                                        req.body.requestedDate
                                    )
                                    : undefined
                            ),

                    fromDate:
                        type === 'leave'
                            ? leaveFromDate
                            : undefined,

                    toDate:
                        type === 'leave'
                            ? leaveToDate
                            : undefined,

                    leavePaymentType:
                        type === 'leave'
                            ? leavePaymentType
                            : undefined

                }).save();

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

            res.status(201).json({

                success: true,

                message:
                    'تم إرسال الطلب إلى لوحة المدير',

                requestId:
                    request._id

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
  EMPLOYEE SERVICE REQUESTS (MY REQUESTS)
=========================================================
*/

app.get(
    '/api/employee/service-requests',
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
                employee.deviceId !== deviceId
            ) {
                return res.status(403).json({
                    success: false,
                    message: 'لا يمكن جلب الطلبات من هذا الجهاز'
                });
            }

            const requests =
                await ServiceRequest
                    .find({
                        employeeId,
                        companyId: employee.companyId
                    })
                    .sort({ createdAt: -1 })
                    .limit(50)
                    .lean();

            res.json({
                success: true,
                requests
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
  ADMIN SERVICE REQUESTS
=========================================================
*/

app.get(
    '/api/admin/service-requests',
    requireAdmin,
    async (req, res) => {

        try {

            const requests =
                await ServiceRequest
                    .find({
                        companyId:
                            req.session.companyId
                    })
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            res.json({

                success: true,

                requests

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


app.patch(
    '/api/admin/service-requests/:requestId',
    requireAdmin,
    async (req, res) => {

        try {

            const status =
                String(
                    req.body.status ||
                    ''
                ).trim();

            if (
                ![
                    'approved',
                    'rejected'
                ].includes(status)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'الحالة يجب أن تكون approved أو rejected'

                });

            }

            const request =
                await ServiceRequest.findOne({

                    _id:
                        req.params.requestId,

                    companyId:
                        req.session.companyId

                });

            if (!request) {

                return res.status(404).json({

                    success: false,

                    message:
                        'طلب الخدمة غير موجود'

                });

            }

            if (
                request.status !==
                'pending'
            ) {

                return res.status(409).json({

                    success: false,

                    message:
                        'تمت معالجة الطلب مسبقاً'

                });

            }

            request.status =
                status;

            request.processedAt =
                new Date();

            request.processedBy =
                req.session.companyId;

            await request.save();

            res.json({

                success: true,

                message:
                    status === 'approved'
                        ? 'تم اعتماد الطلب'
                        : 'تم رفض الطلب',

                request

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
  ADMIN EMPLOYEE LOCATIONS (لصفحة الخريطة)
=========================================================
*/
app.get(
    '/api/admin/employee-locations',
    requireAdmin,
    async (req, res) => {

        try {

            const companyId =
                req.session.companyId;

            const employees =
                await Employee
                    .find({
                        companyId,
                        employmentStatus: {
                            $ne: 'inactive'
                        }
                    })
                    .select(
                        '_id name specialty workplace delegation'
                    )
                    .lean();

            const shifts =
                await Shift
                    .find({ companyId })
                    .select(
                        'name attendanceStart departureEnd employeeIds'
                    )
                    .lean();

            const now = new Date();

            const result = [];

            for (
                const emp
                of employees
            ) {

                const lastAttendance =
                    await Attendance
                        .findOne({
                            employeeId:
                                String(
                                    emp._id
                                ),
                            companyId
                        })
                        .sort({
                            timestamp: -1
                        })
                        .lean();

                const delegation = emp.delegation || {};
                const delegationFrom = delegation.from
                    ? new Date(delegation.from)
                    : null;
                const delegationTo = delegation.to
                    ? new Date(delegation.to)
                    : null;
                const hasActiveDelegation =
                    delegation.active === true &&
                    delegationFrom &&
                    delegationTo &&
                    !Number.isNaN(delegationFrom.getTime()) &&
                    !Number.isNaN(delegationTo.getTime()) &&
                    now >= delegationFrom &&
                    now <= delegationTo;

                const shift = shifts.find(item =>
                    (item.employeeIds || [])
                        .map(String)
                        .includes(String(emp._id))
                );
                const withinShift = Boolean(
                    shift &&
                    isWithinShiftWindow(
                        now,
                        shift.attendanceStart,
                        shift.departureEnd
                    )
                );
                const isClockedIn = Boolean(
                    lastAttendance &&
                    lastAttendance.type === 'attendance'
                );
                const trackingAllowed =
                    isClockedIn &&
                    (withinShift || hasActiveDelegation);

                let unavailableReason = '';
                if (!lastAttendance) {
                    unavailableReason = 'لا توجد بصمة حضور مسجلة';
                } else if (!isClockedIn) {
                    unavailableReason = 'أنهى الموظف دوامه';
                } else if (!withinShift && !hasActiveDelegation) {
                    unavailableReason = 'خارج وقت الدوام';
                }

                result.push({

                    employeeId:
                        emp._id,

                    name:
                        emp.name,

                    specialty:
                        emp.specialty ||
                        '',

                    workplace:
                        emp.workplace ||
                        '',

                    trackingAllowed,

                    trackingMode:
                        hasActiveDelegation
                            ? 'delegation'
                            : withinShift
                                ? 'shift'
                                : 'hidden',

                    shiftName:
                        shift
                            ? shift.name || ''
                            : '',

                    unavailableReason,

                    lastLocation:
                        trackingAllowed &&
                        lastAttendance &&
                        Number.isFinite(Number(lastAttendance.latitude)) &&
                        Number.isFinite(Number(lastAttendance.longitude))
                            ? {
                                latitude:
                                    lastAttendance.latitude,

                                longitude:
                                    lastAttendance.longitude,

                                type:
                                    lastAttendance.type,

                                timestamp:
                                    lastAttendance.timestamp
                            }
                            : null

                });

            }

            res.json({

                success: true,

                employees: result

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
  SHIFTS API (جديد)
=========================================================
*/

/*
=========================================================
  COMPANY LOCATIONS
=========================================================
*/


app.post('/api/admin/locations', requireAdmin, async (req, res) => {
    try {
        const company = await Company.findOne({
            companyId: req.session.companyId
        });

        const clientOfflineId =
            String(req.body.clientOfflineId || '').trim();

        if (company && clientOfflineId) {

            const existingOfflineLocation =
                (company.approvedLocations || [])
                    .find(location =>
                        String(location.clientOfflineId || '') ===
                        clientOfflineId
                    );

            if (existingOfflineLocation) {
                return res.status(200).json({
                    success: true,
                    alreadySynced: true,
                    location: {
                        id: String(existingOfflineLocation._id),
                        _id: String(existingOfflineLocation._id),
                        name: existingOfflineLocation.name || '',
                        type: existingOfflineLocation.type || 'worksite',
                        province: existingOfflineLocation.province || '',
                        fullAddress: existingOfflineLocation.fullAddress || '',
                        parentLocationId: existingOfflineLocation.parentLocationId || '',
                        latitude: existingOfflineLocation.latitude,
                        longitude: existingOfflineLocation.longitude,
                        radiusMeters: existingOfflineLocation.radiusMeters || 200,
                        active: existingOfflineLocation.active !== false,
                        clientOfflineId
                    }
                });
            }
        }


        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'الشركة غير موجودة'
            });
        }

        const name = String(req.body.name || '').trim();
        const type = String(req.body.type || 'worksite').trim();
        const province = String(req.body.province || '').trim();
        const fullAddress = String(req.body.fullAddress || '').trim();
        const parentLocationId =
            String(req.body.parentLocationId || '').trim();

        const latitude = Number(req.body.latitude);
        const longitude = Number(req.body.longitude);
        const radiusMeters = Number(req.body.radiusMeters || 200);

        const allowedTypes = [
            'branch',
            'worksite',
            'warehouse',
            'project',
            'temporary'
        ];

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'اسم الموقع مطلوب'
            });
        }

        if (!allowedTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'نوع الموقع غير صحيح'
            });
        }

        if (
            !Number.isFinite(latitude) ||
            latitude < -90 ||
            latitude > 90 ||
            !Number.isFinite(longitude) ||
            longitude < -180 ||
            longitude > 180
        ) {
            return res.status(400).json({
                success: false,
                message: 'إحداثيات الموقع غير صحيحة'
            });
        }

        if (
            !Number.isFinite(radiusMeters) ||
            radiusMeters <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: 'نصف قطر الموقع غير صحيح'
            });
        }

        company.approvedLocations.push({
            clientOfflineId,
            name,
            type,
            province,
            fullAddress,
            parentLocationId,
            latitude,
            longitude,
            radiusMeters,
            active: true
        });

        await company.save();

        const location =
            company.approvedLocations[
                company.approvedLocations.length - 1
            ];

        return res.status(201).json({
            success: true,
            message: 'تمت إضافة الموقع بنجاح',
            location
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});


app.put('/api/admin/locations/:id', requireAdmin, async (req, res) => {
    try {
        const company = await Company.findOne({
            companyId: req.session.companyId
        });

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'الشركة غير موجودة'
            });
        }

        const location =
            company.approvedLocations.id(req.params.id);

        if (!location) {
            return res.status(404).json({
                success: false,
                message: 'الموقع غير موجود'
            });
        }

        if (req.body.name !== undefined) {
            location.name =
                String(req.body.name || '').trim();
        }

        if (req.body.type !== undefined) {
            const allowedTypes = [
                'branch',
                'worksite',
                'warehouse',
                'project',
                'temporary'
            ];

            if (!allowedTypes.includes(req.body.type)) {
                return res.status(400).json({
                    success: false,
                    message: 'نوع الموقع غير صحيح'
                });
            }

            location.type = req.body.type;
        }

        if (req.body.province !== undefined) {
            location.province =
                String(req.body.province || '').trim();
        }

        if (req.body.fullAddress !== undefined) {
            location.fullAddress =
                String(req.body.fullAddress || '').trim();
        }

        if (req.body.parentLocationId !== undefined) {
            location.parentLocationId =
                String(req.body.parentLocationId || '').trim();
        }

        if (req.body.latitude !== undefined) {
            const latitude = Number(req.body.latitude);

            if (
                !Number.isFinite(latitude) ||
                latitude < -90 ||
                latitude > 90
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'خط العرض غير صحيح'
                });
            }

            location.latitude = latitude;
        }

        if (req.body.longitude !== undefined) {
            const longitude = Number(req.body.longitude);

            if (
                !Number.isFinite(longitude) ||
                longitude < -180 ||
                longitude > 180
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'خط الطول غير صحيح'
                });
            }

            location.longitude = longitude;
        }

        if (req.body.radiusMeters !== undefined) {
            const radius =
                Number(req.body.radiusMeters);

            if (
                !Number.isFinite(radius) ||
                radius <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'نصف القطر غير صحيح'
                });
            }

            location.radiusMeters = radius;
        }

        await company.save();

        return res.json({
            success: true,
            message: 'تم تعديل الموقع',
            location
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});


app.patch('/api/admin/locations/:id/status', requireAdmin, async (req, res) => {
    try {
        const company = await Company.findOne({
            companyId: req.session.companyId
        });

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'الشركة غير موجودة'
            });
        }

        const location =
            company.approvedLocations.id(req.params.id);

        if (!location) {
            return res.status(404).json({
                success: false,
                message: 'الموقع غير موجود'
            });
        }

        location.active =
            req.body.active === true ||
            req.body.active === 'true';

        await company.save();

        return res.json({
            success: true,
            message:
                location.active
                    ? 'تم تفعيل الموقع'
                    : 'تم إيقاف الموقع',
            location
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.get('/api/admin/locations', requireAdmin, async (req, res) => {
    try {
        const company = await Company.findOne({
            companyId: req.session.companyId
        }).lean();

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'الشركة غير موجودة'
            });
        }

        const locations = [];

        /*
         * إبقاء الموقع الرئيسي القديم متوافقاً مع النظام.
         */
        if (
            Number.isFinite(Number(company.latitude)) &&
            Number.isFinite(Number(company.longitude))
        ) {
            locations.push({
                id: 'headquarters',
                name: company.name || 'المقر الرئيسي',
                type: 'headquarters',
                province: '',
                fullAddress: '',
                parentLocationId: '',
                latitude: Number(company.latitude),
                longitude: Number(company.longitude),
                radiusMeters:
                    Number(company.geofenceRadiusMeters) > 0
                        ? Number(company.geofenceRadiusMeters)
                        : 200,
                active: true,
                isPrimary: true
            });
        }

        for (const location of company.approvedLocations || []) {
            locations.push({
                id: String(location._id),
                name: location.name || 'موقع بدون اسم',
                type: location.type || 'worksite',
                province: location.province || '',
                fullAddress: location.fullAddress || '',
                parentLocationId: location.parentLocationId || '',
                latitude: location.latitude,
                longitude: location.longitude,
                radiusMeters:
                    Number(location.radiusMeters) > 0
                        ? Number(location.radiusMeters)
                        : 200,
                active: location.active !== false,
                isPrimary: false,
                createdAt: location.createdAt
            });
        }

        return res.json({
            success: true,
            total: locations.length,
            locations
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.get('/api/admin/shifts', requireAdmin, async (req, res) => {
    try {
        const shifts = await Shift.find({ companyId: req.session.companyId }).sort({ createdAt: -1 }).lean();
        res.json({ success: true, shifts });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/shifts', requireAdmin, async (req, res) => {
    try {

        const clientOfflineId =
            String(req.body.clientOfflineId || '').trim();

        if (clientOfflineId) {

            const existingOfflineShift =
                await Shift.findOne({
                    companyId: req.session.companyId,
                    clientOfflineId
                });

            if (existingOfflineShift) {
                return res.status(200).json({
                    success: true,
                    alreadySynced: true,
                    shift: existingOfflineShift
                });
            }
        }

        const companyId = req.session.companyId;

        const {
            name,
            locationId,
            employeeIds,
            attendanceStart,
            attendanceEnd,
            departureStart,
            departureEnd,
            overtimeStart,
            overtimeEnd
        } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'اسم الشفت مطلوب'
            });
        }

        if (!locationId) {
            return res.status(400).json({
                success: false,
                message: 'يجب اختيار موقع العمل'
            });
        }

        const company = await Company.findOne({
            companyId
        });

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'الشركة غير موجودة'
            });
        }

        /*
         * البحث عن الموقع داخل مواقع نفس الشركة فقط.
         * الموقع الموقوف لا يمكن ربط شفت جديد به.
         */
        /*
         * دعم معرفات المواقع المحلية Offline:
         * إذا كان locationId معرف Mongo نبحث بـ _id،
         * وإذا كان local-* نبحث بـ clientOfflineId.
         */
        const isHeadquarters = String(locationId) === 'headquarters';
        const location = isHeadquarters
            ? (
                Number.isFinite(Number(company.latitude)) &&
                Number.isFinite(Number(company.longitude))
                    ? { _id: 'headquarters', name: 'الفرع الرئيسي', active: true }
                    : null
            )
            : (company.approvedLocations || []).find(
                item =>
                    String(item._id) === String(locationId) ||
                    (
                        item.clientOfflineId &&
                        String(item.clientOfflineId) === String(locationId)
                    )
            );

        if (!location) {
            return res.status(404).json({
                success: false,
                message: 'موقع العمل غير موجود ضمن مواقع الشركة'
            });
        }

        if (location.active === false) {
            return res.status(400).json({
                success: false,
                message: 'لا يمكن ربط الشفت بموقع موقوف'
            });
        }

        /*
         * التحقق من أن الموظفين تابعون لنفس الشركة.
         */
        const rawEmployeeIds =
            Array.isArray(employeeIds)
                ? [...new Set(employeeIds.map(String))]
                : [];

        /*
         * تحويل معرفات الموظفين المحلية Offline
         * إلى MongoDB _id الحقيقي.
         */
        const requestedEmployeeIds = [];

        for (const rawId of rawEmployeeIds) {

            let employee = null;

            if (
                mongoose.Types.ObjectId.isValid(rawId)
            ) {

                employee = await Employee.findOne({
                    _id: rawId,
                    companyId
                }).select('_id').lean();

            } else {

                employee = await Employee.findOne({
                    companyId,
                    clientOfflineId: rawId
                }).select('_id').lean();
            }

            if (!employee) {
                return res.status(400).json({
                    success: false,
                    message:
                        'أحد الموظفين المحددين لا يتبع هذه الشركة أو لم تتم مزامنته بعد'
                });
            }

            requestedEmployeeIds.push(
                String(employee._id)
            );
        }

        const locationName =
            String(location.name || '').trim();

        const shift = await new Shift({
            clientOfflineId,

            companyId,

            name,

            /*
             * branch يبقى للتوافق مع النظام القديم.
             */
            branch: locationName,

            locationId:
                String(location._id),

            locationName,

            employeeIds:
                requestedEmployeeIds,

            attendanceStart:
                String(attendanceStart || ''),

            attendanceEnd:
                String(attendanceEnd || ''),

            departureStart:
                String(departureStart || ''),

            departureEnd:
                String(departureEnd || ''),

            overtimeStart:
                String(overtimeStart || ''),

            overtimeEnd:
                String(overtimeEnd || '')
        }).save();

        return res.status(201).json({
            success: true,
            message: 'تم إنشاء الشفت وربطه بالموقع بنجاح',
            shift
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.put('/api/admin/shifts/:id', requireAdmin, async (req, res) => {
    try {
        const companyId = req.session.companyId;

        const shift = await Shift.findOne({
            _id: req.params.id,
            companyId
        });

        if (!shift) {
            return res.status(404).json({
                success: false,
                message: 'الشفت غير موجود'
            });
        }

        const {
            name,
            locationId,
            employeeIds,
            attendanceStart,
            attendanceEnd,
            departureStart,
            departureEnd,
            overtimeStart,
            overtimeEnd
        } = req.body;

        /*
         * عند تغيير الموقع نتحقق أنه:
         * 1- تابع لنفس الشركة
         * 2- موجود
         * 3- غير موقوف
         */
        if (locationId !== undefined) {

            if (!locationId) {
                return res.status(400).json({
                    success: false,
                    message: 'يجب اختيار موقع العمل'
                });
            }

            const company = await Company.findOne({
                companyId
            });

            if (!company) {
                return res.status(404).json({
                    success: false,
                    message: 'الشركة غير موجودة'
                });
            }

            const isHeadquarters = String(locationId) === 'headquarters';
            const location = isHeadquarters
                ? (
                    Number.isFinite(Number(company.latitude)) &&
                    Number.isFinite(Number(company.longitude))
                        ? { _id: 'headquarters', name: 'الفرع الرئيسي', active: true }
                        : null
                )
                : (company.approvedLocations || []).find(
                    item =>
                        String(item._id) === String(locationId) ||
                        (
                            item.clientOfflineId &&
                            String(item.clientOfflineId) === String(locationId)
                        )
                );

            if (!location) {
                return res.status(404).json({
                    success: false,
                    message: 'موقع العمل غير موجود ضمن مواقع الشركة'
                });
            }

            if (location.active === false) {
                return res.status(400).json({
                    success: false,
                    message: 'لا يمكن ربط الشفت بموقع موقوف'
                });
            }

            const locationName =
                String(location.name || '').trim();

            shift.locationId =
                String(location._id);

            shift.locationName =
                locationName;

            // للتوافق مع النظام القديم
            shift.branch =
                locationName;
        }

        /*
         * التحقق من الموظفين قبل إضافتهم للشفت.
         */
        if (employeeIds !== undefined) {

            if (!Array.isArray(employeeIds)) {
                return res.status(400).json({
                    success: false,
                    message: 'قائمة الموظفين غير صحيحة'
                });
            }

            const rawEmployeeIds =
                [...new Set(
                    employeeIds.map(String)
                )];

            const requestedEmployeeIds = [];

            for (const rawId of rawEmployeeIds) {

                let employee = null;

                if (
                    mongoose.Types.ObjectId.isValid(rawId)
                ) {

                    employee =
                        await Employee.findOne({
                            _id: rawId,
                            companyId
                        })
                        .select('_id')
                        .lean();

                } else {

                    employee =
                        await Employee.findOne({
                            companyId,
                            clientOfflineId: rawId
                        })
                        .select('_id')
                        .lean();
                }

                if (!employee) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'أحد الموظفين المحددين لا يتبع هذه الشركة أو لم تتم مزامنته بعد'
                    });
                }

                requestedEmployeeIds.push(
                    String(employee._id)
                );
            }

            shift.employeeIds =
                requestedEmployeeIds;
        }

        if (name !== undefined)
            shift.name = name;

        if (attendanceStart !== undefined)
            shift.attendanceStart =
                String(attendanceStart || '');

        if (attendanceEnd !== undefined)
            shift.attendanceEnd =
                String(attendanceEnd || '');

        if (departureStart !== undefined)
            shift.departureStart =
                String(departureStart || '');

        if (departureEnd !== undefined)
            shift.departureEnd =
                String(departureEnd || '');

        if (overtimeStart !== undefined)
            shift.overtimeStart =
                String(overtimeStart || '');

        if (overtimeEnd !== undefined)
            shift.overtimeEnd =
                String(overtimeEnd || '');

        await shift.save();

        return res.json({
            success: true,
            message:
                'تم تحديث الشفت بنجاح',
            shift
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.delete('/api/admin/shifts/:id', requireAdmin, async (req, res) => {
    try {
        const shift = await Shift.findOneAndDelete({ _id: req.params.id, companyId: req.session.companyId });
        if (!shift) return res.status(404).json({ success: false, message: 'الشفت غير موجود' });
        res.json({ success: true, message: 'تم حذف الشفت' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

/*
=========================================================
  SALARY RECORDS API (جديد)
=========================================================
*/

/*
=========================================================
  EMPLOYEE DELEGATION / إيفاد
=========================================================
*/

app.post(
    '/api/admin/employees/:employeeId/leave',
    requireAdmin,
    async (req, res) => {
        try {
            const companyId = req.session.companyId;
            const employee = await Employee.findOne({
                _id: req.params.employeeId,
                companyId
            }).lean();

            if (!employee) {
                return res.status(404).json({
                    success: false,
                    message: 'الموظف غير موجود'
                });
            }

            const fromDate = new Date(req.body.fromDate);
            const toDate = new Date(req.body.toDate);
            if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'حدد تاريخ بداية ونهاية الإجازة'
                });
            }
            fromDate.setHours(0, 0, 0, 0);
            toDate.setHours(23, 59, 59, 999);
            if (toDate < fromDate) {
                return res.status(400).json({
                    success: false,
                    message: 'نهاية الإجازة يجب أن تكون بعد بدايتها'
                });
            }

            const leavePaymentType =
                req.body.leavePaymentType === 'unpaid' ? 'unpaid' : 'paid';
            const existingLeaves = await ServiceRequest.find({
                companyId,
                employeeId: String(employee._id),
                type: 'leave',
                status: { $in: ['pending', 'approved'] }
            }).lean();
            const overlaps = existingLeaves.some(item => {
                const start = new Date(item.fromDate || item.requestedDate);
                const end = new Date(item.toDate || item.fromDate || item.requestedDate);
                if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                return fromDate <= end && toDate >= start;
            });
            if (overlaps) {
                return res.status(409).json({
                    success: false,
                    code: 'OVERLAPPING_LEAVE',
                    message: 'توجد إجازة أخرى للموظف ضمن هذه الفترة'
                });
            }

            const request = await new ServiceRequest({
                companyId,
                employeeId: String(employee._id),
                employeeName: employee.name,
                type: 'leave',
                reason: String(req.body.reason || '').trim(),
                requestedDate: fromDate,
                fromDate,
                toDate,
                leavePaymentType,
                status: 'approved',
                processedAt: new Date(),
                processedBy: req.session.username || 'admin'
            }).save();

            return res.status(201).json({
                success: true,
                message: leavePaymentType === 'paid'
                    ? 'تم اعتماد الإجازة براتب'
                    : 'تم اعتماد الإجازة بدون راتب',
                request
            });
        } catch (err) {
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }
);

app.put(
    '/api/admin/employees/:employeeId/delegation',
    requireAdmin,
    async (req, res) => {

        try {

            const companyId =
                req.session.companyId;

            const rawEmployeeId =
                String(req.params.employeeId || '').trim();

            let employee = null;

            if (
                mongoose.Types.ObjectId.isValid(
                    rawEmployeeId
                )
            ) {

                employee =
                    await Employee.findOne({
                        _id: rawEmployeeId,
                        companyId
                    });

            } else {

                employee =
                    await Employee.findOne({
                        companyId,
                        clientOfflineId:
                            rawEmployeeId
                    });
            }

            if (!employee) {
                return res.status(404).json({
                    success: false,
                    message: 'الموظف غير موجود'
                });
            }

            const active =
                req.body.active === true ||
                req.body.active === 'true';

            /*
             * إلغاء الإيفاد.
             */
            if (!active) {

                employee.delegation = {
                    active: false,
                    from: null,
                    to: null,
                    province: '',
                    locationName: '',
                    latitude: null,
                    longitude: null,
                    radiusMeters: 200,
                    allowProvinceWide: false,
                    reason: ''
                };

                await employee.save();

                return res.json({
                    success: true,
                    message: 'تم إنهاء إيفاد الموظف',
                    delegation: employee.delegation
                });
            }

            const from =
                new Date(req.body.from);

            const to =
                new Date(req.body.to);

            if (
                Number.isNaN(from.getTime()) ||
                Number.isNaN(to.getTime())
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'تاريخ بداية ونهاية الإيفاد مطلوبان'
                });
            }

            if (to <= from) {
                return res.status(400).json({
                    success: false,
                    message: 'نهاية الإيفاد يجب أن تكون بعد البداية'
                });
            }

            const province =
                String(
                    req.body.province || ''
                ).trim();

            const locationName =
                String(
                    req.body.locationName || ''
                ).trim();

            const reason =
                String(
                    req.body.reason || ''
                ).trim();

            const allowProvinceWide =
                req.body.allowProvinceWide === true ||
                req.body.allowProvinceWide === 'true';

            let latitude = null;
            let longitude = null;

            if (
                req.body.latitude !== undefined &&
                req.body.latitude !== ''
            ) {
                latitude =
                    Number(req.body.latitude);
            }

            if (
                req.body.longitude !== undefined &&
                req.body.longitude !== ''
            ) {
                longitude =
                    Number(req.body.longitude);
            }

            if (
                latitude !== null &&
                (
                    !Number.isFinite(latitude) ||
                    latitude < -90 ||
                    latitude > 90
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'خط العرض غير صحيح'
                });
            }

            if (
                longitude !== null &&
                (
                    !Number.isFinite(longitude) ||
                    longitude < -180 ||
                    longitude > 180
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'خط الطول غير صحيح'
                });
            }

            const radiusMeters =
                Number(
                    req.body.radiusMeters || 200
                );

            if (
                !Number.isFinite(radiusMeters) ||
                radiusMeters <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'نصف قطر الإيفاد غير صحيح'
                });
            }

            employee.delegation = {
                active: true,
                from,
                to,
                province,
                locationName,
                latitude,
                longitude,
                radiusMeters,
                allowProvinceWide,
                reason
            };

            await employee.save();

            return res.json({
                success: true,
                message: 'تم اعتماد إيفاد الموظف',
                employeeId: String(employee._id),
                employeeName: employee.name,
                delegation: employee.delegation
            });

        } catch (err) {

            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }
);


/*
=========================================================
  ADMIN REPORTS
=========================================================
*/

app.get('/api/admin/reports', requireAdmin, async (req, res) => {
    try {

        const companyId = req.session.companyId;

        const type =
            String(req.query.type || '').trim();

        const scope =
            String(req.query.scope || 'company').trim();

        const branch =
            String(req.query.branch || '').trim();

        const employeeId =
            String(req.query.employeeId || '').trim();

        let from = null;
        let to = null;

        if (req.query.from) {
            from = new Date(req.query.from);

            if (Number.isNaN(from.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'تاريخ البداية غير صحيح'
                });
            }

            from.setHours(0, 0, 0, 0);
        }

        if (req.query.to) {
            to = new Date(req.query.to);

            if (Number.isNaN(to.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'تاريخ النهاية غير صحيح'
                });
            }

            to.setHours(23, 59, 59, 999);
        }

        if (from && to && to < from) {
            return res.status(400).json({
                success: false,
                message: 'تاريخ النهاية يجب أن يكون بعد البداية'
            });
        }

        /*
         * الموظفون المشمولون بالتقرير
         */
        const employeeQuery = { companyId };

        if (scope === 'branch' && branch) {
            employeeQuery.branch = branch;
        }

        if (scope === 'employee' && employeeId) {
            employeeQuery._id = employeeId;
        }

        const employees =
            await Employee.find(employeeQuery).lean();

        const employeeIds =
            employees.map(e => String(e._id));

        /*
         * تقرير الرواتب
         */
        if (type === 'salary') {

            const query = { companyId };

            if (employeeIds.length) {
                query.employeeId = {
                    $in: employeeIds
                };
            }

            if (from || to) {
                query.createdAt = {
                    ...(from ? { $gte: from } : {}),
                    ...(to ? { $lte: to } : {})
                };
            }

            const records =
                await SalaryRecord
                    .find(query)
                    .sort({ employeeName: 1 })
                    .lean();

            return res.json({
                success: true,
                type,
                scope,
                total: records.length,
                records
            });
        }

        /*
         * تقرير الحضور والغياب
         */
        if (type === 'attendance') {

            const query = { companyId };

            if (employeeIds.length) {
                query.employeeId = {
                    $in: employeeIds
                };
            }

            if (from || to) {
                query.timestamp = {
                    ...(from ? { $gte: from } : {}),
                    ...(to ? { $lte: to } : {})
                };
            }

            const attendance =
                await Attendance
                    .find(query)
                    .sort({ timestamp: 1 })
                    .lean();

            const leaves =
                await ServiceRequest
                    .find({
                        companyId,
                        employeeId: {
                            $in: employeeIds
                        },
                        type: 'leave',
                        status: 'approved'
                    })
                    .lean();

            return res.json({
                success: true,
                type,
                scope,
                employees,
                attendance,
                leaves
            });
        }

        /*
         * تقرير الإيفادات
         */
        if (type === 'delegation') {

            const records =
                employees
                    .filter(e =>
                        e.delegation &&
                        (
                            e.delegation.active ||
                            e.delegation.from ||
                            e.delegation.to
                        )
                    )
                    .map(e => ({
                        employeeId:
                            String(e._id),

                        employeeName:
                            e.name || '',

                        branch:
                            e.branch || '',

                        ...e.delegation
                    }))
                    .filter(d => {

                        if (!from && !to)
                            return true;

                        const df =
                            d.from
                                ? new Date(d.from)
                                : null;

                        const dt =
                            d.to
                                ? new Date(d.to)
                                : null;

                        if (from && dt && dt < from)
                            return false;

                        if (to && df && df > to)
                            return false;

                        return true;
                    });

            return res.json({
                success: true,
                type,
                scope,
                total: records.length,
                records
            });
        }

        /*
         * تقرير المواقع
         */
        if (type === 'locations') {

            const company =
                await Company
                    .findOne({ companyId })
                    .lean();

            if (!company) {
                return res.status(404).json({
                    success: false,
                    message: 'الشركة غير موجودة'
                });
            }

            const records = [];

            if (
                Number.isFinite(company.latitude) &&
                Number.isFinite(company.longitude)
            ) {
                records.push({
                    name:
                        company.name ||
                        'المقر الرئيسي',

                    type:
                        'headquarters',

                    latitude:
                        company.latitude,

                    longitude:
                        company.longitude,

                    radiusMeters:
                        company.geofenceRadiusMeters || 200,

                    active:
                        true
                });
            }

            for (
                const loc
                of company.approvedLocations || []
            ) {
                records.push({
                    id:
                        String(loc._id),

                    name:
                        loc.name || '',

                    type:
                        loc.type || 'worksite',

                    province:
                        loc.province || '',

                    fullAddress:
                        loc.fullAddress || '',

                    latitude:
                        loc.latitude,

                    longitude:
                        loc.longitude,

                    radiusMeters:
                        loc.radiusMeters || 200,

                    active:
                        loc.active !== false
                });
            }

            return res.json({
                success: true,
                type,
                total: records.length,
                records
            });
        }

        /*
         * تقييم الموظفين
         */
        if (type === 'evaluation') {

            const query = { companyId };

            if (employeeIds.length) {
                query.employeeId = {
                    $in: employeeIds
                };
            }

            if (from || to) {
                query.fromDate = {
                    ...(from ? { $gte: from } : {}),
                    ...(to ? { $lte: to } : {})
                };
            }

            const records =
                await EmployeeEvaluation
                    .find(query)
                    .sort({ fromDate: -1 })
                    .lean();

            return res.json({
                success: true,
                type,
                total: records.length,
                records
            });
        }

        return res.status(400).json({
            success: false,
            message: 'نوع التقرير غير معروف'
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.get('/api/admin/attendance', requireAdmin, async (req, res) => {
    try {

        const companyId =
            req.session.companyId;

        const employeeId =
            String(
                req.query.employeeId || ''
            ).trim();

        const type =
            String(
                req.query.type || ''
            ).trim();

        const status =
            String(
                req.query.status || ''
            ).trim();

        const query = {
            companyId
        };

        if (employeeId) {
            query.employeeId =
                employeeId;
        }

        if (type) {
            query.type =
                type;
        }

        if (status === 'delegation') {
            query.delegationApplied =
                true;
        }

        if (status === 'normal') {
            query.delegationApplied =
                false;
        }

        if (
            req.query.from ||
            req.query.to
        ) {

            query.timestamp = {};

            if (req.query.from) {

                const from =
                    new Date(req.query.from);

                if (
                    Number.isNaN(
                        from.getTime()
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message: 'تاريخ البداية غير صحيح'
                    });
                }

                from.setHours(
                    0, 0, 0, 0
                );

                query.timestamp.$gte =
                    from;
            }

            if (req.query.to) {

                const to =
                    new Date(req.query.to);

                if (
                    Number.isNaN(
                        to.getTime()
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message: 'تاريخ النهاية غير صحيح'
                    });
                }

                to.setHours(
                    23, 59, 59, 999
                );

                query.timestamp.$lte =
                    to;
            }
        }

        const attendance =
            await Attendance
                .find(query)
                .sort({
                    timestamp: -1
                })
                .limit(2000)
                .lean();

        /*
         * تعبئة أسماء السجلات القديمة
         * التي سبقت إضافة employeeName.
         */
        const missingIds =
            [...new Set(
                attendance
                    .filter(x=>!x.employeeName)
                    .map(x=>x.employeeId)
            )];

        let nameMap = {};

        if (missingIds.length) {

            const employees =
                await Employee.find({
                    _id: {
                        $in: missingIds
                    },
                    companyId
                })
                .select('_id name')
                .lean();

            nameMap =
                Object.fromEntries(
                    employees.map(
                        e=>[
                            String(e._id),
                            e.name || ''
                        ]
                    )
                );
        }

        const records =
            attendance.map(row=>({
                ...row,
                employeeName:
                    row.employeeName ||
                    nameMap[row.employeeId] ||
                    ''
            }));

        return res.json({
            success: true,
            total: records.length,
            attendance: records
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.get('/api/employee/payroll', async (req, res) => {
    try {
        const employeeId = String(req.query.employeeId || '').trim();
        const deviceId = String(req.query.deviceId || '').trim();
        if (!employeeId || !deviceId) return res.status(400).json({ success: false, message: 'بيانات الموظف والجهاز مطلوبة' });
        const employee = await Employee.findById(employeeId).lean();
        if (!employee || employee.deviceId !== deviceId || employee.credentialsStatus !== 'active') {
            return res.status(403).json({ success: false, message: 'الجهاز أو حساب الموظف غير معتمد' });
        }
        const salary = await SalaryRecord.findOne({ companyId: employee.companyId, employeeId }).lean();
        res.json({ success: true, salary: salary || null });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/admin/salaries', requireAdmin, async (req, res) => {
    try {
        const companyId = req.session.companyId;
        const employees = await Employee.find({ companyId }).lean();
        const existing = await SalaryRecord.find({ companyId })
            .select('employeeId')
            .lean();
        const existingIds = new Set(existing.map(item => String(item.employeeId)));
        const missing = employees.filter(employee => !existingIds.has(String(employee._id)));

        if (missing.length) {
            await SalaryRecord.insertMany(
                missing.map(employee => ({
                    companyId,
                    employeeId: String(employee._id),
                    employeeName: employee.name || '',
                    employeeSerial: employee.employeeSerial || '',
                    specialty: employee.specialty || '',
                    workplace: employee.workplace || employee.branch || '',
                    wageType: employee.wageType || 'monthly',
                    basicSalary: Number(employee.salary || 0),
                    grossSalary: 0,
                    netSalary: 0
                })),
                { ordered: false }
            );
        }
        const salaries = await SalaryRecord.find({ companyId }).sort({ employeeName: 1 }).lean();
        res.json({ success: true, salaries, addedAutomatically: missing.length });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/salaries', requireAdmin, async (req, res) => {
    try {
        const { employeeId, employeeName, specialty, workplace, shiftName, socialSecurity, basicSalary, allowances, loans, loanDeduction, securityDeduction, otherDeductions, bonuses } = req.body;
        if (!employeeId) return res.status(400).json({ success: false, message: 'employeeId مطلوب' });
        const existing = await SalaryRecord.findOne({ companyId: req.session.companyId, employeeId });
        if (existing) return res.status(409).json({ success: false, message: 'سجل راتب موجود مسبقاً' });
        const totalDeductions = (loanDeduction || 0) + (securityDeduction || 0) + (otherDeductions || 0);
        const salary = await new SalaryRecord({
            companyId: req.session.companyId,
            employeeId,
            employeeName: employeeName || '',
            specialty: specialty || '',
            workplace: workplace || '',
            shiftName: shiftName || '',
            socialSecurity: socialSecurity || 'غير مسجل',
            basicSalary: basicSalary || 0,
            allowances: allowances || 0,
            loans: loans || 0,
            loanDeduction: loanDeduction || 0,
            securityDeduction: securityDeduction || 0,
            otherDeductions: otherDeductions || 0,
            bonuses: bonuses || 0,
            totalDeductions,
            grossSalary: 0,
            netSalary: 0
        }).save();
        res.status(201).json({ success: true, salary });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/admin/salaries/:id', requireAdmin, async (req, res) => {
    try {
        const salary = await SalaryRecord.findOne({ _id: req.params.id, companyId: req.session.companyId });
        if (!salary) return res.status(404).json({ success: false, message: 'السجل غير موجود' });
        const { basicSalary, allowances, loans, loanDeduction, securityDeduction, otherDeductions, bonuses, socialSecurity } = req.body;
        salary.socialSecurity = socialSecurity ?? salary.socialSecurity;
        salary.basicSalary = basicSalary ?? salary.basicSalary;
        salary.allowances = allowances ?? salary.allowances;
        salary.loans = loans ?? salary.loans;
        salary.loanDeduction = loanDeduction ?? salary.loanDeduction;
        salary.securityDeduction = securityDeduction ?? salary.securityDeduction;
        salary.otherDeductions = otherDeductions ?? salary.otherDeductions;
        salary.bonuses = bonuses ?? salary.bonuses;
        salary.totalDeductions = salary.loanDeduction + salary.securityDeduction + salary.otherDeductions;
        salary.currentPeriodEarnings = Math.max(
            0,
            Number(salary.grossSalary || 0) +
            Number(salary.allowances || 0) +
            Number(salary.bonuses || 0) +
            Number(salary.overtimeAmount || 0) -
            Number(salary.totalDeductions || 0)
        );
        salary.netSalary = Number(salary.carriedBalance || 0) + salary.currentPeriodEarnings;
        await salary.save();
        res.json({ success: true, salary });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/admin/salaries/:id', requireAdmin, async (req, res) => {
    try {
        const salary = await SalaryRecord.findOneAndDelete({ _id: req.params.id, companyId: req.session.companyId });
        if (!salary) return res.status(404).json({ success: false, message: 'السجل غير موجود' });
        res.json({ success: true, message: 'تم حذف السجل' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

function payrollDayKey(value) {
    return new Intl.DateTimeFormat('en-CA', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        timeZone: 'Asia/Baghdad'
    }).format(new Date(value));
}

function payrollDateKeys(from, to) {
    const keys = [];
    const cursor = new Date(from);
    cursor.setHours(12, 0, 0, 0);
    const end = new Date(to);
    end.setHours(12, 0, 0, 0);
    while (cursor <= end && keys.length < 370) {
        keys.push(payrollDayKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return keys;
}

app.post('/api/admin/payroll/calculate', requireAdmin, async (req, res) => {
    try {
        const companyId = req.session.companyId;
        const from = new Date(req.body.from);
        const to = new Date(req.body.to);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
            return res.status(400).json({ success: false, message: 'فترة الرواتب غير صحيحة' });
        }
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 59, 999);
        const periodKeys = payrollDateKeys(from, to);
        if (!periodKeys.length || periodKeys.length > 366) {
            return res.status(400).json({ success: false, message: 'فترة الرواتب يجب ألا تتجاوز سنة' });
        }
        const calculationKey = `${periodKeys[0]}:${periodKeys[periodKeys.length - 1]}`;
        const [employees, shifts, attendance, leaves, replacements, loanRecords, salaries] = await Promise.all([
            Employee.find({ companyId, employmentStatus: { $ne: 'inactive' } }).lean(),
            Shift.find({ companyId }).lean(),
            Attendance.find({ companyId, timestamp: { $gte: from, $lte: to } }).lean(),
            ServiceRequest.find({ companyId, type: 'leave', status: 'approved', fromDate: { $lte: to }, toDate: { $gte: from } }).lean(),
            DailyWorkerRecord.find({ companyId, workDate: { $lte: to } }).lean(),
            LoanRecord.find({ companyId }).lean(),
            SalaryRecord.find({ companyId })
        ]);
        const salaryByEmployee = new Map(salaries.map(item => [String(item.employeeId), item]));
        const attendanceByEmployee = new Map();
        attendance.forEach(item => {
            const id = String(item.employeeId);
            const day = payrollDayKey(item.timestamp);
            if (!attendanceByEmployee.has(id)) attendanceByEmployee.set(id, new Map());
            if (!attendanceByEmployee.get(id).has(day)) attendanceByEmployee.get(id).set(day, new Set());
            attendanceByEmployee.get(id).get(day).add(item.type === 'attendance' ? 'in' : 'out');
        });
        const validAttendanceDays = id => new Set(
            [...(attendanceByEmployee.get(id) || new Map()).entries()]
                .filter(([, types]) => types.has('in') && types.has('out'))
                .map(([day]) => day)
        );
        const leaveDays = (id, paymentType) => {
            const result = new Set();
            leaves.filter(item => String(item.employeeId) === id && item.leavePaymentType === paymentType)
                .forEach(item => payrollDateKeys(
                    new Date(Math.max(from.getTime(), new Date(item.fromDate || item.requestedDate).getTime())),
                    new Date(Math.min(to.getTime(), new Date(item.toDate || item.fromDate || item.requestedDate).getTime()))
                ).forEach(day => result.add(day)));
            return result;
        };
        const replacementFor = new Map();
        const replacementEarned = new Map();
        replacements.forEach(item => {
            const start = new Date(item.workDate);
            const end = new Date(start);
            end.setDate(end.getDate() + Math.max(1, Number(item.days || 1)) - 1);
            if (end < from || start > to) return;
            const overlapDays = payrollDateKeys(
                new Date(Math.max(from.getTime(), start.getTime())),
                new Date(Math.min(to.getTime(), end.getTime()))
            ).length;
            const amount = overlapDays * Number(item.dailyRate || 0);
            if (item.workerEmployeeId) replacementEarned.set(String(item.workerEmployeeId), Number(replacementEarned.get(String(item.workerEmployeeId)) || 0) + amount);
            if (item.replacementForEmployeeId && item.deductionPolicy === 'employee') replacementFor.set(String(item.replacementForEmployeeId), Number(replacementFor.get(String(item.replacementForEmployeeId)) || 0) + amount);
        });
        const loansByEmployee = new Map();
        loanRecords.forEach(loan => {
            const paid = (loan.repayments || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
            const remaining = Math.max(0, Number(loan.totalLoanAmount || 0) - paid);
            loansByEmployee.set(String(loan.employeeId), Number(loansByEmployee.get(String(loan.employeeId)) || 0) + remaining);
        });
        const invalid = [];
        const calculated = [];
        for (const employee of employees) {
            const id = String(employee._id);
            const basicSalary = Number(employee.salary || 0);
            const workplace = String(employee.workplace || employee.branch || employee.location || '').trim();
            const shift = shifts.find(item => (item.employeeIds || []).map(String).includes(id));
            const reasons = [];
            if (!(basicSalary > 0)) reasons.push('الراتب أو الأجر صفر');
            if (!workplace) reasons.push('موقع العمل غير محدد');
            if (!shift) reasons.push('الشفت غير محدد');
            if (reasons.length) {
                invalid.push({ employeeId: id, employeeName: employee.name, reasons });
                continue;
            }
            const attendanceDays = validAttendanceDays(id);
            const paidLeaveDays = leaveDays(id, 'paid');
            const unpaidLeaveDays = leaveDays(id, 'unpaid');
            const delegationDays = new Set();
            const delegation = employee.delegation || {};
            if (delegation.active && delegation.from && delegation.to) {
                payrollDateKeys(
                    new Date(Math.max(from.getTime(), new Date(delegation.from).getTime())),
                    new Date(Math.min(to.getTime(), new Date(delegation.to).getTime()))
                ).forEach(day => delegationDays.add(day));
            }
            const payableDays = new Set([...attendanceDays, ...paidLeaveDays, ...delegationDays]);
            unpaidLeaveDays.forEach(day => payableDays.delete(day));
            const wageType = ['daily', 'weekly', 'monthly'].includes(employee.wageType) ? employee.wageType : 'monthly';
            const divisor = wageType === 'daily' ? 1 : wageType === 'weekly' ? 7 : new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
            const dailyRate = wageType === 'daily' ? basicSalary : basicSalary / divisor;
            const earnedFromDays = dailyRate * payableDays.size;
            let salary = salaryByEmployee.get(id);
            if (!salary) salary = new SalaryRecord({ companyId, employeeId: id });
            const carriedBalance = salary.calculationKey === calculationKey
                ? Number(salary.carriedBalance || 0)
                : Number(salary.netSalary || 0);
            const replacementAddition = Number(replacementEarned.get(id) || 0);
            const replacementDeduction = Number(replacementFor.get(id) || 0);
            const outstandingLoans = Number(loansByEmployee.get(id) || 0);
            const automaticInstallment = Math.min(outstandingLoans, (employee.loans || []).reduce((sum, loan) => sum + Math.min(Number(loan.monthlyInstallment || 0), Number(loan.remainingAmount || 0)), 0));
            const loanDeduction = automaticInstallment || Math.min(outstandingLoans, Number(salary.loanDeduction || 0));
            const totalDeductions = loanDeduction + replacementDeduction + Number(salary.securityDeduction || 0) + Number(salary.otherDeductions || 0);
            const currentPeriodEarnings = Math.max(0, earnedFromDays + replacementAddition + Number(salary.allowances || 0) + Number(salary.bonuses || 0) + Number(salary.overtimeAmount || 0) - totalDeductions);
            salary.set({
                employeeName: employee.name || '', employeeSerial: employee.employeeSerial || '', specialty: employee.specialty || '', workplace,
                shiftName: shift.name || '', wageType, basicSalary, dailyRate, weeklyRate: wageType === 'weekly' ? basicSalary : 0,
                payrollFrom: from, payrollTo: to, attendanceDays: payableDays.size, attendanceCount: attendanceDays.size,
                paidLeaveDays: paidLeaveDays.size, unpaidLeaveDays: unpaidLeaveDays.size,
                absenceDays: Math.max(0, periodKeys.length - payableDays.size - unpaidLeaveDays.size), replacementDays: replacementAddition > 0 ? Math.round(replacementAddition / Math.max(dailyRate, 1)) : 0,
                loans: outstandingLoans, loanDeduction, replacementDeduction, totalDeductions,
                grossSalary: earnedFromDays + replacementAddition, carriedBalance, currentPeriodEarnings,
                netSalary: carriedBalance + currentPeriodEarnings, calculatedAt: new Date(), calculationKey,
                payoutStatus: salary.pendingPayoutBatchId ? salary.payoutStatus : 'unpaid'
            });
            await salary.save();
            calculated.push({ employeeId: id, employeeName: employee.name, payableDays: payableDays.size, netSalary: salary.netSalary, carriedBalance });
        }
        return res.json({ success: true, calculationKey, calculatedCount: calculated.length, invalidCount: invalid.length, calculated, invalid });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

/*
=========================================================
  LOAN RECORDS API (جديد)
=========================================================
*/

/*
=========================================================
  PAYROLL PAYOUT SETTINGS + BATCHES
=========================================================
*/

app.put(
    '/api/admin/salaries/:id/payout-settings',
    requireAdmin,
    async (req, res) => {

        try {

            const salary =
                await SalaryRecord.findOne({
                    _id: req.params.id,
                    companyId: req.session.companyId
                });

            if (!salary) {
                return res.status(404).json({
                    success: false,
                    message: 'سجل الراتب غير موجود'
                });
            }

            const payoutMethod =
                String(
                    req.body.payoutMethod || 'cash'
                ).trim();

            if (
                !['cash', 'card', 'bank']
                    .includes(payoutMethod)
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'طريقة الصرف غير صحيحة'
                });
            }

            salary.payoutMethod =
                payoutMethod;

            salary.payoutSelected =
                req.body.payoutSelected === true;

            salary.payoutBankName =
                String(
                    req.body.payoutBankName || ''
                ).trim();

            salary.payoutAccountName =
                String(
                    req.body.payoutAccountName || ''
                ).trim();

            salary.payoutReference =
                String(
                    req.body.payoutReference || ''
                ).trim();

            salary.payoutLast4 =
                String(
                    req.body.payoutLast4 || ''
                )
                .replace(/\D/g, '')
                .slice(-4);

            if (
                payoutMethod !== 'cash' &&
                salary.payoutSelected &&
                !salary.payoutReference
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        'مرجع البطاقة أو الحساب مطلوب'
                });
            }

            salary.payoutStatus =
                salary.payoutSelected
                    ? 'ready'
                    : 'unpaid';

            await salary.save();

            return res.json({
                success: true,
                message:
                    'تم حفظ إعدادات صرف الراتب',
                salary
            });

        } catch (err) {

            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }
);


function payrollBatchItemFromSalary(salary) {

    return {
        salaryRecordId:
            String(salary._id),

        employeeId:
            String(salary.employeeId || ''),

        employeeName:
            salary.employeeName || '',

        employeeSerial:
            salary.employeeSerial || '',

        specialty:
            salary.specialty || '',

        workplace:
            salary.workplace || '',

        payoutMethod:
            salary.payoutMethod || 'cash',

        bankName:
            salary.payoutBankName || '',

        accountName:
            salary.payoutAccountName || '',

        payoutReference:
            salary.payoutReference || '',

        payoutLast4:
            salary.payoutLast4 || '',

        basicSalary:
            Number(
                salary.basicSalary || 0
            ),

        allowances:
            Number(
                salary.allowances || 0
            ),

        bonuses:
            Number(
                salary.bonuses || 0
            ),

        totalDeductions:
            Number(
                salary.totalDeductions || 0
            ),

        netSalary:
            Number(
                salary.netSalary || 0
            ),

        payoutStatus:
            'ready'
    };
}

async function archiveAttendanceAfterPayroll({ companyId, retentionDays, archivedBy, payrollBatchId }) {
    const days = [7, 15, 30].includes(Number(retentionDays)) ? Number(retentionDays) : 30;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const attendance = await Attendance.find({
        companyId,
        timestamp: { $lte: cutoff }
    }).lean();

    if (!attendance.length) {
        return { archivedCount: 0, retentionDays: days, cutoff };
    }

    const sourceIds = attendance.map(item => String(item._id));
    const existing = await ArchiveRecord.find({
        companyId,
        sourceType: 'Attendance',
        sourceId: { $in: sourceIds }
    }).select('sourceId').lean();
    const existingIds = new Set(existing.map(item => String(item.sourceId)));
    const pending = attendance.filter(item => !existingIds.has(String(item._id)));

    if (pending.length) {
        await ArchiveRecord.insertMany(pending.map(item => ({
            companyId,
            category: 'information',
            sourceType: 'Attendance',
            sourceId: String(item._id),
            snapshotId: String(payrollBatchId || ''),
            employeeId: String(item.employeeId || ''),
            employeeName: item.employeeName || '',
            title: `سجل بصمة - ${item.employeeName || item.employeeId || item._id}`,
            note: `أُرشف تلقائيًا بعد احتساب الرواتب وفق مدة الاحتفاظ (${days} يومًا)`,
            payload: item,
            archivedBy: archivedBy || 'admin'
        })));
    }

    await Attendance.deleteMany({
        companyId,
        _id: { $in: attendance.map(item => item._id) }
    });

    await new ArchiveRecord({
        companyId,
        category: 'operation',
        sourceType: 'AttendanceRetention',
        sourceId: String(payrollBatchId || ''),
        snapshotId: String(payrollBatchId || ''),
        title: 'أرشفة سجلات البصمة بعد احتساب الرواتب',
        note: `تم نقل ${attendance.length} سجل بصمة إلى الأرشيف بعد مرور ${days} يومًا`,
        payload: { archivedCount: attendance.length, retentionDays: days, cutoff, payrollBatchId },
        archivedBy: archivedBy || 'admin'
    }).save();

    return { archivedCount: attendance.length, retentionDays: days, cutoff };
}


app.post(
    '/api/admin/payroll-batches/preview',
    requireAdmin,
    async (req, res) => {

        try {

            const payoutType =
                String(
                    req.body.payoutType || ''
                ).trim();

            if (
                !['card', 'bank', 'cash']
                    .includes(payoutType)
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        'نوع دفعة الرواتب غير صحيح'
                });
            }

            const branch =
                String(
                    req.body.branch || ''
                ).trim();

            const filter = {
                companyId:
                    req.session.companyId,

                payoutMethod:
                    payoutType,

                pendingPayoutBatchId: {
                    $in: ['', null]
                }
            };

            if (payoutType !== 'cash') {
                filter.payoutSelected =
                    true;
            }

            if (branch) {
                filter.workplace =
                    branch;
            }

            const salaries =
                await SalaryRecord
                    .find(filter)
                    .sort({
                        employeeName: 1
                    })
                    .lean();

            const items =
                salaries.map(
                    payrollBatchItemFromSalary
                );

            const invalid =
                items.filter(
                    item =>
                        item.netSalary <= 0 ||
                        (
                            payoutType !== 'cash' &&
                            !item.payoutReference
                        )
                );

            const totalAmount =
                items.reduce(
                    (sum, item) =>
                        sum +
                        Number(
                            item.netSalary || 0
                        ),
                    0
                );

            return res.json({
                success: true,
                payoutType,
                branch,
                employeesCount:
                    items.length,
                totalAmount,
                invalidCount:
                    invalid.length,
                invalid,
                items
            });

        } catch (err) {

            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }
);


app.post(
    '/api/admin/payroll-batches',
    requireAdmin,
    async (req, res) => {

        try {

            const payoutType =
                String(
                    req.body.payoutType || ''
                ).trim();

            if (
                !['card', 'bank', 'cash']
                    .includes(payoutType)
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        'نوع دفعة الرواتب غير صحيح'
                });
            }

            const branch =
                String(
                    req.body.branch || ''
                ).trim();

            const filter = {
                companyId:
                    req.session.companyId,

                payoutMethod:
                    payoutType,

                pendingPayoutBatchId: {
                    $in: ['', null]
                }
            };

            if (payoutType !== 'cash') {
                filter.payoutSelected =
                    true;
            }

            if (branch) {
                filter.workplace =
                    branch;
            }

            const salaries =
                await SalaryRecord
                    .find(filter)
                    .sort({
                        employeeName: 1
                    });

            if (!salaries.length) {
                return res.status(400).json({
                    success: false,
                    message:
                        'لا توجد رواتب مطابقة لهذه الدفعة'
                });
            }

            const items =
                salaries.map(
                    payrollBatchItemFromSalary
                );

            const invalid =
                items.filter(
                    item =>
                        item.netSalary <= 0 ||
                        (
                            payoutType !== 'cash' &&
                            !item.payoutReference
                        )
                );

            if (invalid.length) {
                return res.status(400).json({
                    success: false,
                    message:
                        'توجد سجلات غير جاهزة للصرف',
                    invalid
                });
            }

            const now =
                new Date();

            const batchNumber =
                [
                    req.session.companyId,
                    payoutType,
                    now.getFullYear(),
                    String(
                        now.getMonth() + 1
                    ).padStart(2, '0'),
                    String(
                        now.getDate()
                    ).padStart(2, '0'),
                    String(
                        now.getHours()
                    ).padStart(2, '0'),
                    String(
                        now.getMinutes()
                    ).padStart(2, '0'),
                    String(
                        now.getSeconds()
                    ).padStart(2, '0'),
                    String(
                        now.getMilliseconds()
                    ).padStart(3, '0')
                ].join('-');

            const totalAmount =
                items.reduce(
                    (sum, item) =>
                        sum +
                        Number(
                            item.netSalary || 0
                        ),
                    0
                );

            const batch =
                await new PayrollBatch({

                    companyId:
                        req.session.companyId,

                    batchNumber,

                    payoutType,

                    branch,

                    payrollFrom:
                        req.body.payrollFrom
                            ? new Date(
                                req.body.payrollFrom
                            )
                            : undefined,

                    payrollTo:
                        req.body.payrollTo
                            ? new Date(
                                req.body.payrollTo
                            )
                            : undefined,

                    status:
                        'approved',

                    items,

                    employeesCount:
                        items.length,

                    totalAmount,

                    preparedBy:
                        req.session.username ||
                        'admin',

                    approvedBy:
                        req.session.username ||
                        'admin',

                    approvedAt:
                        new Date()

                }).save();

            await SalaryRecord.updateMany(
                {
                    _id: {
                        $in:
                            salaries.map(
                                salary =>
                                    salary._id
                            )
                    }
                },
                {
                    $set: {
                        payoutStatus:
                            payoutType === 'cash'
                                ? 'ready'
                                : 'processing',
                        pendingPayoutBatchId:
                            String(batch._id)
                    }
                }
            );

            const company = await Company.findOne({
                companyId: req.session.companyId
            }).select('attendanceRetentionDays').lean();

            let attendanceArchive = {
                archivedCount: 0,
                retentionDays: Number(company?.attendanceRetentionDays || 30)
            };
            let archiveWarning = '';

            try {
                attendanceArchive = await archiveAttendanceAfterPayroll({
                    companyId: req.session.companyId,
                    retentionDays: company?.attendanceRetentionDays,
                    archivedBy: req.session.username || 'admin',
                    payrollBatchId: batch._id
                });
            } catch (archiveError) {
                archiveWarning = 'تم احتساب الرواتب، لكن تعذرت أرشفة سجلات البصمة ولم يُحذف أي سجل غير مؤرشف';
                console.error('[attendance-archive]', archiveError);
            }

            return res.status(201).json({
                success: true,
                message:
                    'تم اعتماد واحتساب دفعة الرواتب',
                batch,
                attendanceArchive,
                archiveWarning
            });

        } catch (err) {

            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }
);


app.get(
    '/api/admin/payroll-batches',
    requireAdmin,
    async (req, res) => {

        try {

            const batches =
                await PayrollBatch
                    .find({
                        companyId:
                            req.session.companyId
                    })
                    .sort({
                        createdAt: -1
                    })
                    .limit(200)
                    .lean();

            return res.json({
                success: true,
                batches
            });

        } catch (err) {

            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }
);

app.post(
    '/api/admin/payroll-batches/:id/confirm-payment',
    requireAdmin,
    async (req, res) => {
        try {
            const companyId = req.session.companyId;
            const batch = await PayrollBatch.findOne({
                _id: req.params.id,
                companyId
            });

            if (!batch) {
                return res.status(404).json({
                    success: false,
                    message: 'دفعة الرواتب غير موجودة'
                });
            }

            if (batch.paymentConfirmedAt || batch.status === 'completed') {
                return res.json({
                    success: true,
                    alreadyConfirmed: true,
                    message: 'تم تأكيد دفع هذه الدفعة مسبقًا',
                    batch
                });
            }

            if (!['approved', 'processing', 'partially-completed'].includes(batch.status)) {
                return res.status(409).json({
                    success: false,
                    message: 'حالة الدفعة لا تسمح بتأكيد الدفع'
                });
            }

            const paidAt = new Date();
            const periodDate = batch.payrollTo || batch.payrollFrom || batch.approvedAt || paidAt;
            const paymentPeriod = new Intl.DateTimeFormat('ar-IQ', {
                month: 'long',
                year: 'numeric',
                timeZone: 'Asia/Baghdad'
            }).format(periodDate);
            const paidStatus = batch.payoutType === 'cash' ? 'cash-paid' : 'transferred';

            batch.items.forEach(item => {
                item.payoutStatus = paidStatus;
                item.paidAt = paidAt;
                item.notes = `تم دفع راتب شهر ${paymentPeriod} بتاريخ ${paidAt.toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' })}`;
            });
            batch.status = 'completed';
            batch.completedAt = paidAt;
            batch.paymentConfirmedAt = paidAt;
            batch.paymentConfirmedBy = req.session.username || 'admin';
            batch.paymentPeriod = paymentPeriod;
            await batch.save();

            const salaryUpdates = batch.items
                .filter(item => item.salaryRecordId)
                .map(item => ({
                    updateOne: {
                        filter: {
                            _id: item.salaryRecordId,
                            companyId
                        },
                        update: {
                            $set: {
                                payoutStatus: paidStatus,
                                lastPayoutAt: paidAt,
                                lastPaidAmount: Number(item.netSalary || 0),
                                lastPaidPeriod: paymentPeriod,
                                lastPaidBatchId: String(batch._id),
                                pendingPayoutBatchId: '',
                                payrollFrom: null,
                                payrollTo: null,
                                allowances: 0,
                                loans: 0,
                                loanDeduction: 0,
                                replacementDeduction: 0,
                                absenceDeduction: 0,
                                socialSecurityDeduction: 0,
                                securityDeduction: 0,
                                otherDeductions: 0,
                                bonuses: 0,
                                overtimeAmount: 0,
                                paidLeaveDays: 0,
                                unpaidLeaveDays: 0,
                                absenceDays: 0,
                                replacementDays: 0,
                                totalDeductions: 0,
                                grossSalary: 0,
                                netSalary: 0,
                                carriedBalance: 0,
                                currentPeriodEarnings: 0,
                                attendanceDays: 0,
                                attendanceCount: 0,
                                calculatedAt: null,
                                calculationKey: '',
                                lastAttendanceAt: null
                            }
                        }
                    }
                }));

            if (salaryUpdates.length) {
                await SalaryRecord.bulkWrite(salaryUpdates);
            }

            const paymentMessage = `تم دفع راتب شهر ${paymentPeriod} بتاريخ ${paidAt.toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' })}`;
            await new ArchiveRecord({
                companyId,
                category: 'operation',
                sourceType: 'PayrollPayment',
                sourceId: String(batch._id),
                snapshotId: batch.batchNumber,
                title: paymentMessage,
                note: `المبلغ المدفوع: ${Number(batch.totalAmount || 0)} - عدد الموظفين: ${Number(batch.employeesCount || 0)}`,
                payload: batch.toObject(),
                archivedBy: req.session.username || 'admin'
            }).save();

            return res.json({
                success: true,
                message: paymentMessage,
                batch
            });
        } catch (err) {
            return res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }
);

app.get('/api/admin/loans', requireAdmin, async (req, res) => {
    try {
        const loans = await LoanRecord.find({ companyId: req.session.companyId }).sort({ createdAt: -1 }).lean();
        loans.forEach(loan => {
            const totalRepayments = (loan.repayments || []).reduce((sum, r) => sum + (r.amount || 0), 0);
            loan.remainingAmount = loan.totalLoanAmount - totalRepayments;
        });
        res.json({ success: true, loans });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/loans', requireAdmin, async (req, res) => {
    try {

        const clientOfflineId =
            String(req.body.clientOfflineId || '').trim();

        if (clientOfflineId) {

            const existingOfflineLoan =
                await LoanRecord.findOne({
                    companyId: req.session.companyId,
                    clientOfflineId
                });

            if (existingOfflineLoan) {
                return res.status(200).json({
                    success: true,
                    alreadySynced: true,
                    loan: existingOfflineLoan
                });
            }
        }

        const { employeeId, employeeName, specialty, workplace, totalLoanAmount, loanDate } = req.body;
        if (!employeeId || !totalLoanAmount || totalLoanAmount <= 0) return res.status(400).json({ success: false, message: 'بيانات السلفة ناقصة' });
        const loan = await new LoanRecord({
            clientOfflineId,

            companyId: req.session.companyId,
            employeeId,
            employeeName: employeeName || '',
            specialty: specialty || '',
            workplace: workplace || '',
            totalLoanAmount,
            loanDate: loanDate ? new Date(loanDate) : new Date(),
            repayments: [],
            remainingAmount: totalLoanAmount
        }).save();
        res.status(201).json({ success: true, loan });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/loans/:employeeId/repayments', requireAdmin, async (req, res) => {
    try {
        const { date, amount } = req.body;

        const clientOfflineId =
            String(req.body.clientOfflineId || '').trim();

        if (!date || !amount || amount <= 0)
            return res.status(400).json({
                success: false,
                message: 'بيانات التسديد ناقصة'
            });

        const loan = await LoanRecord.findOne({
            companyId: req.session.companyId,
            employeeId: req.params.employeeId
        });

        if (!loan)
            return res.status(404).json({
                success: false,
                message: 'السلفة غير موجودة'
            });

        if (clientOfflineId) {

            const existingRepayment =
                (loan.repayments || []).find(
                    repayment =>
                        String(
                            repayment.clientOfflineId || ''
                        ) === clientOfflineId
                );

            if (existingRepayment) {
                return res.status(200).json({
                    success: true,
                    alreadySynced: true,
                    loan
                });
            }
        }

        loan.repayments.push({
            date: new Date(date),
            amount,
            clientOfflineId
        });
        const totalRepayments = loan.repayments.reduce((sum, r) => sum + r.amount, 0);
        loan.remainingAmount = loan.totalLoanAmount - totalRepayments;
        await loan.save();
        res.json({ success: true, loan });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/admin/loans/:id', requireAdmin, async (req, res) => {
    try {
        const loan = await LoanRecord.findOneAndDelete({ _id: req.params.id, companyId: req.session.companyId });
        if (!loan) return res.status(404).json({ success: false, message: 'السلفة غير موجودة' });
        res.json({ success: true, message: 'تم حذف السلفة' });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});



/*
=========================================================
  DAILY WORKERS / REPLACEMENTS
=========================================================
*/


app.post('/api/admin/daily-workers', requireAdmin, async (req, res) => {
    try {
        const companyId = req.session.companyId;

        const workerName =
            String(req.body.workerName || '').trim();

        const workerEmployeeId =
            String(req.body.workerEmployeeId || '').trim();

        const specialty =
            String(req.body.specialty || '').trim();

        const workplace =
            String(req.body.workplace || '').trim();

        const branch =
            String(req.body.branch || '').trim();

        const replacementForEmployeeId =
            String(req.body.replacementForEmployeeId || '').trim();

        const dailyRate =
            Number(req.body.dailyRate ?? req.body.dailyWage ?? 0);

        const days =
            Number(req.body.days || 1);

        const deductionPolicy =
            req.body.deductionPolicy === 'employee'
                ? 'employee'
                : 'company';

        const notes =
            String(req.body.notes || '').trim();

        const workDate =
            req.body.workDate
                ? new Date(req.body.workDate)
                : new Date();

        if (!workerName) {
            return res.status(400).json({
                success: false,
                message: 'اسم الأجير اليومي مطلوب'
            });
        }

        if (
            !Number.isFinite(dailyRate) ||
            dailyRate <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: 'الأجر اليومي يجب أن يكون أكبر من صفر'
            });
        }

        if (!Number.isInteger(days) || days <= 0 || days > 366) {
            return res.status(400).json({
                success: false,
                message: 'عدد أيام البديل غير صحيح'
            });
        }

        if (Number.isNaN(workDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'تاريخ العمل غير صحيح'
            });
        }

        let replacementForEmployeeName = '';

        if (replacementForEmployeeId) {

            const employee =
                await Employee.findOne({
                    _id: replacementForEmployeeId,
                    companyId
                }).lean();

            if (!employee) {
                return res.status(404).json({
                    success: false,
                    message: 'الموظف الأصلي غير موجود'
                });
            }

            replacementForEmployeeName =
                employee.name || '';

            const dayStart =
                new Date(workDate);

            dayStart.setHours(0, 0, 0, 0);

            const dayEnd =
                new Date(workDate);

            dayEnd.setHours(23, 59, 59, 999);

            const duplicate =
                await DailyWorkerRecord.findOne({
                    companyId,
                    replacementForEmployeeId,
                    workDate: {
                        $gte: dayStart,
                        $lte: dayEnd
                    }
                }).lean();

            if (duplicate) {
                return res.status(409).json({
                    success: false,
                    code: 'DUPLICATE_REPLACEMENT',
                    message:
                        'يوجد بديل مسجل لهذا الموظف في هذا اليوم مسبقاً'
                });
            }
        }

        const record =
            await new DailyWorkerRecord({
                companyId,
                workerName,
                workerEmployeeId,
                specialty,
                workplace,
                branch,
                dailyRate,
                days,
                workDate,
                deductionPolicy,
                notes,
                isReplacement:
                    Boolean(replacementForEmployeeId),

                replacementForEmployeeId:
                    replacementForEmployeeId || '',
                replacementForEmployeeName
            }).save();

        return res.status(201).json({
            success: true,
            message:
                replacementForEmployeeId
                    ? 'تم تسجيل البديل بنجاح'
                    : 'تم تسجيل الأجير اليومي بنجاح',
            record
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.get('/api/admin/daily-workers', requireAdmin, async (req, res) => {
    try {
        const query = {
            companyId: req.session.companyId
        };

        const search = String(req.query.search || '').trim();
        const branch = String(req.query.branch || '').trim();
        const employeeId = String(req.query.employeeId || '').trim();

        if (branch) {
            query.branch = branch;
        }

        if (employeeId) {
            query.replacementForEmployeeId = employeeId;
        }

        if (req.query.from || req.query.to) {
            query.workDate = {};

            if (req.query.from) {
                const from = new Date(req.query.from);

                if (Number.isNaN(from.getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: 'تاريخ البداية غير صحيح'
                    });
                }

                from.setHours(0, 0, 0, 0);
                query.workDate.$gte = from;
            }

            if (req.query.to) {
                const to = new Date(req.query.to);

                if (Number.isNaN(to.getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: 'تاريخ النهاية غير صحيح'
                    });
                }

                to.setHours(23, 59, 59, 999);
                query.workDate.$lte = to;
            }
        }

        if (search) {
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'i');

            query.$or = [
                { workerName: regex },
                { specialty: regex },
                { workplace: regex },
                { replacementForEmployeeName: regex }
            ];
        }

        const records = await DailyWorkerRecord
            .find(query)
            .sort({ workDate: -1, createdAt: -1 })
            .limit(1000)
            .lean();

        return res.json({
            success: true,
            total: records.length,
            records
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

/*
=========================================================
  IMMUTABLE ARCHIVE
=========================================================
*/

app.get('/api/admin/archive', requireAdmin, async (req, res) => {
    try {
        const query = { companyId: req.session.companyId };
        const category = String(req.query.category || '').trim();
        const employeeId = String(req.query.employeeId || '').trim();
        const sourceType = String(req.query.sourceType || '').trim();
        if (category) query.category = category;
        if (employeeId) query.employeeId = employeeId;
        if (sourceType) query.sourceType = sourceType;

        const records = await ArchiveRecord.find(query)
            .sort({ createdAt: -1 })
            .limit(2000)
            .lean();

        return res.json({
            success: true,
            records:
                records.map(record => ({
                    ...record,
                    fileUrl:
                        signedMediaUrl(
                            record.fileUrl
                        )
                }))
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.post(
    '/api/admin/archive/employee-documents',
    requireAdmin,
    upload.single('document'),
    async (req, res) => {
        try {
            const employeeId = String(req.body.employeeId || '').trim();
            const employee = await Employee.findOne({
                _id: employeeId,
                companyId: req.session.companyId
            }).lean();

            if (!employee) {
                return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
            }
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'اختر ملف الوثيقة' });
            }

            const record = await new ArchiveRecord({
                companyId: req.session.companyId,
                category: 'employee_document',
                sourceType: 'EmployeeDocument',
                sourceId: String(req.file.filename),
                employeeId: String(employee._id),
                employeeName: employee.name || '',
                title: String(req.body.title || req.file.originalname || '').trim(),
                documentType: String(req.body.documentType || 'other').trim(),
                fileUrl: `/uploads/${req.file.filename}`,
                note: String(req.body.note || '').trim(),
                archivedBy: req.session.username || 'admin'
            }).save();

            return res.status(201).json({ success: true, record });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    }
);

app.put(
    '/api/admin/archive/employee-profiles/:id',
    requireAdmin,
    upload.single('photo'),
    async (req, res) => {
        try {
            const employee = await Employee.findOne({
                _id: req.params.id,
                companyId: req.session.companyId
            });
            if (!employee) {
                return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
            }

            const textFields = [
                'name', 'specialty', 'workplace', 'certificate',
                'nationality', 'province', 'city', 'district',
                'neighborhood', 'street', 'alley', 'buildingNumber',
                'fullAddress', 'nearestLandmark', 'phoneNumber',
                'unifiedCardNumber', 'unifiedCardIssuer',
                'residenceCardNumber', 'residenceCardIssuer',
                'passportNumber', 'passportIssuer'
            ];
            for (const field of textFields) {
                if (req.body[field] !== undefined) {
                    employee[field] = String(req.body[field] || '').trim();
                }
            }
            if (req.body.salary !== undefined) {
                employee.salary = Number(req.body.salary || 0);
            }
            if (req.body.hireDate !== undefined) {
                employee.hireDate = req.body.hireDate ? new Date(req.body.hireDate) : null;
            }
            const dateFields = [
                'unifiedCardIssueDate', 'unifiedCardExpiryDate',
                'residenceCardIssueDate', 'residenceCardExpiryDate',
                'passportIssueDate', 'passportExpiryDate'
            ];
            for (const field of dateFields) {
                if (req.body[field] !== undefined) {
                    employee[field] = req.body[field]
                        ? new Date(req.body[field])
                        : null;
                }
            }
            if (req.file) {
                employee.photoUrl = `/uploads/${req.file.filename}`;
            }

            await employee.save();
            return res.json({
                success: true,
                employee:
                    employeeWithSignedMedia(
                        employee
                    )
            });
        } catch (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
    }
);

app.put('/api/admin/archive/employee-documents/:id', requireAdmin, async (req, res) => {
    try {
        const record = await ArchiveRecord.findOneAndUpdate(
            {
                _id: req.params.id,
                companyId: req.session.companyId,
                category: 'employee_document'
            },
            {
                $set: {
                    title: String(req.body.title || '').trim(),
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
            const shift =
                await Shift.findOne({
                    companyId: employee.companyId,
                    employeeIds: String(employee._id)
                }).lean();

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

                if (
                    !isWithinShiftWindow(
                        attendanceTime,
                        shiftStart,
                        shiftEnd
                    )
                ) {

                    return res.status(403).json({

                        success: false,

                        message:
                            `البصمة خارج وقت ${isCheckIn ? 'الحضور' : 'الانصراف'} للشفت ${shift.name} (${shiftStart} - ${shiftEnd})`

                    });

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
            const allowedLocations = [];

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

                /*
                 * الموظف غير الموفد:
                 * الموقع الرئيسي للشركة.
                 */
                if (
                    Number.isFinite(company.latitude) &&
                    Number.isFinite(company.longitude)
                ) {

                    allowedLocations.push({

                        name:
                            company.name ||
                            'الموقع الرئيسي',

                        latitude:
                            Number(company.latitude),

                        longitude:
                            Number(company.longitude),

                        radiusMeters:
                            Number(company.geofenceRadiusMeters) > 0
                                ? Number(company.geofenceRadiusMeters)
                                : 200

                    });

                }

                /*
                 * المواقع والفروع الإضافية المعتمدة.
                 */
                if (
                    Array.isArray(
                        company.approvedLocations
                    )
                ) {

                    for (
                        const approved
                        of company.approvedLocations
                    ) {

                        const approvedLat =
                            Number(approved.latitude);

                        const approvedLng =
                            Number(approved.longitude);

                        if (
                            approved.active !== false &&
                            Number.isFinite(approvedLat) &&
                            Number.isFinite(approvedLng)
                        ) {

                            allowedLocations.push({

                                name:
                                    approved.name ||
                                    'موقع معتمد',

                                latitude:
                                    approvedLat,

                                longitude:
                                    approvedLng,

                                radiusMeters:
                                    Number(approved.radiusMeters) > 0
                                        ? Number(approved.radiusMeters)
                                        : 200

                            });

                        }

                    }

                }

                if (
                    allowedLocations.length === 0
                ) {

                    return res.status(403).json({

                        success: false,

                        message:
                            'لا توجد مواقع معتمدة للشركة لتسجيل البصمة'

                    });

                }

                for (
                    const allowed
                    of allowedLocations
                ) {

                    const distance =
                        haversineMeters(
                            latitude,
                            longitude,
                            allowed.latitude,
                            allowed.longitude
                        );

                    if (
                        nearestDistance === null ||
                        distance < nearestDistance
                    ) {
                        nearestDistance =
                            distance;
                    }

                    if (
                        distance <=
                        allowed.radiusMeters
                    ) {

                        matchedLocation =
                            allowed;

                        break;

                    }

                }

                if (!matchedLocation) {

                    return res.status(403).json({

                        success: false,

                        message:
                            `فشل تسجيل البصمة: الموظف خارج جميع المواقع المعتمدة للشركة${nearestDistance !== null ? ` (أقرب موقع ${Math.round(nearestDistance)}م)` : ''}`

                    });

                }

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
                            : 'within-shift',

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
                    'تم تسجيل الحضور بالبصمة والجهاز والموقع وحفظه في MongoDB',

                attendanceId:
                    attendance._id

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
