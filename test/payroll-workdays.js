'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../server.js'), 'utf8');
const helpers = source.slice(source.indexOf('function payrollDayKey('), source.indexOf("app.post('/api/admin/payroll/friday-approval'"));
const routes = source.slice(source.indexOf("app.post('/api/admin/payroll/friday-approval'"), source.lastIndexOf('/*', source.indexOf('  LOAN RECORDS API (جديد)')));
let employees, attendance, leaves, salaries;
const query = values => ({ lean: async () => values });
class Salary {
    constructor(data) { Object.assign(this, data); }
    set(data) { Object.assign(this, data); }
    async save() { if (!salaries.includes(this)) salaries.push(this); }
    static find() { return salaries; }
}
const handlers = {};
const context = vm.createContext({
    Intl, Date, Map, Set, Number, String, Math, Boolean,
    Employee: { find: () => query(employees) },
    Shift: { find: () => query([{ employeeIds: ['one', 'two'], name: 'Day', attendanceEnd: '08:00', departureStart: '16:00' }]) },
    Attendance: { find: () => query(attendance) },
    ServiceRequest: { find: () => query(leaves) },
    DailyWorkerRecord: { find: () => query([]) }, LoanRecord: { find: () => query([]) },
    SalaryRecord: Salary,
    shiftTimeInMinutes: time => { const [h,m] = time.split(':').map(Number); return h*60+m; },
    loanRemainingAmount: () => 0,
    requireAdmin: () => {},
    app: { post: (path, middleware, handler) => { handlers[path] = handler; } }
});
vm.runInContext(helpers + routes + '\nthis.recalculate = recalculateCompanyPayroll;', context);
function reset() {
    employees = ['one','two'].map(_id => ({ _id, companyId: 'company', name: _id, salary: 300, wageType: 'monthly', workplace: 'Branch' }));
    attendance = []; leaves = []; salaries = [];
}
function punch(id, day, type, extra = {}) {
    attendance.push({ employeeId: id, timestamp: day+'T09:00:00+03:00', type, ...extra });
}
function complete(id, day) { punch(id,day,'attendance'); punch(id,day,'exit'); }
async function calculate() {
    let result;
    const response = { status(code) { this.code = code; return this; }, json(data) { result=data; } };
    await handlers['/api/admin/payroll/calculate']({ session: { companyId:'company' }, body:{ from:'2026-10-01',to:'2026-10-05' } }, response);
    assert.equal(result.success, true, JSON.stringify(result));
    return result;
}
(async () => {
    reset(); complete('one','2026-10-01'); complete('one','2026-10-02'); complete('one','2026-10-02');
    punch('one','2026-10-03','attendance');
    punch('one','2026-10-04','attendance'); punch('one','2026-10-04','departure',{timeStatus:'early-exit-pending'});
    complete('two','2026-10-02');
    await calculate(); assert.equal(salaries[0].attendanceCount,1); assert.equal(salaries[0].grossSalary,10); assert.equal(salaries[1].attendanceCount,0);
    employees[0].fridayWorkDates=['2026-10-02'];
    await calculate(); assert.equal(salaries[0].attendanceCount,2); assert.equal(salaries[0].grossSalary,20); assert.equal(salaries[1].attendanceCount,0);
    await calculate(); assert.equal(salaries[0].attendanceCount,2); assert.equal(salaries[0].grossSalary,20);
    employees[0].fridayWorkDates=[]; await calculate(); assert.equal(salaries[0].attendanceCount,1);
    leaves=[{employeeId:'one',leavePaymentType:'paid',fromDate:'2026-10-03',toDate:'2026-10-03'}];
    await calculate(); assert.equal(salaries[0].attendanceCount,1); assert.equal(salaries[0].attendanceDays,2);
    employees[0].hireDate='2026-10-03'; await calculate(); assert.equal(salaries[0].attendanceCount,0);
    reset(); complete('one','2026-10-01'); complete('one','2026-10-02'); complete('one','2026-10-02');
    await context.recalculate('company',new Date('2026-10-05T12:00:00+03:00'));
    assert.equal(salaries[0].attendanceCount,1); assert.equal(salaries[0].grossSalary,10);
    employees[0].fridayWorkDates=['2026-10-02'];
    await context.recalculate('company',new Date('2026-10-05T12:00:00+03:00'));
    assert.equal(salaries[0].attendanceCount,2); assert.equal(salaries[0].grossSalary,20);
    punch('one','2026-10-03','attendance',{managerApprovalStatus:'rejected'}); punch('one','2026-10-03','exit');
    await context.recalculate('company',new Date('2026-10-05T12:00:00+03:00')); assert.equal(salaries[0].attendanceCount,2);
    assert.equal(context.payrollDayKey('2026-10-01T22:30:00Z'),'2026-10-02');
    console.log('PASS: manual/live payroll, Friday default/approval/revocation, employee isolation, duplicate punches, incomplete/pending/rejected days, leave separation, hire date, Baghdad date');
})().catch(error => { console.error(error); process.exitCode=1; });
