'use strict';
// Refresh only explicitly tagged interview-demo records. Never touches real employees.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const mongo = process.env.MONGO_URI || process.env.MONGODB_URI;
const companyId = process.env.DEMO_COMPANY_ID || 'B-3214';
const batch = process.env.DEMO_BATCH || 'interview-2026-09';
const schema = collection => new mongoose.Schema({}, { strict: false, collection });
const Employee = mongoose.model('DemoRefreshEmployee', schema('employees'));
const Attendance = mongoose.model('DemoRefreshAttendance', schema('attendances'));
const Salary = mongoose.model('DemoRefreshSalary', schema('salaryrecords'));
const key = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
const localTime = (dateKey, hour, minute = 0) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - 3, minute));
};
const previousKey = dateKey => key(new Date(localTime(dateKey, 12).getTime() - 86400000));
const plans = {
  'صباحي': { inHour: 8, outHour: 16 },
  'مرن': { inHour: 9, outHour: 16 },
  'مسائي': { inHour: 15, outHour: 23 },
  'ليلي': { inHour: 23, outHour: 7, overnight: true }
};
async function ensurePunch(employee, type, at, dayKey) {
  const from = localTime(key(at), 0);
  const to = new Date(from.getTime() + 86400000);
  let record = await Attendance.findOne({ companyId, employeeId: String(employee._id), type,
    demoData: true, demoBatch: batch, timestamp: { $gte: from, $lt: to } });
  if (record) {
    // The original seed used UTC setHours, placing Baghdad departures three hours late.
    if (type === 'departure' && new Date(record.timestamp) > at) {
      await Attendance.updateOne({ _id: record._id }, { $set: { timestamp: at, demoWorkdayKey: dayKey } });
    }
    return;
  }
  await Attendance.create({ companyId, employeeId: String(employee._id), employeeName: employee.name,
    deviceId: 'DEMO-TIMER-' + employee.employeeSerial, verificationMethod: 'device-biometric',
    shiftName: employee.shift, workplace: employee.workplace, type, timestamp: at,
    attendanceStatus: 'normal', locationStatus: 'approved', timeStatus: 'within-shift',
    managerApprovalStatus: 'not-required', demoData: true, demoBatch: batch, demoWorkdayKey: dayKey });
}
async function main(now = new Date()) {
  if (!mongo) throw Error('MONGO_URI is required');
  if (companyId !== 'B-3214') throw Error('Interview demo is restricted to Al Arjwan (B-3214)');
  await mongoose.connect(mongo, { serverSelectionTimeoutMS: 10000 });
  try {
    const today = key(now);
    const employees = await Employee.find({ companyId, demoData: true, demoBatch: batch }).lean();
    let completed = 0;
    for (const employee of employees) {
      const plan = plans[employee.shift];
      if (!plan) continue;
      const workday = plan.overnight ? previousKey(today) : today;
      const inAt = localTime(workday, plan.inHour);
      const outAt = localTime(plan.overnight ? today : workday, plan.outHour);
      if (now < outAt) continue;
      await ensurePunch(employee, 'attendance', inAt, workday);
      await ensurePunch(employee, 'departure', outAt, workday);
      completed++;
    }
    const monthStart = localTime(today.slice(0, 7) + '-01', 0);
    const rows = await Attendance.find({ companyId, demoData: true, demoBatch: batch,
      timestamp: { $gte: monthStart, $lte: now } }).lean();
    for (const employee of employees) {
      const own = rows.filter(r => String(r.employeeId) === String(employee._id));
      const days = new Map();
      for (const row of own) {
        const day = row.demoWorkdayKey || (employee.shift === 'ليلي' && row.type === 'departure'
          ? previousKey(key(row.timestamp)) : key(row.timestamp));
        if (!days.has(day)) days.set(day, new Set());
        days.get(day).add(row.type === 'attendance' ? 'in' : 'out');
      }
      const attendanceDays = [...days.values()].filter(types => types.has('in') && types.has('out')).length;
      const basicSalary = Number(employee.salary || 0);
      if (!(basicSalary > 0)) continue;
      const wageType = ['daily', 'weekly', 'monthly'].includes(employee.wageType) ? employee.wageType : 'monthly';
      const dailyRate = basicSalary / (wageType === 'daily' ? 1 : wageType === 'weekly' ? 7 : 30);
      const grossSalary = Math.round(dailyRate * attendanceDays * 100) / 100;
      await Salary.updateOne({ companyId, employeeId: String(employee._id) }, {
        $set: { employeeName: employee.name, employeeSerial: employee.employeeSerial,
          workplace: employee.workplace, shiftName: employee.shift, wageType, basicSalary, dailyRate,
          payrollFrom: monthStart, payrollTo: now, attendanceDays, attendanceCount: attendanceDays,
          grossSalary, currentPeriodEarnings: grossSalary, netSalary: grossSalary,
          calculatedAt: now, lastAttendanceAt: own.sort((a,b) => b.timestamp - a.timestamp)[0]?.timestamp },
        $setOnInsert: { payoutStatus: 'unpaid' }
      }, { upsert: true });
    }
    console.log(JSON.stringify({ ok: true, companyId, demoEmployees: employees.length, completedShifts: completed, day: today }));
  } finally { await mongoose.disconnect(); }
}
if (require.main === module) main().catch(err => { console.error(err); process.exitCode = 1; });
module.exports = { main, localTime, previousKey };
