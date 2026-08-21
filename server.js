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
    '/uploads',
    express.static(path.join(__dirname, 'uploads'))
);

app.use(
    express.static(path.join(__dirname, 'public'))
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

    salary: Number,

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

    latitude: Number,

    longitude: Number,

    timestamp: {
        type: Date,
        default: Date.now
    },

    type: {
        type: String,
        default: 'attendance'
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
            req.headers.authorization
                ?.replace(
                    /^Bearer\s+/i,
                    ''
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

    return safeEmployee;
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

        res.json({

            success: true,

            token:
                createToken({
                    role:
                        'developer'
                })

        });

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

            const request =
                await new EmployeeRequest({

                    ...req.body,

                    companyId,

                    companyName:
                        req.body.companyName ||
                        company.name,

                    name,

                    salary:
                        req.body.salary !==
                        undefined &&
                        req.body.salary !== ''
                            ? Number(
                                req.body.salary
                            )
                            : undefined,

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
    async (req, res) => {

        try {

            const companyId =
                String(
                    req.params.companyId ||
                    ''
                ).trim();

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
                    name: request.name,
                    ...(request.deviceId ? { deviceId: request.deviceId } : {})
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
                        publicEmployee(
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

                    email:
                        req.body.email ||
                        '',

                    salary:
                        request.salary,

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
                    publicEmployee(
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
                            publicEmployee(
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

            const employee =
                await Employee.findOne({

                    companyId,

                    username,

                    password,

                    credentialsStatus:
                        'active'

                });

            if (!employee) {

                return res.status(401).json({

                    success: false,

                    message:
                        'بيانات الدخول غير صحيحة'

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

            if (
                type === 'leave' &&
                !req.body.requestedDate
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'حدد تاريخ الإجازة'

                });

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
                        req.body.requestedDate
                            ? new Date(
                                req.body.requestedDate
                            )
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
  NOTIFICATIONS
=========================================================
*/

app.post(
    '/api/admin/notifications',
    requireAdmin,
    upload.single('audio'),
    async (req, res) => {

        try {

            const employeeId =
                String(
                    req.body.employeeId ||
                    ''
                ).trim();

            const employee =
                await Employee.findById(
                    employeeId
                ).lean();

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

            const notification =
                await new Notification({

                    companyId:
                        employee.companyId,

                    employeeId:
                        String(
                            employee._id
                        ),

                    type:
                        audioUrl
                            ? 'voice'
                            : 'text',

                    message,

                    audioUrl

                }).save();

            res.status(201).json({

                success: true,

                notification

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
                        employeeId
                    })
                    .sort({
                        createdAt: -1
                    })
                    .limit(50)
                    .lean();

            res.json({

                success: true,

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

            if (
                Number.isFinite(
                    company.latitude
                ) &&
                Number.isFinite(
                    company.longitude
                )
            ) {

                const radius =
                    Number(
                        company.geofenceRadiusMeters
                    ) > 0
                        ? Number(
                            company.geofenceRadiusMeters
                        )
                        : 200;

                const distance =
                    haversineMeters(

                        latitude,

                        longitude,

                        company.latitude,

                        company.longitude

                    );

                if (
                    distance >
                    radius
                ) {

                    return res.status(403).json({

                        success: false,

                        message:
                            `الموظف خارج نطاق الشركة المسموح (${Math.round(distance)}م من الموقع المعتمد)`

                    });

                }

            }

            const attendance =
                await new Attendance({

                    employeeId:
                        String(
                            employee._id
                        ),

                    companyId:
                        employee.companyId,

                    deviceId,

                    fingerprintToken,

                    verificationMethod:
                        'device-biometric',

                    latitude,

                    longitude,

                    timestamp:
                        req.body.timestamp
                            ? new Date(
                                req.body.timestamp
                            )
                            : new Date(),

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
