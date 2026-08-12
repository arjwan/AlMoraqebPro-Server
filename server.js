const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto');

const app = express();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const DEVELOPER_PASSWORD = process.env.DEVELOPER_PASSWORD;
const SESSION_SECRET =
    process.env.SESSION_SECRET || DEVELOPER_PASSWORD || '';

if (!MONGO_URI) {
    console.error(
        '❌ MONGO_URI is not configured. The server will not start without MongoDB.'
    );
    process.exit(1);
}

app.use(cors());

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


/* =========================================================
   COMPANY
========================================================= */

const companySchema = new mongoose.Schema({
    companyId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    name: {
        type: String,
        required: true
    },

    password: {
        type: String,
        required: true
    },

    phone: String,

    address: String,

    latitude: Number,

    longitude: Number,

    gpsRadius: {
        type: Number,
        default: 200
    },

    active: {
        type: Boolean,
        default: true
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});


/* =========================================================
   EMPLOYEE
========================================================= */

const employeeSchema = new mongoose.Schema({

    employeeId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    companyId: {
        type: String,
        required: true,
        index: true
    },

    name: {
        type: String,
        required: true
    },

    username: String,

    password: String,

    credentialsStatus: {
        type: String,
        enum: [
            'pending',
            'active',
            'disabled'
        ],
        default: 'pending'
    },

    phone: String,

    jobTitle: String,


    /* =====================================================
       DEVICE BINDING
    ===================================================== */

    deviceId: {
        type: String,
        default: null,
        index: true
    },

    deviceBoundAt: {
        type: Date,
        default: null
    },


    /* =====================================================
       FINGERPRINT BINDING

       We never store the raw fingerprint token.

       The mobile application sends fingerprintToken
       after successful local biometric authentication.

       The server stores only SHA-256 hash.
    ===================================================== */

    fingerprintTokenHash: {
        type: String,
        default: null
    },

    fingerprintBoundAt: {
        type: Date,
        default: null
    },


    active: {
        type: Boolean,
        default: true
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});


/* =========================================================
   EMPLOYEE REQUEST
========================================================= */

const employeeRequestSchema = new mongoose.Schema({

    requestId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    companyId: {
        type: String,
        required: true,
        index: true
    },

    name: {
        type: String,
        required: true
    },

    phone: String,

    jobTitle: String,

    deviceId: {
        type: String,
        default: null
    },

    username: String,

    password: String,

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

    employeeId: String,

    createdAt: {
        type: Date,
        default: Date.now
    },

    approvedAt: Date,

    rejectedAt: Date
});


/* =========================================================
   ATTENDANCE
========================================================= */

const attendanceSchema = new mongoose.Schema({

    employeeId: {
        type: String,
        required: true,
        index: true
    },

    companyId: {
        type: String,
        required: true,
        index: true
    },

    deviceId: {
        type: String,
        required: true,
        index: true
    },

    /*
     * We keep the token hash only.
     */
    fingerprintTokenHash: {
        type: String,
        required: true
    },

    latitude: Number,

    longitude: Number,

    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },

    type: {
        type: String,
        enum: [
            'check-in',
            'check-out',
            'in',
            'out'
        ],
        default: 'check-in'
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});


/* =========================================================
   SERVICE REQUEST
========================================================= */

const serviceRequestSchema = new mongoose.Schema({

    requestId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    employeeId: {
        type: String,
        required: true,
        index: true
    },

    companyId: {
        type: String,
        required: true,
        index: true
    },

    deviceId: {
        type: String,
        required: true,
        index: true
    },

    type: {
        type: String,
        enum: [
            'loan',
            'leave'
        ],
        required: true
    },

    amount: Number,

    reason: String,

    startDate: Date,

    endDate: Date,

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

    managerNote: String,

    createdAt: {
        type: Date,
        default: Date.now
    },

    reviewedAt: Date
});


/* =========================================================
   NOTIFICATION
========================================================= */

const notificationSchema = new mongoose.Schema({

    employeeId: {
        type: String,
        required: true,
        index: true
    },

    companyId: {
        type: String,
        required: true,
        index: true
    },

    message: String,

    audioUrl: String,

    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },

    read: {
        type: Boolean,
        default: false
    }
});


/* =========================================================
   MODELS
========================================================= */

const Company =
    mongoose.model('Company', companySchema);

const Employee =
    mongoose.model('Employee', employeeSchema);

const EmployeeRequest =
    mongoose.model('EmployeeRequest', employeeRequestSchema);

const Attendance =
    mongoose.model('Attendance', attendanceSchema);

const ServiceRequest =
    mongoose.model('ServiceRequest', serviceRequestSchema);

const Notification =
    mongoose.model('Notification', notificationSchema);


/* =========================================================
   MONGODB
========================================================= */

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ MongoDB connected successfully');
    })
    .catch(error => {
        console.error(
            '❌ MongoDB connection error:',
            error
        );
    });


/* =========================================================
   HELPERS
========================================================= */

function generateId(prefix = '') {
    return prefix +
        crypto.randomBytes(8).toString('hex');
}


function normalizeCompanyId(value) {
    return String(value || '').trim();
}


function normalizeDeviceId(value) {
    return String(value || '').trim();
}


function normalizeFingerprintToken(value) {
    return String(value || '').trim();
}


/*
 * Never store the fingerprint token itself.
 */
function hashFingerprintToken(token) {

    return crypto
        .createHash('sha256')
        .update(String(token))
        .digest('hex');
}


/*
 * Constant-time comparison.
 */
function fingerprintMatches(
    fingerprintToken,
    fingerprintTokenHash
) {

    if (
        !fingerprintToken ||
        !fingerprintTokenHash
    ) {
        return false;
    }

    const incomingHash =
        hashFingerprintToken(
            fingerprintToken
        );

    const a =
        Buffer.from(
            incomingHash,
            'utf8'
        );

    const b =
        Buffer.from(
            fingerprintTokenHash,
            'utf8'
        );

    if (a.length !== b.length) {
        return false;
    }

    return crypto.timingSafeEqual(a, b);
}


function isValidCoordinates(
    latitude,
    longitude
) {

    return Number.isFinite(
        Number(latitude)
    ) &&
        Number.isFinite(
            Number(longitude)
        ) &&
        Number(latitude) >= -90 &&
        Number(latitude) <= 90 &&
        Number(longitude) >= -180 &&
        Number(longitude) <= 180;
}


function distanceInMeters(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const R = 6371000;

    const p1 =
        Number(lat1) *
        Math.PI /
        180;

    const p2 =
        Number(lat2) *
        Math.PI /
        180;

    const dp =
        (Number(lat2) -
            Number(lat1)) *
        Math.PI /
        180;

    const dl =
        (Number(lon2) -
            Number(lon1)) *
        Math.PI /
        180;

    const a =
        Math.sin(dp / 2) *
        Math.sin(dp / 2) +

        Math.cos(p1) *
        Math.cos(p2) *
        Math.sin(dl / 2) *
        Math.sin(dl / 2);

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return R * c;
}


function developerAuthenticated(req) {

    const password =
        req.headers['x-developer-password'] ||
        req.headers['x-admin-password'] ||
        req.body?.developerPassword;

    if (!DEVELOPER_PASSWORD) {
        return false;
    }

    return password === DEVELOPER_PASSWORD;
}


/* =========================================================
   HEALTH
========================================================= */

app.get('/api/health', async (req, res) => {

    try {

        const dbState =
            mongoose.connection.readyState;

        res.json({
            ok: true,
            mongodb: dbState === 1,
            mongoState: dbState,
            time: new Date().toISOString()
        });

    } catch (error) {

        res.status(500).json({
            ok: false,
            error: error.message
        });
    }
});


/* =========================================================
   COMPANY REGISTER
========================================================= */

app.post(
    '/api/companies/register',
    async (req, res) => {

        try {

            const {
                companyId,
                name,
                password,
                phone,
                address,
                latitude,
                longitude,
                gpsRadius
            } = req.body;

            const normalizedCompanyId =
                normalizeCompanyId(companyId);

            if (
                !normalizedCompanyId ||
                !name ||
                !password
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        'companyId, name and password are required'
                });
            }

            const exists =
                await Company.findOne({
                    companyId:
                        normalizedCompanyId
                });

            if (exists) {

                return res.status(409).json({
                    success: false,
                    message:
                        'Company already exists'
                });
            }

            const validGPS =
                isValidCoordinates(
                    latitude,
                    longitude
                );

            const company =
                new Company({

                    companyId:
                        normalizedCompanyId,

                    name,

                    password,

                    phone,

                    address,

                    latitude:
                        validGPS
                            ? Number(latitude)
                            : undefined,

                    longitude:
                        validGPS
                            ? Number(longitude)
                            : undefined,

                    gpsRadius:
                        Number(gpsRadius) > 0
                            ? Number(gpsRadius)
                            : 200
                });

            await company.save();

            res.status(201).json({
                success: true,
                message:
                    'Company registered successfully',
                company
            });

        } catch (error) {

            console.error(
                'Company register error:',
                error
            );

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


/* =========================================================
   COMPANY LOGIN
========================================================= */

app.post(
    '/api/company/login',
    async (req, res) => {

        try {

            const {
                companyId,
                password
            } = req.body;

            const company =
                await Company.findOne({
                    companyId:
                        normalizeCompanyId(
                            companyId
                        ),
                    password
                });

            if (!company) {

                return res.status(401).json({
                    success: false,
                    message:
                        'Invalid company credentials'
                });
            }

            if (!company.active) {

                return res.status(403).json({
                    success: false,
                    message:
                        'Company is disabled'
                });
            }

            res.json({
                success: true,
                company
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


/* =========================================================
   COMPANIES
========================================================= */

app.get(
    '/api/companies',
    async (req, res) => {

        try {

            const companies =
                await Company.find({})
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            res.json({
                success: true,
                companies
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


/* =========================================================
   DEVELOPER COMPANIES
========================================================= */

app.get(
    '/api/developer/companies',
    async (req, res) => {

        try {

            if (!developerAuthenticated(req)) {

                return res.status(401).json({
                    success: false,
                    message:
                        'Developer authentication required'
                });
            }

            const companies =
                await Company.find({})
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            res.json({
                success: true,
                companies
            });

        } catch (error) {

            console.error(
                'Developer companies error:',
                error
            );

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


app.patch(
    '/api/developer/companies/:companyId',
    async (req, res) => {

        try {

            if (!developerAuthenticated(req)) {

                return res.status(401).json({
                    success: false,
                    message:
                        'Developer authentication required'
                });
            }

            const companyId =
                normalizeCompanyId(
                    req.params.companyId
                );

            const allowed = [
                'name',
                'password',
                'phone',
                'address',
                'latitude',
                'longitude',
                'gpsRadius',
                'active'
            ];

            const update = {};

            for (const key of allowed) {

                if (
                    Object.prototype
                        .hasOwnProperty
                        .call(req.body, key)
                ) {

                    update[key] =
                        req.body[key];
                }
            }

            if (
                update.latitude !== undefined
            ) {
                update.latitude =
                    Number(update.latitude);
            }

            if (
                update.longitude !== undefined
            ) {
                update.longitude =
                    Number(update.longitude);
            }

            if (
                update.gpsRadius !== undefined
            ) {
                update.gpsRadius =
                    Number(update.gpsRadius);
            }

            const company =
                await Company.findOneAndUpdate(
                    {
                        companyId
                    },
                    {
                        $set: update
                    },
                    {
                        new: true,
                        runValidators: true
                    }
                );

            if (!company) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Company not found'
                });
            }

            res.json({
                success: true,
                message:
                    'Company updated successfully',
                company
            });

        } catch (error) {

            console.error(
                'Developer company update error:',
                error
            );

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


app.patch(
    '/api/developer/companies/:companyId/status',
    async (req, res) => {

        try {

            if (!developerAuthenticated(req)) {

                return res.status(401).json({
                    success: false,
                    message:
                        'Developer authentication required'
                });
            }

            const companyId =
                normalizeCompanyId(
                    req.params.companyId
                );

            const active =
                req.body.active === true ||
                req.body.active === 'true';

            const company =
                await Company.findOneAndUpdate(
                    {
                        companyId
                    },
                    {
                        $set: {
                            active
                        }
                    },
                    {
                        new: true
                    }
                );

            if (!company) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Company not found'
                });
            }

            res.json({
                success: true,
                message:
                    active
                        ? 'Company activated successfully'
                        : 'Company disabled successfully',
                company
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


app.delete(
    '/api/developer/companies/:companyId',
    async (req, res) => {

        try {

            if (!developerAuthenticated(req)) {

                return res.status(401).json({
                    success: false,
                    message:
                        'Developer authentication required'
                });
            }

            const companyId =
                normalizeCompanyId(
                    req.params.companyId
                );

            const company =
                await Company.findOneAndDelete({
                    companyId
                });

            if (!company) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Company not found'
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
                    'Company and related data deleted successfully',
                companyId
            });

        } catch (error) {

            console.error(
                'Company delete error:',
                error
            );

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


/* =========================================================
   EMPLOYEE REQUEST
========================================================= */

app.post(
    '/api/employee/request',
    async (req, res) => {

        try {

            const {
                companyId,
                name,
                phone,
                jobTitle,
                deviceId
            } = req.body;

            const normalizedCompanyId =
                normalizeCompanyId(
                    companyId
                );

            const normalizedDeviceId =
                normalizeDeviceId(
                    deviceId
                );

            if (
                !normalizedCompanyId ||
                !name
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        'companyId and name are required'
                });
            }

            const company =
                await Company.findOne({
                    companyId:
                        normalizedCompanyId,
                    active: true
                });

            if (!company) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Company not found or inactive'
                });
            }

            const request =
                new EmployeeRequest({

                    requestId:
                        generateId('REQ-'),

                    companyId:
                        normalizedCompanyId,

                    name,

                    phone,

                    jobTitle,

                    deviceId:
                        normalizedDeviceId ||
                        null,

                    status: 'pending'
                });

            await request.save();

            res.status(201).json({
                success: true,
                message:
                    'Employee request submitted successfully',
                request
            });

        } catch (error) {

            console.error(
                'Employee request error:',
                error
            );

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


app.get(
    '/api/employee/requests/:companyId/pending',
    async (req, res) => {

        try {

            const companyId =
                normalizeCompanyId(
                    req.params.companyId
                );

            const requests =
                await EmployeeRequest.find({
                    companyId,
                    status: 'pending'
                })
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            res.json({
                success: true,
                requests
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


/* =========================================================
   APPROVE EMPLOYEE
========================================================= */

app.post(
    '/api/employee/request/:requestId/approve',
    async (req, res) => {

        try {

            const request =
                await EmployeeRequest.findOne({
                    requestId:
                        req.params.requestId
                });

            if (!request) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Employee request not found'
                });
            }

            if (
                request.status !== 'pending'
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        'Employee request has already been processed'
                });
            }

            const existingEmployee =
                await Employee.findOne({
                    $or: [

                        {
                            employeeId:
                                request.requestId
                        },

                        {
                            companyId:
                                request.companyId,

                            phone:
                                request.phone
                        }
                    ]
                });

            if (existingEmployee) {

                return res.status(409).json({
                    success: false,
                    message:
                        'Employee already exists',
                    employee:
                        existingEmployee
                });
            }

            const employeeId =
                generateId('EMP-');

            const employee =
                new Employee({

                    employeeId,

                    companyId:
                        request.companyId,

                    name:
                        request.name,

                    phone:
                        request.phone,

                    jobTitle:
                        request.jobTitle,

                    username: null,

                    password: null,

                    credentialsStatus:
                        'pending',

                    deviceId:
                        request.deviceId ||
                        null,

                    deviceBoundAt:
                        request.deviceId
                            ? new Date()
                            : null,

                    /*
                     * Fingerprint is NOT copied
                     * from request.
                     *
                     * It is bound later from the
                     * employee's own device.
                     */
                    fingerprintTokenHash:
                        null,

                    fingerprintBoundAt:
                        null,

                    active: true
                });

            await employee.save();

            request.status =
                'approved';

            request.employeeId =
                employeeId;

            request.approvedAt =
                new Date();

            request.username =
                undefined;

            request.password =
                undefined;

            await request.save();

            res.json({
                success: true,

                message:
                    'Employee approved. Credentials must now be assigned by the manager.',

                employee: {

                    employeeId:
                        employee.employeeId,

                    companyId:
                        employee.companyId,

                    name:
                        employee.name,

                    deviceId:
                        employee.deviceId,

                    fingerprintBound:
                        false,

                    credentialsStatus:
                        employee.credentialsStatus
                }
            });

        } catch (error) {

            console.error(
                'Approve employee error:',
                error
            );

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


/* =========================================================
   REJECT EMPLOYEE
========================================================= */

app.post(
    '/api/employee/request/:requestId/reject',
    async (req, res) => {

        try {

            const request =
                await EmployeeRequest.findOne({
                    requestId:
                        req.params.requestId
                });

            if (!request) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Employee request not found'
                });
            }

            request.status =
                'rejected';

            request.rejectedAt =
                new Date();

            await request.save();

            res.json({
                success: true,
                message:
                    'Employee request rejected',
                request
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


/* =========================================================
   EMPLOYEE CREDENTIALS
========================================================= */

app.patch(
    '/api/employees/:employeeId/credentials',
    async (req, res) => {

        try {

            const {
                companyId,
                username,
                password
            } = req.body;

            if (
                !companyId ||
                !username ||
                !password
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        'companyId, username and password are required'
                });
            }

            const employee =
                await Employee.findOne({

                    employeeId:
                        req.params.employeeId,

                    companyId:
                        normalizeCompanyId(
                            companyId
                        )
                });

            if (!employee) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Employee not found'
                });
            }

            const duplicate =
                await Employee.findOne({

                    companyId:
                        employee.companyId,

                    username,

                    employeeId: {
                        $ne:
                            employee.employeeId
                    }
                });

            if (duplicate) {

                return res.status(409).json({
                    success: false,
                    message:
                        'Username is already used'
                });
            }

            employee.username =
                String(username).trim();

            employee.password =
                String(password);

            employee.credentialsStatus =
                'active';

            await employee.save();

            res.json({
                success: true,
                message:
                    'Employee credentials assigned successfully',

                employee: {

                    employeeId:
                        employee.employeeId,

                    companyId:
                        employee.companyId,

                    name:
                        employee.name,

                    username:
                        employee.username,

                    credentialsStatus:
                        employee.credentialsStatus,

                    deviceId:
                        employee.deviceId,

                    fingerprintBound:
                        !!employee.fingerprintTokenHash
                }
            });

        } catch (error) {

            console.error(
                'Employee credentials error:',
                error
            );

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


/* =========================================================
   MOBILE LOGIN
========================================================= */

app.post(
    '/api/mobile/login',
    async (req, res) => {

        try {

            const {
                companyId,
                username,
                password,
                deviceId
            } = req.body;

            const normalizedCompanyId =
                normalizeCompanyId(
                    companyId
                );

            const normalizedDeviceId =
                normalizeDeviceId(
                    deviceId
                );

            if (
                !normalizedCompanyId ||
                !username ||
                !password ||
                !normalizedDeviceId
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        'companyId, username, password and deviceId are required'
                });
            }

            const employee =
                await Employee.findOne({

                    companyId:
                        normalizedCompanyId,

                    username,

                    password,

                    active: true,

                    credentialsStatus:
                        'active'
                });

            if (!employee) {

                return res.status(401).json({
                    success: false,
                    message:
                        'Invalid employee credentials'
                });
            }

            if (
                employee.deviceId &&
                employee.deviceId !==
                    normalizedDeviceId
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        'This employee is already bound to another device'
                });
            }

            if (!employee.deviceId) {

                employee.deviceId =
                    normalizedDeviceId;

                employee.deviceBoundAt =
                    new Date();

                await employee.save();
            }

            res.json({

                success: true,

                message:
                    'Login successful',

                employee: {

                    employeeId:
                        employee.employeeId,

                    companyId:
                        employee.companyId,

                    name:
                        employee.name,

                    username:
                        employee.username,

                    deviceId:
                        employee.deviceId,

                    fingerprintBound:
                        !!employee.fingerprintTokenHash
                }
            });

        } catch (error) {

            console.error(
                'Mobile login error:',
                error
            );

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


/* =========================================================
   FINGERPRINT BINDING
=========================================================

   The mobile application should call this after the
   employee successfully authenticates with the device
   fingerprint.

   First time:
      device + fingerprint are bound to employee.

   Later:
      the fingerprint must match the saved hash.

========================================================= */

app.post(
    '/api/mobile/fingerprint/bind',
    async (req, res) => {

        try {

            const {
                employeeId,
                deviceId,
                fingerprintToken
            } = req.body;

            const normalizedDeviceId =
                normalizeDeviceId(
                    deviceId
                );

            const normalizedFingerprint =
                normalizeFingerprintToken(
                    fingerprintToken
                );

            if (
                !employeeId ||
                !normalizedDeviceId ||
                !normalizedFingerprint
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        'employeeId, deviceId and fingerprintToken are required'
                });
            }

            const employee =
                await Employee.findOne({
                    employeeId,
                    active: true
                });

            if (!employee) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Employee not found or inactive'
                });
            }

            if (
                !employee.deviceId ||
                employee.deviceId !==
                    normalizedDeviceId
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        'Device is not bound to this employee'
                });
            }


            /*
             * If fingerprint already exists,
             * do NOT replace it silently.
             */
            if (
                employee.fingerprintTokenHash
            ) {

                if (
                    !fingerprintMatches(
                        normalizedFingerprint,
                        employee.fingerprintTokenHash
                    )
                ) {

                    return res.status(403).json({
                        success: false,
                        message:
                            'Fingerprint does not match the fingerprint already bound to this employee'
                    });
                }

                return res.json({
                    success: true,
                    message:
                        'Fingerprint already bound and verified',
                    fingerprintBound:
                        true
                });
            }


            /*
             * First successful fingerprint binding.
             */
            employee.fingerprintTokenHash =
                hashFingerprintToken(
                    normalizedFingerprint
                );

            employee.fingerprintBoundAt =
                new Date();

            await employee.save();

            res.json({
                success: true,
                message:
                    'Fingerprint bound to employee successfully',
                fingerprintBound:
                    true
            });

        } catch (error) {

            console.error(
                'Fingerprint binding error:',
                error
            );

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


/* =========================================================
   FINGERPRINT RESET
========================================================= */

app.post(
    '/api/employees/:employeeId/fingerprint/reset',
    async (req, res) => {

        try {

            const {
                companyId
            } = req.body;

            const employee =
                await Employee.findOne({

                    employeeId:
                        req.params.employeeId,

                    companyId:
                        normalizeCompanyId(
                            companyId
                        )
                });

            if (!employee) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Employee not found'
                });
            }

            employee.fingerprintTokenHash =
                null;

            employee.fingerprintBoundAt =
                null;

            await employee.save();

            res.json({
                success: true,
                message:
                    'Employee fingerprint binding reset successfully'
            });

        } catch (error) {

            console.error(
                'Fingerprint reset error:',
                error
            );

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


/* =========================================================
   DEVICE RESET
========================================================= */

app.post(
    '/api/employees/:employeeId/device/reset',
    async (req, res) => {

        try {

            const {
                companyId
            } = req.body;

            const employee =
                await Employee.findOne({

                    employeeId:
                        req.params.employeeId,

                    companyId:
                        normalizeCompanyId(
                            companyId
                        )
                });

            if (!employee) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Employee not found'
                });
            }

            employee.deviceId =
                null;

            employee.deviceBoundAt =
                null;

            /*
             * When the device is reset,
             * fingerprint binding is also reset.
             *
             * This prevents an old device fingerprint
             * from being reused on the new device.
             */
            employee.fingerprintTokenHash =
                null;

            employee.fingerprintBoundAt =
                null;

            await employee.save();

            res.json({
                success: true,
                message:
                    'Employee device and fingerprint binding reset successfully'
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


/* =========================================================
   EMPLOYEES
========================================================= */

app.get(
    '/api/employees/:companyId',
    async (req, res) => {

        try {

            const employees =
                await Employee.find({

                    companyId:
                        normalizeCompanyId(
                            req.params.companyId
                        )
                })
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            /*
             * Never return fingerprint hash
             * to the frontend.
             */
            const safeEmployees =
                employees.map(employee => {

                    delete employee.fingerprintTokenHash;

                    return employee;
                });

            res.json({
                success: true,
                employees:
                    safeEmployees
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


app.get(
    '/api/employees/:employeeId',
    async (req, res) => {

        try {

            const employee =
                await Employee.findOne({
                    employeeId:
                        req.params.employeeId
                }).lean();

            if (!employee) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Employee not found'
                });
            }

            delete employee.fingerprintTokenHash;

            res.json({
                success: true,
                employee
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


/* =========================================================
   ATTENDANCE
   DEVICE + FINGERPRINT + GPS
========================================================= */

app.post(
    '/api/attendance',
    async (req, res) => {

        try {

            const {
                employeeId,
                deviceId,
                fingerprintToken,
                latitude,
                longitude,
                timestamp,
                type
            } = req.body;

            const normalizedDeviceId =
                normalizeDeviceId(
                    deviceId
                );

            const normalizedFingerprint =
                normalizeFingerprintToken(
                    fingerprintToken
                );


            /* -------------------------------------------------
               REQUIRED DATA
            ------------------------------------------------- */

            if (
                !employeeId ||
                !normalizedDeviceId ||
                !normalizedFingerprint
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        'employeeId, deviceId and fingerprintToken are required'
                });
            }


            /* -------------------------------------------------
               GPS
            ------------------------------------------------- */

            if (
                !isValidCoordinates(
                    latitude,
                    longitude
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        'Valid GPS coordinates are required'
                });
            }


            /* -------------------------------------------------
               EMPLOYEE
            ------------------------------------------------- */

            const employee =
                await Employee.findOne({

                    employeeId,

                    active: true
                });

            if (!employee) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Employee not found or inactive'
                });
            }


            /* -------------------------------------------------
               DEVICE VERIFICATION
            ------------------------------------------------- */

            if (
                !employee.deviceId ||
                employee.deviceId !==
                    normalizedDeviceId
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        'Device is not bound to this employee'
                });
            }


            /* -------------------------------------------------
               COMPANY
            ------------------------------------------------- */

            const company =
                await Company.findOne({

                    companyId:
                        employee.companyId,

                    active: true
                });

            if (!company) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Company not found or inactive'
                });
            }


            /* -------------------------------------------------
               FINGERPRINT VERIFICATION
            -------------------------------------------------

               If no fingerprint has been bound yet,
               bind this token on the first valid attendance.

               IMPORTANT:
               The mobile application must only send
               fingerprintToken AFTER successful local
               biometric authentication.
            */

            if (
                !employee.fingerprintTokenHash
            ) {

                employee.fingerprintTokenHash =
                    hashFingerprintToken(
                        normalizedFingerprint
                    );

                employee.fingerprintBoundAt =
                    new Date();

                await employee.save();

                console.log(
                    `🔐 Fingerprint bound for employee ${employee.employeeId}`
                );

            } else {

                const fingerprintValid =
                    fingerprintMatches(

                        normalizedFingerprint,

                        employee.fingerprintTokenHash
                    );

                if (!fingerprintValid) {

                    return res.status(403).json({
                        success: false,
                        message:
                            'Fingerprint verification failed'
                    });
                }
            }


            /* -------------------------------------------------
               GPS COMPANY RADIUS
            ------------------------------------------------- */

            if (
                isValidCoordinates(
                    company.latitude,
                    company.longitude
                )
            ) {

                const distance =
                    distanceInMeters(

                        company.latitude,

                        company.longitude,

                        latitude,

                        longitude
                    );

                const radius =
                    Number(
                        company.gpsRadius
                    ) > 0

                        ? Number(
                            company.gpsRadius
                        )

                        : 200;


                if (distance > radius) {

                    return res.status(403).json({

                        success: false,

                        message:
                            'Employee is outside the allowed company location',

                        distance:

                            Math.round(
                                distance * 100
                            ) / 100,

                        allowedRadius:
                            radius
                    });
                }
            }


            /* -------------------------------------------------
               ATTENDANCE
            ------------------------------------------------- */

            const attendance =
                new Attendance({

                    employeeId:
                        employee.employeeId,

                    companyId:
                        employee.companyId,

                    deviceId:
                        normalizedDeviceId,

                    fingerprintTokenHash:
                        hashFingerprintToken(
                            normalizedFingerprint
                        ),

                    latitude:
                        Number(latitude),

                    longitude:
                        Number(longitude),

                    timestamp:
                        timestamp
                            ? new Date(timestamp)
                            : new Date(),

                    type:
                        type ||
                        'check-in'
                });

            await attendance.save();


            res.status(201).json({

                success: true,

                message:
                    'Attendance recorded successfully',

                attendance: {

                    _id:
                        attendance._id,

                    employeeId:
                        attendance.employeeId,

                    companyId:
                        attendance.companyId,

                    deviceId:
                        attendance.deviceId,

                    latitude:
                        attendance.latitude,

                    longitude:
                        attendance.longitude,

                    timestamp:
                        attendance.timestamp,

                    type:
                        attendance.type
                }
            });

        } catch (error) {

            console.error(
                'Attendance error:',
                error
            );

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


/* =========================================================
   EMPLOYEE ATTENDANCE
========================================================= */

app.get(
    '/api/employees/:employeeId/attendance',
    async (req, res) => {

        try {

            const attendance =
                await Attendance.find({

                    employeeId:
                        req.params.employeeId

                })
                    .sort({
                        timestamp: -1
                    })
                    .lean();


            /*
             * Remove fingerprint hashes
             * from API response.
             */
            const safeAttendance =
                attendance.map(item => {

                    delete item.fingerprintTokenHash;

                    return item;
                });


            res.json({
                success: true,
                attendance:
                    safeAttendance
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


/* =========================================================
   ADMIN ATTENDANCE
========================================================= */

app.get(
    '/api/admin/attendance',
    async (req, res) => {

        try {

            const {
                companyId,
                employeeId
            } = req.query;

            const query = {};

            if (companyId) {

                query.companyId =
                    normalizeCompanyId(
                        companyId
                    );
            }

            if (employeeId) {

                query.employeeId =
                    String(employeeId);
            }

            const attendance =
                await Attendance.find(query)
                    .sort({
                        timestamp: -1
                    })
                    .limit(1000)
                    .lean();


            const safeAttendance =
                attendance.map(item => {

                    delete item.fingerprintTokenHash;

                    return item;
                });


            res.json({
                success: true,
                attendance:
                    safeAttendance
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


/* =========================================================
   SERVICE REQUESTS
========================================================= */

app.post(
    '/api/employee/service-request',
    async (req, res) => {

        try {

            const {
                employeeId,
                deviceId,
                type,
                amount,
                reason,
                startDate,
                endDate
            } = req.body;

            const normalizedDeviceId =
                normalizeDeviceId(
                    deviceId
                );

            if (
                !employeeId ||
                !normalizedDeviceId ||
                !type
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        'employeeId, deviceId and type are required'
                });
            }

            if (
                ![
                    'loan',
                    'leave'
                ].includes(type)
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        'Invalid service request type'
                });
            }

            const employee =
                await Employee.findOne({

                    employeeId,

                    active: true
                });

            if (!employee) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Employee not found'
                });
            }

            if (
                employee.deviceId !==
                normalizedDeviceId
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        'Device is not bound to this employee'
                });
            }

            if (type === 'loan') {

                if (
                    !Number.isFinite(
                        Number(amount)
                    ) ||
                    Number(amount) <= 0
                ) {

                    return res.status(400).json({
                        success: false,
                        message:
                            'Valid loan amount is required'
                    });
                }
            }

            if (type === 'leave') {

                if (
                    !startDate ||
                    !endDate
                ) {

                    return res.status(400).json({
                        success: false,
                        message:
                            'Leave startDate and endDate are required'
                    });
                }
            }

            const request =
                new ServiceRequest({

                    requestId:
                        generateId('SR-'),

                    employeeId:
                        employee.employeeId,

                    companyId:
                        employee.companyId,

                    deviceId:
                        normalizedDeviceId,

                    type,

                    amount:
                        type === 'loan'
                            ? Number(amount)
                            : undefined,

                    reason,

                    startDate:
                        type === 'leave'
                            ? new Date(startDate)
                            : undefined,

                    endDate:
                        type === 'leave'
                            ? new Date(endDate)
                            : undefined,

                    status:
                        'pending'
                });

            await request.save();

            res.status(201).json({
                success: true,
                message:
                    'Service request submitted successfully',
                request
            });

        } catch (error) {

            console.error(
                'Service request error:',
                error
            );

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


app.get(
    '/api/admin/service-requests',
    async (req, res) => {

        try {

            const query = {};

            if (req.query.companyId) {

                query.companyId =
                    normalizeCompanyId(
                        req.query.companyId
                    );
            }

            if (req.query.status) {

                query.status =
                    req.query.status;
            }

            const requests =
                await ServiceRequest.find(
                    query
                )
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            res.json({
                success: true,
                requests
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


app.patch(
    '/api/admin/service-requests/:requestId',
    async (req, res) => {

        try {

            const {
                status,
                managerNote
            } = req.body;

            if (
                ![
                    'approved',
                    'rejected'
                ].includes(status)
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        'status must be approved or rejected'
                });
            }

            const request =
                await ServiceRequest.findOne({
                    requestId:
                        req.params.requestId
                });

            if (!request) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Service request not found'
                });
            }

            if (
                request.status !==
                'pending'
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        'Request has already been reviewed'
                });
            }

            request.status =
                status;

            request.managerNote =
                managerNote || '';

            request.reviewedAt =
                new Date();

            await request.save();

            res.json({
                success: true,
                message:
                    'Service request updated successfully',
                request
            });

        } catch (error) {

            console.error(
                'Service request review error:',
                error
            );

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


/* =========================================================
   NOTIFICATIONS
========================================================= */

app.post(
    '/api/admin/notifications',
    async (req, res) => {

        try {

            const {
                employeeId,
                companyId,
                message,
                audioUrl
            } = req.body;

            if (
                !employeeId ||
                !companyId
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        'employeeId and companyId are required'
                });
            }

            const employee =
                await Employee.findOne({

                    employeeId,

                    companyId:
                        normalizeCompanyId(
                            companyId
                        ),

                    active: true
                });

            if (!employee) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Employee not found'
                });
            }

            if (
                !message &&
                !audioUrl
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        'message or audioUrl is required'
                });
            }

            const notification =
                new Notification({

                    employeeId,

                    companyId:
                        normalizeCompanyId(
                            companyId
                        ),

                    message:
                        message || '',

                    audioUrl:
                        audioUrl || ''
                });

            await notification.save();

            res.status(201).json({
                success: true,
                message:
                    'Notification sent successfully',
                notification
            });

        } catch (error) {

            console.error(
                'Notification create error:',
                error
            );

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


app.get(
    '/api/employee/notifications',
    async (req, res) => {

        try {

            const {
                employeeId,
                deviceId
            } = req.query;

            const normalizedDeviceId =
                normalizeDeviceId(
                    deviceId
                );

            if (
                !employeeId ||
                !normalizedDeviceId
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        'employeeId and deviceId are required'
                });
            }

            const employee =
                await Employee.findOne({

                    employeeId,

                    active: true
                });

            if (!employee) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Employee not found'
                });
            }

            if (
                employee.deviceId !==
                normalizedDeviceId
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        'Device is not bound to this employee'
                });
            }

            const notifications =
                await Notification.find({
                    employeeId
                })
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            res.json({
                success: true,
                notifications
            });

        } catch (error) {

            console.error(
                'Employee notifications error:',
                error
            );

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


app.patch(
    '/api/employee/notifications/:id/read',
    async (req, res) => {

        try {

            const {
                employeeId,
                deviceId
            } = req.body;

            const employee =
                await Employee.findOne({

                    employeeId,

                    active: true
                });

            if (!employee) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Employee not found'
                });
            }

            if (
                employee.deviceId !==
                normalizeDeviceId(
                    deviceId
                )
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        'Device is not bound to this employee'
                });
            }

            const notification =
                await Notification.findOneAndUpdate(

                    {
                        _id:
                            req.params.id,

                        employeeId
                    },

                    {
                        $set: {
                            read: true
                        }
                    },

                    {
                        new: true
                    }
                );

            if (!notification) {

                return res.status(404).json({
                    success: false,
                    message:
                        'Notification not found'
                });
            }

            res.json({
                success: true,
                notification
            });

        } catch (error) {

            console.error(
                'Notification read error:',
                error
            );

            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }
);


/* =========================================================
   ERROR HANDLER
========================================================= */

app.use((req, res) => {

    if (
        req.path.startsWith('/api/')
    ) {

        return res.status(404).json({
            success: false,
            message:
                'API endpoint not found',
            path:
                req.path
        });
    }

    res.status(404).send(
        'Not Found'
    );
});


app.use(
    (err, req, res, next) => {

        console.error(
            'Unhandled server error:',
            err
        );

        res.status(500).json({
            success: false,
            message:
                'Internal server error'
        });
    }
);


/* =========================================================
   START SERVER
========================================================= */

app.listen(
    PORT,
    () => {

        console.log(
            `🚀 AlMoraqebPro Server running on port ${PORT}`
        );

    }
);
