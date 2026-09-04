/*
 * AlMoraqebPro - Smoke / Integration test.
 * يحاول استخدام قاعدة MongoDB داخل الذاكرة (mongodb-memory-server)؛
 * إن تعذّر (بيئة لا تدعم mongod) ينفّذ اختبار الإقلاع والأمان فقط.
 * كما يدعم المتغير TEST_MONGO_URI لتشغيل المجموعة الكاملة مقابل قاعدة حقيقية.
 *
 *   node test/smoke.js
 *   TEST_MONGO_URI=mongodb+srv://... node test/smoke.js
 */
const { MongoMemoryServer } = require('mongodb-memory-server');
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

const PORT = 8433;
const BASE = 'http://localhost:' + PORT;
const DEV_PASSWORD = 'test-dev-password';

let pass = 0, fail = 0, skipped = 0;

function check(name, cond) {
    if (cond) { pass++; console.log('  ✔ ' + name); }
    else { fail++; console.log('  ✘ ' + name); }
}
function skip(name) { skipped++; console.log('  • مؤجل (لا قاعدة بيانات): ' + name); }

function signedAdminToken(companyId) {
    const body = Buffer.from(JSON.stringify({
        role: 'admin', companyId, exp: Date.now() + 60000
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', 'test-session')
        .update(body).digest('base64url');
    return body + '.' + signature;
}

async function waitForServer(url, retries, delay) {
    for (let i = 0; i < retries; i++) {
        try { const r = await fetch(url); if (r.status < 500) return; } catch (_) { /* retry */ }
        await new Promise((x) => setTimeout(x, delay));
    }
    throw new Error('Timed out waiting for ' + url);
}

(async () => {
    let mongo, child, uri, dbUp = false;
    try {
        if (process.env.TEST_MONGO_URI) {
            uri = process.env.TEST_MONGO_URI; dbUp = true;
            console.log('• تستخدم TEST_MONGO_URI المزوّد (full suite).');
        } else {
            console.log('• بدء قاعدة بيانات MongoDB داخل الذاكرة...');
            try {
                mongo = await MongoMemoryServer.create(); uri = mongo.getUri(); dbUp = true;
                console.log('• mongodb-memory-server يعمل.');
            } catch (e) {
                console.log('  ⚠️ تعذّر تشغيل mongodb-memory-server هنا (' + e.message + ').');
                console.log('  سيُجرى اختبار الإقلاع/الأمان فقط (بدون قاعدة بيانات).');
                uri = 'mongodb://127.0.0.1:1/unreachable';
            }
        }

        console.log('• تشغيل الخادم...');
        child = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '..'),
            env: Object.assign({}, process.env, {
                MONGO_URI: uri,
                PORT: String(PORT),
                DEVELOPER_PASSWORD: DEV_PASSWORD,
                SESSION_SECRET: 'test-session'
            }),
            stdio: ['ignore', 'pipe', 'pipe']
        });
        child.stdout.on('data', (d) => process.stdout.write('  [server] ' + d));
        child.stderr.on('data', (d) => process.stdout.write('  [server!] ' + d));
        console.log('==> انتظار استجابة الخادم...');
        await waitForServer(BASE + '/', 200, 300);

        // Health check
        let h = await (await fetch(BASE + '/health')).json();
        if (dbUp) {
            // انتظار بدء الاتصال بالـ Atlas (قد يتأخر على المجموعات المجانية)
            for (let i = 0; i < 30 && h.database !== 'connected'; i++) {
                await new Promise((x) => setTimeout(x, 1000));
                h = await (await fetch(BASE + '/health')).json();
            }
        }
        if (dbUp) check('health => ok/connected', h.status === 'ok' && h.database === 'connected');
        else check('health => degraded (بدون قاعدة بيانات)', h.status === 'degraded' && (h.database === 'disconnected' || h.database === 'connecting'));

        check('/api/ping => 200', (await fetch(BASE + '/api/ping')).status === 200);

        // Cookie authentication must pass requireAdmin even without a Bearer header.
        // Without MongoDB the route may return 500, but it must never return auth 401.
        const cookieOnlySession = await fetch(BASE + '/api/admin/session', {
            headers: { Cookie: 'almoraqeb_admin_session=' + signedAdminToken('COOKIE-TEST') }
        });
        check('admin cookie passes requireAdmin without Bearer', cookieOnlySession.status !== 401);

        // تسجيل دخول المطور (لا يحتاج قاعدة بيانات)
        const login = await (await fetch(BASE + '/api/developer/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: DEV_PASSWORD })
        })).json();
        check('developer login => token', !!login.token);
        check('developer wrong password => 401', (await fetch(BASE + '/api/developer/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong' })
        })).status === 401);

        // مطلوب قاعدة بيانات
        if (dbUp) {
            const companyId = 'CMP' + Date.now();
            const reg = await (await fetch(BASE + '/api/companies/register', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, name: 'شركة الاختبار', adminPassword: 'admin123' })
            })).json();
            check('company register => success', reg.success === true);
            check('duplicate company => 409', (await fetch(BASE + '/api/companies/register', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, name: 'x', adminPassword: 'a' })
            })).status === 409);
            const list = await (await fetch(BASE + '/api/developer/companies', {
                headers: { Authorization: 'Bearer ' + login.token }
            })).json();
            check('developer companies list', Array.isArray(list.companies) && list.companies.length >= 1);

            const adminLoginResponse = await fetch(BASE + '/api/admin/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, username: 'admin', password: 'admin123' })
            });
            const adminCookie = adminLoginResponse.headers.get('set-cookie') || '';
            const adminLogin = await adminLoginResponse.json();
            check('admin login => token', !!adminLogin.token);
            check('admin login => HttpOnly secure session cookie',
                /almoraqeb_admin_session=/.test(adminCookie) && /HttpOnly/i.test(adminCookie));
            const cookieSession = await (await fetch(BASE + '/api/admin/session', {
                headers: { Cookie: adminCookie.split(';')[0] }
            })).json();
            check('admin session persists with cookie without Bearer',
                cookieSession.success === true && cookieSession.companyId === companyId);

            const requestBody = {
                companyId,
                companyName: 'شركة الاختبار',
                name: 'موظف اختبار',
                jobTitle: 'مستخدم',
                workLocation: 'الفرع الرئيسي',
                salary: 1200,
                shift: 'صباحي',
                workHours: 8,
                wageType: 'شهري',
                socialSecurity: 'مسجل',
                location: '31.000,45.000',
                latitude: 31,
                longitude: 45,
                locationAccuracy: 8,
                deviceId: 'device-' + Date.now()
            };
            const requestResult = await (await fetch(BASE + '/api/employee/request', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody)
            })).json();
            check('employee request saved in EmployeeRequest', requestResult.success === true && !!requestResult.requestId && requestResult.status === 'pending');

            const pending = await (await fetch(BASE + '/api/employee/requests/' + encodeURIComponent(companyId) + '/pending', {
                headers: { Authorization: 'Bearer ' + adminLogin.token }
            })).json();
            check('pending request visible to admin', Array.isArray(pending.requests) && pending.requests.length >= 1);
            check('join request stores captured GPS coordinates', pending.requests.some(item =>
                item._id === requestResult.requestId && Number(item.lastKnownLocation?.latitude) === 31 &&
                Number(item.lastKnownLocation?.longitude) === 45 && Number(item.lastKnownLocation?.accuracyMeters) === 8));

            const approve = await (await fetch(BASE + '/api/employee/request/' + requestResult.requestId + '/approve', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token }, body: JSON.stringify({ email: 'employee@example.com' })
            })).json();
            check('approve request creates employee', approve.success === true && !!approve.employee);
            check('approved employee inherits join-request coordinates', Number(approve.employee?.lastKnownLocation?.latitude) === 31 &&
                Number(approve.employee?.lastKnownLocation?.longitude) === 45);

            const employees = await (await fetch(BASE + '/api/employees?companyId=' + encodeURIComponent(companyId), {
                headers: { Authorization: 'Bearer ' + adminLogin.token }
            })).json();
            check('employees list includes approved employee', Array.isArray(employees.employees) && employees.employees.some(e => e.companyId === companyId && e.name === 'موظف اختبار'));

            // === اختبارات صريحة للحقول الرقمية وphoneNumber ===
            const approvedEmployee = employees.employees.find(e => e.companyId === companyId && e.name === 'موظف اختبار');
            check('salary = 1200 persisted on Employee', approvedEmployee && Number(approvedEmployee.salary) === 1200);
            check('workHours = 8 persisted on Employee', approvedEmployee && Number(approvedEmployee.workHours) === 8);
            check('requested shift persisted on approved employee', approvedEmployee && approvedEmployee.shift === 'صباحي');

            const badHours = await (await fetch(BASE + '/api/employee/request', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({}, requestBody, { workHours: 'ثمانية', name: 'موظف ساعات خاطئة' }))
            })).json();
            check('non-numeric workHours rejected with 400-style message', badHours.success === false && !!badHours.message);

            const badSalary = await (await fetch(BASE + '/api/employee/request', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({}, requestBody, { salary: 'كثير', name: 'موظف راتب خاطئ' }))
            })).json();
            check('non-numeric salary rejected with 400-style message', badSalary.success === false && !!badSalary.message);

            // المدير يضيف رقم الهاتف للموظف المعتمد أولاً
            await fetch(BASE + '/api/employees/' + approvedEmployee._id, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ phoneNumber: '07700000000', hireDate: '2026-08-26' })
            });

            // phoneNumber يربط موظفاً موجوداً بالجهاز دون إنشاء موظف جديد
            const linkedDeviceId = 'new-device-' + Date.now();
            const phoneLink = await (await fetch(BASE + '/api/employee/request', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyId, companyName: 'شركة الاختبار', name: approvedEmployee.name,
                    phoneNumber: '07700000000', jobTitle: 'محاسب', workLocation: 'الفرع الرئيسي',
                    salary: 1500, shift: 'صباحي', workHours: 8, wageType: 'شهري', socialSecurity: 'مسجل',
                    location: '31.000,45.000', deviceId: linkedDeviceId
                })
            })).json();
            check('existing employee linked by phoneNumber (linked=true)', phoneLink.success === true && phoneLink.linked === true);

            const ambulanceRequest = await (await fetch(BASE + '/api/employee/service-request', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employeeId: approvedEmployee._id, deviceId: linkedDeviceId,
                    companyId, type: 'ambulance', reason: 'حالة طارئة' })
            })).json();
            check('employee ambulance request reaches server', ambulanceRequest.success === true && !!ambulanceRequest.requestId);

            const managerRequests = await (await fetch(BASE + '/api/admin/service-requests', {
                headers: { Authorization: 'Bearer ' + adminLogin.token }
            })).json();
            check('employee service request appears in manager dashboard API',
                managerRequests.success === true && managerRequests.requests.some(request => request.type === 'ambulance'));

            const processedRequest = await (await fetch(BASE + '/api/admin/service-requests/' + ambulanceRequest.requestId, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ status: 'approved' })
            })).json();
            check('manager can approve employee service request', processedRequest.success === true);

            const locationUpdate = await (await fetch(BASE + '/api/developer/companies/' + companyId, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token },
                body: JSON.stringify({
                    latitude: 33.3152, longitude: 44.3661, geofenceRadiusMeters: 200
                })
            })).json();
            check('company headquarters location saved', locationUpdate.success === true);

            const secondaryLocation = await (await fetch(BASE + '/api/admin/locations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ name: 'الفرع الثاني', type: 'worksite', latitude: 31, longitude: 45, radiusMeters: 250 })
            })).json();
            check('secondary authorized company location saved', secondaryLocation.success === true && !!secondaryLocation.location);
            const nearbyOtherLocation = await (await fetch(BASE + '/api/admin/locations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ name: 'موقع آخر قريب', type: 'worksite', latitude: 31.135, longitude: 45, radiusMeters: 250 })
            })).json();
            check('second site for shift-isolation test saved', nearbyOtherLocation.success === true && !!nearbyOtherLocation.location);

            const shift = await (await fetch(BASE + '/api/admin/shifts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ name: 'صباحي', locationId: secondaryLocation.location._id, employeeIds: [approvedEmployee._id],
                    attendanceStart: '00:00', attendanceEnd: '23:59', departureStart: '00:00', departureEnd: '23:59' })
            })).json();
            check('employee attendance shift created with copied geofence',
                shift.success === true && !!shift.shift &&
                shift.shift.locationId === String(secondaryLocation.location._id) &&
                shift.shift.latitude === 31 && shift.shift.longitude === 45 &&
                shift.shift.radiusMeters === 250);

            async function submitAttendance(latitude, longitude, timestamp, type = 'attendance') {
                const challenge = await (await fetch(BASE + '/api/attendance/challenge?employeeId=' +
                    encodeURIComponent(approvedEmployee._id) + '&deviceId=' + encodeURIComponent(linkedDeviceId))).json();
                const response = await fetch(BASE + '/api/attendance', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ employeeId: approvedEmployee._id, deviceId: linkedDeviceId,
                        challengeId: challenge.challengeId, fingerprintToken: 'biometric-test',
                        latitude, longitude, type, timestamp })
                });
                return { status: response.status, body: await response.json() };
            }

            const secondLocation = await submitAttendance(31, 45, new Date().toISOString());
            check('employee a few meters from assigned shift site accepted',
                secondLocation.status === 201 && secondLocation.body.success === true &&
                Number(secondLocation.body.distanceMeters) <= 250);

            const fifteenKmAway = await submitAttendance(31.135, 45, new Date(Date.now() + 120000).toISOString());
            check('employee about 15 km from assigned shift site rejected with distance',
                fifteenKmAway.status === 403 && fifteenKmAway.body.success === false &&
                Number(fifteenKmAway.body.distanceMeters) >= 14000 &&
                Number(fifteenKmAway.body.distanceMeters) <= 16000);

            const nearOtherCompanySite = await submitAttendance(31.135, 45.001, new Date(Date.now() + 240000).toISOString());
            check('near another company site but away from assigned shift site rejected',
                nearOtherCompanySite.status === 403 && nearOtherCompanySite.body.success === false &&
                Number(nearOtherCompanySite.body.distanceMeters) >= 14000);

            const invalidLocation = await submitAttendance(30, 46, new Date().toISOString());
            check('attendance rejected outside assigned shift location', invalidLocation.status === 403 && invalidLocation.body.success === false);

            const narrowedShift = await (await fetch(BASE + '/api/admin/shifts/' + shift.shift._id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ name: 'صباحي', locationId: 'headquarters', employeeIds: [approvedEmployee._id],
                    attendanceStart: '08:00', attendanceEnd: '08:30', lateFrom: '08:31', lateTo: '10:30',
                    departureStart: '16:00', departureEnd: '17:00' })
            })).json();
            check('employee attendance shift updated with lateness window', narrowedShift.success === true &&
                narrowedShift.shift.lateFrom === '08:31' && narrowedShift.shift.lateTo === '10:30');
            const invalidShiftLocation = await (await fetch(BASE + '/api/admin/shifts/' + shift.shift._id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ locationId: 'missing-location' })
            })).json();
            check('invalid shift location is rejected explicitly',
                invalidShiftLocation.success === false &&
                String(invalidShiftLocation.message).includes('موقع الشفت'));

            const absentLate = await submitAttendance(33.3152, 44.3661, '2026-08-27T08:00:00.000Z');
            check('check-in after two-hour grace is recorded as official absence', absentLate.status === 201 &&
                absentLate.body.timeStatus === 'absent-late');
            const absentLateDeparture = await submitAttendance(33.3152, 44.3661, '2026-08-27T13:30:00.000Z', 'departure');
            check('official absence remains recorded even when employee checks out', absentLateDeparture.status === 201);

            const withinShift = await submitAttendance(33.3152, 44.3661, '2026-08-25T05:30:00.000Z');
            check('attendance at assigned headquarters site accepted within shift window',
                withinShift.status === 201 && withinShift.body.success === true &&
                Number(withinShift.body.distanceMeters) <= 1);

            const withinDeparture = await submitAttendance(33.3152, 44.3661, '2026-08-25T13:30:00.000Z', 'departure');
            check('departure accepted within assigned shift window', withinDeparture.status === 201 && withinDeparture.body.success === true);

            const lateAttendance = await submitAttendance(33.3152, 44.3661, '2026-08-26T06:00:00.000Z');
            check('late attendance within two hours records actual minutes', lateAttendance.status === 201 &&
                lateAttendance.body.timeStatus === 'late' && Number(lateAttendance.body.lateMinutes) === 30);

            const earlyDeparture = await submitAttendance(33.3152, 44.3661, '2026-08-26T12:00:00.000Z', 'departure');
            check('early departure waits for manager approval', earlyDeparture.status === 201 &&
                String(earlyDeparture.body.message).includes('موافقة المدير'));

            const managerAttendance = await (await fetch(BASE + '/api/admin/attendance', {
                headers: { Authorization: 'Bearer ' + adminLogin.token }
            })).json();
            check('attendance appears in manager dashboard with employee name', managerAttendance.success === true &&
                managerAttendance.attendance.some(record => record.employeeId === approvedEmployee._id && record.employeeName === approvedEmployee.name));
            const pendingEarlyExit = managerAttendance.attendance.find(record => record._id === earlyDeparture.body.attendanceId);
            const approvedEarlyExit = await (await fetch(BASE + '/api/admin/attendance/' + pendingEarlyExit._id + '/approve-early-exit', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token }, body: '{}'
            })).json();
            check('manager approval makes early departure valid', approvedEarlyExit.success === true &&
                approvedEarlyExit.attendance.timeStatus === 'early-exit-approved');
            check('manager attendance endpoint rejects anonymous access', (await fetch(BASE + '/api/admin/attendance')).status === 401);

            const calculateAugust = await (await fetch(BASE + '/api/admin/payroll/calculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ from: '2026-08-25', to: '2026-08-25' })
            })).json();
            check('payroll calculated from complete attendance day', calculateAugust.success === true &&
                calculateAugust.calculated.some(row => row.employeeId === approvedEmployee._id && row.payableDays === 1 && row.netSalary > 0));

            const firstSalaryList = await (await fetch(BASE + '/api/admin/salaries', {
                headers: { Authorization: 'Bearer ' + adminLogin.token }
            })).json();
            const firstSalary = firstSalaryList.salaries.find(row => row.employeeId === approvedEmployee._id);
            const augustBalance = Number(firstSalary && firstSalary.netSalary);
            check('calculated salary remains unpaid and above zero', augustBalance > 0 && firstSalary.payoutStatus === 'unpaid');

            const calculateSeptember = await (await fetch(BASE + '/api/admin/payroll/calculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ from: '2026-09-01', to: '2026-09-01' })
            })).json();
            check('unpaid salary carries into the following period', calculateSeptember.success === true &&
                calculateSeptember.calculated.some(row => row.employeeId === approvedEmployee._id && Number(row.carriedBalance) === augustBalance && Number(row.netSalary) === augustBalance));

            const payrollBatch = await (await fetch(BASE + '/api/admin/payroll-batches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ payoutType: 'cash', payrollFrom: '2026-08-25', payrollTo: '2026-08-25' })
            })).json();
            check('payroll batch approval does not reset salary', payrollBatch.success === true && !!payrollBatch.batch);

            const attendanceBeforePayment = await (await fetch(BASE + '/api/admin/attendance', {
                headers: { Authorization: 'Bearer ' + adminLogin.token }
            })).json();
            check('payroll calculation and batch creation do not archive attendance', attendanceBeforePayment.attendance.some(record =>
                record._id === withinShift.body.attendanceId));

            const beforePaymentList = await (await fetch(BASE + '/api/admin/salaries', {
                headers: { Authorization: 'Bearer ' + adminLogin.token }
            })).json();
            const beforePaymentSalary = beforePaymentList.salaries.find(row => row.employeeId === approvedEmployee._id);
            check('salary stays visible until payment confirmation', Number(beforePaymentSalary.netSalary) === augustBalance && !!beforePaymentSalary.pendingPayoutBatchId);

            const reusedBatch = await (await fetch(BASE + '/api/admin/payroll-batches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ payoutType: 'cash', salaryRecordId: beforePaymentSalary._id })
            })).json();
            check('individual payment reuses pending payroll batch', reusedBatch.success === true &&
                reusedBatch.reused === true && reusedBatch.batch._id === payrollBatch.batch._id);

            const confirmedPayment = await (await fetch(BASE + '/api/admin/payroll-batches/' + payrollBatch.batch._id + '/confirm-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: '{}'
            })).json();
            check('payment confirmation records month and date', confirmedPayment.success === true &&
                confirmedPayment.message.includes('تم دفع راتب شهر') && confirmedPayment.message.includes('بتاريخ'));
            check('paid payroll period attendance archived only after confirmation',
                Number(confirmedPayment.attendanceArchive && confirmedPayment.attendanceArchive.archivedCount) >= 2);

            const attendanceAfterPayment = await (await fetch(BASE + '/api/admin/attendance', {
                headers: { Authorization: 'Bearer ' + adminLogin.token }
            })).json();
            check('paid-period attendance removed from active records after archival', !attendanceAfterPayment.attendance.some(record =>
                record._id === withinShift.body.attendanceId));

            const afterPaymentList = await (await fetch(BASE + '/api/admin/salaries', {
                headers: { Authorization: 'Bearer ' + adminLogin.token }
            })).json();
            const afterPaymentSalary = afterPaymentList.salaries.find(row => row.employeeId === approvedEmployee._id);
            check('salary resets only after confirmed payment', Number(afterPaymentSalary.netSalary) === 0 &&
                Number(afterPaymentSalary.carriedBalance) === 0 && !afterPaymentSalary.pendingPayoutBatchId);

            const paidLeave = await (await fetch(BASE + '/api/admin/employees/' + approvedEmployee._id + '/leave', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ fromDate: '2026-08-26', toDate: '2026-08-26', leavePaymentType: 'paid', reason: 'إجازة اختبار براتب' })
            })).json();
            check('paid leave approved from employee management', paidLeave.success === true && paidLeave.request.leavePaymentType === 'paid');

            const unpaidLeave = await (await fetch(BASE + '/api/admin/employees/' + approvedEmployee._id + '/leave', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ fromDate: '2026-08-27', toDate: '2026-08-27', leavePaymentType: 'unpaid', reason: 'إجازة اختبار بدون راتب' })
            })).json();
            check('unpaid leave approved from employee management', unpaidLeave.success === true && unpaidLeave.request.leavePaymentType === 'unpaid');

            const delegation = await (await fetch(BASE + '/api/admin/employees/' + approvedEmployee._id + '/delegation', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ active: true, from: '2026-08-28T00:00:00.000Z', to: '2026-08-28T23:59:59.999Z',
                    province: 'بغداد', locationName: 'موقع الإيفاد', allowProvinceWide: true, reason: 'إيفاد اختبار' })
            })).json();
            check('delegation approved from employee management', delegation.success === true && delegation.delegation.active === true);

            const replacement = await (await fetch(BASE + '/api/admin/daily-workers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ workerName: 'بديل خارجي', fromDate: '2026-08-29', toDate: '2026-08-29', dailyRate: 10,
                    replacementForEmployeeId: approvedEmployee._id, workplace: 'الفرع الثاني', notes: 'ملاحظة البديل' })
            })).json();
            if (!replacement.success) console.log('  replacement response:', replacement);
            check('replacement linked to original employee', replacement.success === true && replacement.record.isReplacement === true && replacement.record.replacementForEmployeeId === approvedEmployee._id && !replacement.record.workerEmployeeId && Number(replacement.record.totalAmount) === 10);

            const loan = await (await fetch(BASE + '/api/admin/loans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ employeeId: approvedEmployee._id, employeeName: approvedEmployee.name,
                    totalLoanAmount: 100, monthlyInstallment: 20, loanDate: '2026-08-20' })
            })).json();
            check('employee loan added automatically to payroll source', loan.success === true && Number(loan.loan.remainingAmount) === 100);

            const deductionSettings = await (await fetch(BASE + '/api/admin/salaries/' + afterPaymentSalary._id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ loanDeduction: 20, allowances: 15, securityDeduction: 5, socialSecurity: 'مسجل' })
            })).json();
            check('persistent payroll settings configured', deductionSettings.success === true &&
                Number(deductionSettings.salary.loanDeduction) === 20 && Number(deductionSettings.salary.allowances) === 15 &&
                Number(deductionSettings.salary.securityDeduction) === 5 && deductionSettings.salary.socialSecurity === 'مسجل');

            const refreshedEmployees = await (await fetch(BASE + '/api/admin/salaries/refresh-employees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: '{}'
            })).json();
            check('salary employee data refresh keeps payroll settings', refreshedEmployees.success === true && refreshedEmployees.updatedCount === 1);

            const eventPayroll = await (await fetch(BASE + '/api/admin/payroll/calculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ from: '2026-08-26', to: '2026-08-29' })
            })).json();
            check('leave delegation replacement and loan payroll calculated', eventPayroll.success === true && eventPayroll.calculatedCount === 1);
            check('new employee payroll starts at hireDate within the 1-30 cycle', eventPayroll.calculated.some(row =>
                row.employeeId === approvedEmployee._id && Number(row.eligibleDays) === 4));

            const eventSalaryList = await (await fetch(BASE + '/api/admin/salaries', {
                headers: { Authorization: 'Bearer ' + adminLogin.token }
            })).json();
            const eventSalary = eventSalaryList.salaries.find(row => row.employeeId === approvedEmployee._id);
            if (!eventSalary || Number(eventSalary.paidLeaveDays) !== 1 || Number(eventSalary.attendanceDays) !== 3 || Number(eventSalary.replacementDeduction) !== 0) {
                console.log('  event salary response:', eventSalary);
            }
            check('replacement metadata saved on original employee', eventSalary.replacementActive === true && eventSalary.replacementName === 'بديل خارجي' && eventSalary.replacementFrom && eventSalary.replacementTo && eventSalary.replacementNote === 'ملاحظة البديل');
            check('paid leave counts as payable salary day', Number(eventSalary.paidLeaveDays) === 1 && Number(eventSalary.attendanceDays) === 3);
            check('unpaid leave does not count as payable salary day', Number(eventSalary.unpaidLeaveDays) === 1);
            check('delegation counts automatically as payable salary day', Number(eventSalary.attendanceDays) === 3);
            check('replacement period does not become absence', Number(eventSalary.replacementDays) === 1 && Number(eventSalary.absenceDays) === 0);
            check('replacement has no salary deduction', Number(eventSalary.replacementDeduction) === 0 && Number(eventSalary.netSalary) > 0);
            check('actual late minutes and proportional deduction appear in payroll', Number(eventSalary.lateMinutes) === 30 && Number(eventSalary.lateDeduction) > 0);
            check('loan balance and installment remain separate from earnings', Number(eventSalary.loans) === 100 &&
                Number(eventSalary.loanDeduction) === 20 && Number(eventSalary.grossSalary) === Number(eventSalary.basicSalary) / 30 * 4);

            const eventBatch = await (await fetch(BASE + '/api/admin/payroll-batches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ payoutType: 'cash', salaryRecordId: eventSalary._id,
                    payrollFrom: '2026-08-26', payrollTo: '2026-08-29' })
            })).json();
            const eventPayment = await (await fetch(BASE + '/api/admin/payroll-batches/' + eventBatch.batch._id + '/confirm-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: '{}'
            })).json();
            check('payroll with loan installment confirms successfully', eventPayment.success === true);

            const paidLoanList = await (await fetch(BASE + '/api/admin/loans', {
                headers: { Authorization: 'Bearer ' + adminLogin.token }
            })).json();
            const paidLoan = paidLoanList.loans.find(row => row.employeeId === approvedEmployee._id);
            check('confirmed payroll installment reduces loan balance', Number(paidLoan.remainingAmount) === 80 &&
                paidLoan.repayments.some(row => Number(row.amount) === 20 && String(row.clientOfflineId).startsWith('payroll:')));

            const paidEventSalaryList = await (await fetch(BASE + '/api/admin/salaries', {
                headers: { Authorization: 'Bearer ' + adminLogin.token }
            })).json();
            const paidEventSalary = paidEventSalaryList.salaries.find(row => row.employeeId === approvedEmployee._id);
            check('payment keeps allowances insurance and installment settings', Number(paidEventSalary.allowances) === 15 &&
                Number(paidEventSalary.securityDeduction) === 5 && Number(paidEventSalary.loanDeduction) === 20 &&
                paidEventSalary.socialSecurity === 'مسجل' && Number(paidEventSalary.loans) === 80);

            const recalculatedAfterPayment = await (await fetch(BASE + '/api/admin/payroll/calculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ from: '2026-08-26', to: '2026-08-29' })
            })).json();
            const recalculatedSalaryList = await (await fetch(BASE + '/api/admin/salaries', {
                headers: { Authorization: 'Bearer ' + adminLogin.token }
            })).json();
            const recalculatedSalary = recalculatedSalaryList.salaries.find(row => row.employeeId === approvedEmployee._id);
            check('recalculation preserves settings and updated loan balance', recalculatedAfterPayment.success === true &&
                Number(recalculatedSalary.allowances) === 15 && Number(recalculatedSalary.securityDeduction) === 5 &&
                Number(recalculatedSalary.loanDeduction) === 20 && Number(recalculatedSalary.loans) === 80);

            const manualLoanEdit = await (await fetch(BASE + '/api/admin/loans/' + paidLoan._id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ totalLoanAmount: 100, monthlyInstallment: 15, paidAmount: 30, remainingAmount: 70 })
            })).json();
            check('loan total installment paid and remaining support manual correction', manualLoanEdit.success === true &&
                Number(manualLoanEdit.loan.monthlyInstallment) === 15 && Number(manualLoanEdit.loan.paidAmount) === 30 &&
                Number(manualLoanEdit.loan.remainingAmount) === 70);

            const afterLink = await (await fetch(BASE + '/api/employees?companyId=' + encodeURIComponent(companyId), {
                headers: { Authorization: 'Bearer ' + adminLogin.token }
            })).json();
            check('no duplicate Employee created after phone linking', afterLink.employees.filter(e => e.companyId === companyId).length === 1);

            // approve مرة ثانية على نفس الطلب لا ينشئ موظفاً مكرراً
            const reApprove = await (await fetch(BASE + '/api/employee/request/' + requestResult.requestId + '/approve', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token }, body: '{}'
            })).json();
            check('re-approve handled gracefully', reApprove.success === true);
        } else {
            skip('company register'); skip('duplicate company'); skip('developer companies list'); skip('admin login'); skip('admin cookie session'); skip('employee request saved in EmployeeRequest'); skip('pending request visible to admin'); skip('approve request creates employee'); skip('employees list includes approved employee');
        }

        check('no-auth endpoints => 401', (await fetch(BASE + '/api/developer/companies')).status === 401);

        const nf = await fetch(BASE + '/api/does-not-exist');
        check('unknown api => 404 JSON', nf.status === 404 && (await nf.json()).success === false);

        check('bad json body => 400', (await fetch(BASE + '/api/companies/register', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad'
        })).status === 400);

        const root = await fetch(BASE + '/');
        check('root serves index.html', root.status === 200 && (root.headers.get('content-type') || '').includes('text/html'));

        const reportsPage = await (await fetch(BASE + '/admin_reports.html')).text();
        check('manager reports page contains a complete attendance dashboard',
            reportsPage.includes('id="reportBody"') && reportsPage.includes('/api/admin/reports') && reportsPage.includes('</html>'));

        const sh = await fetch(BASE + '/health');
        check('X-Content-Type-Options => nosniff', sh.headers.get('x-content-type-options') === 'nosniff');
        check('X-Frame-Options => SAMEORIGIN', sh.headers.get('x-frame-options') === 'SAMEORIGIN');
        check('no x-powered-by header', !sh.headers.get('x-powered-by'));
    } catch (e) {
        console.error('  ❌ خطأ أثناء الاختبار:', e.message);
        fail++;
    } finally {
        if (child && child.exitCode === null) {
            console.log('==> إرسال SIGTERM للخادم (إيقاف نظيف)...');
            child.kill('SIGTERM');
            await new Promise((r) => setTimeout(r, 1200));
        }
        if (mongo) await mongo.stop();
        if (child) child.kill('SIGKILL');
    }

    console.log('\n===== النتيجة: ' + pass + ' نجحت، ' + fail + ' فشلت، ' + skipped + ' مؤجّلة =====');
    process.exit(fail > 0 ? 1 : 0);
})();
