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

const PORT = 8433;
const BASE = 'http://localhost:' + PORT;
const DEV_PASSWORD = 'test-dev-password';

let pass = 0, fail = 0, skipped = 0;

function check(name, cond) {
    if (cond) { pass++; console.log('  ✔ ' + name); }
    else { fail++; console.log('  ✘ ' + name); }
}
function skip(name) { skipped++; console.log('  • مؤجل (لا قاعدة بيانات): ' + name); }

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

            const adminLogin = await (await fetch(BASE + '/api/admin/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, username: 'admin', password: 'admin123' })
            })).json();
            check('admin login => token', !!adminLogin.token);

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

            const approve = await (await fetch(BASE + '/api/employee/request/' + requestResult.requestId + '/approve', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token }, body: JSON.stringify({ email: 'employee@example.com' })
            })).json();
            check('approve request creates employee', approve.success === true && !!approve.employee);

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
                body: JSON.stringify({ phoneNumber: '07700000000' })
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

            const shift = await (await fetch(BASE + '/api/admin/shifts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ name: 'صباحي', locationId: secondaryLocation.location._id, employeeIds: [approvedEmployee._id],
                    attendanceStart: '00:00', attendanceEnd: '23:59', departureStart: '00:00', departureEnd: '23:59' })
            })).json();
            check('employee attendance shift created', shift.success === true && !!shift.shift);

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
            check('attendance accepted at secondary authorized location', secondLocation.status === 201 && secondLocation.body.success === true);

            const invalidLocation = await submitAttendance(30, 46, new Date().toISOString());
            check('attendance rejected outside every authorized location', invalidLocation.status === 403 && invalidLocation.body.success === false);

            const narrowedShift = await (await fetch(BASE + '/api/admin/shifts/' + shift.shift._id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ name: 'صباحي', locationId: 'headquarters', employeeIds: [approvedEmployee._id],
                    attendanceStart: '08:00', attendanceEnd: '09:00', departureStart: '16:00', departureEnd: '17:00' })
            })).json();
            check('employee attendance shift updated', narrowedShift.success === true);

            const outsideShift = await submitAttendance(31, 45, '2026-08-25T09:00:00.000Z');
            check('attendance rejected outside assigned shift window', outsideShift.status === 403 && outsideShift.body.success === false);

            const withinShift = await submitAttendance(31, 45, '2026-08-25T05:30:00.000Z');
            check('attendance accepted within assigned shift window', withinShift.status === 201 && withinShift.body.success === true);

            const withinDeparture = await submitAttendance(31, 45, '2026-08-25T13:30:00.000Z', 'departure');
            check('departure accepted within assigned shift window', withinDeparture.status === 201 && withinDeparture.body.success === true);

            const managerAttendance = await (await fetch(BASE + '/api/admin/attendance', {
                headers: { Authorization: 'Bearer ' + adminLogin.token }
            })).json();
            check('attendance appears in manager dashboard with employee name', managerAttendance.success === true &&
                managerAttendance.attendance.some(record => record.employeeId === approvedEmployee._id && record.employeeName === approvedEmployee.name));
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
                body: JSON.stringify({ payoutType: 'cash', payrollFrom: '2026-09-01', payrollTo: '2026-09-30' })
            })).json();
            check('payroll batch approval does not reset salary', payrollBatch.success === true && !!payrollBatch.batch);

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
                    totalLoanAmount: 100, loanDate: '2026-08-20' })
            })).json();
            check('employee loan added automatically to payroll source', loan.success === true && Number(loan.loan.remainingAmount) === 100);

            const deductionSettings = await (await fetch(BASE + '/api/admin/salaries/' + afterPaymentSalary._id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ loanDeduction: 20 })
            })).json();
            check('loan installment configured as payroll deduction', deductionSettings.success === true && Number(deductionSettings.salary.loanDeduction) === 20);

            const eventPayroll = await (await fetch(BASE + '/api/admin/payroll/calculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminLogin.token },
                body: JSON.stringify({ from: '2026-08-26', to: '2026-08-29' })
            })).json();
            check('leave delegation replacement and loan payroll calculated', eventPayroll.success === true && eventPayroll.calculatedCount === 1);

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
            check('replacement has no salary deduction', Number(eventSalary.replacementDeduction) === 0 && Number(eventSalary.netSalary) >= Number(eventSalary.grossSalary) - Number(eventSalary.loanDeduction));
            check('loan balance and installment remain separate from earnings', Number(eventSalary.loans) === 100 &&
                Number(eventSalary.loanDeduction) === 20 && Number(eventSalary.grossSalary) === Number(eventSalary.basicSalary) / 31 * 3);

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
            skip('company register'); skip('duplicate company'); skip('developer companies list'); skip('admin login'); skip('employee request saved in EmployeeRequest'); skip('pending request visible to admin'); skip('approve request creates employee'); skip('employees list includes approved employee');
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
