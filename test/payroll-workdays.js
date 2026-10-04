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
    employees = ['one','two'].map(_id => ({ _id, companyId: 'company', name: _id, salary: 260, wageType: 'monthly', workplace: 'Branch' }));
    attendance = []; leaves = []; salaries = [];
}
function punch(id, day, type, extra = {}) {
    attendance.push({ employeeId: id, timestamp: day+'T09:00:00+03:00', type, ...extra });
}
function complete(id, day) { punch(id,day,'attendance'); punch(id,day,'exit'); }
async function calculate(from = '2026-10-01', to = '2026-10-05') {
    let result;
    const response = { status(code) { this.code = code; return this; }, json(data) { result=data; } };
    await handlers['/api/admin/payroll/calculate']({ session: { companyId:'company' }, body:{ from, to } }, response);
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
    reset(); complete('one','2026-10-01');
    await calculate('2026-10-01','2026-10-01'); assert.equal(salaries[0].netSalary,10);
    complete('one','2026-10-03');
    await calculate('2026-10-01','2026-10-03'); assert.equal(salaries[0].netSalary,20); assert.equal(salaries[0].carriedBalance,0);
    await calculate('2026-10-01','2026-10-05'); assert.equal(salaries[0].netSalary,20);
    await context.recalculate('company',new Date('2026-10-05T12:00:00+03:00')); assert.equal(salaries[0].netSalary,20);
    salaries[0].carriedBalance=7; salaries[0].netSalary=27;
    await calculate('2026-10-01','2026-10-30'); assert.equal(salaries[0].netSalary,27); assert.equal(salaries[0].carriedBalance,7);
    await context.recalculate('company',new Date('2026-10-05T12:00:00+03:00')); assert.equal(salaries[0].netSalary,27);
    attendance=[];
    await calculate('2026-11-01','2026-11-05'); assert.equal(salaries[0].carriedBalance,27); assert.equal(salaries[0].netSalary,27);
    await calculate('2026-11-01','2026-11-06'); assert.equal(salaries[0].netSalary,27);
    assert.equal(context.payrollRateDivisor('monthly',new Date('2026-10-01')),26);
    assert.equal(context.payrollRateDivisor('weekly',new Date('2026-10-01')),6);
    assert.equal(context.payrollRateDivisor('daily',new Date('2026-10-01')),1);
    reset(); employees[0].salary=1025000;
    complete('one','2026-10-01'); complete('one','2026-10-03'); complete('one','2026-10-04');
    await calculate(); assert.equal(salaries[0].attendanceCount,3);
    assert.ok(Math.abs(salaries[0].netSalary - 1025000 / 26 * 3) < 0.001);
    await calculate('2026-10-01','2026-10-30'); assert.ok(Math.abs(salaries[0].netSalary - 118269.23076923077) < 0.001);
    console.log('PASS: screenshot regression: 1,025,000 monthly / 26 working days x 3 = 118,269.23');
    console.log('PASS: expanding/overlapping periods do not duplicate earnings; real previous unpaid balances survive manual/live recalculation');
    console.log('PASS: manual/live payroll, Friday default/approval/revocation, employee isolation, duplicate punches, incomplete/pending/rejected days, leave separation, hire date, Baghdad date');
})().catch(error => { console.error(error); process.exitCode=1; });
