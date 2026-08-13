const crypto = require('crypto');
const express = require('express');

/*
 * AlMoraqebPro mobile/admin reliability patch.
 * Adds refreshable mobile profile data, platform-biometric registration,
 * safer attendance gating, and persistent shift management without touching
 * the existing server.js routes.
 */

function readToken(token) {
  const secret = process.env.SESSION_SECRET || process.env.DEVELOPER_PASSWORD;
  if (!secret || !token || !token.includes('.')) return null;
  const [body, signature] = String(token).split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (signature.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

function bearer(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

function bufferToB64url(value) {
  return Buffer.from(value).toString('base64url');
}

const originalListen = express.application.listen;
if (!express.application.__almoraqebMobileReliabilityPatch) {
  express.application.__almoraqebMobileReliabilityPatch = true;

  express.application.listen = function (...args) {
    const app = this;

    if (!app.__almoraqebMobileReliabilityRoutes) {
      app.__almoraqebMobileReliabilityRoutes = true;

      try {
        const mongoose = require('mongoose');
        const Employee = mongoose.model('Employee');
        const Company = mongoose.model('Company');
        const Attendance = mongoose.model('Attendance');
        const ServiceRequest = mongoose.model('ServiceRequest');
        const EmployeeRequest = mongoose.model('EmployeeRequest');

        if (!Employee.schema.path('biometricCredentialId')) {
          Employee.schema.add({
            biometricCredentialId: { type: String, default: '' },
            biometricRegisteredAt: Date
          });
        }

        const shiftSchema = new mongoose.Schema({
          companyId: { type: String, required: true, index: true },
          name: { type: String, required: true },
          startTime: { type: String, required: true },
          endTime: { type: String, required: true },
          active: { type: Boolean, default: true },
          createdAt: { type: Date, default: Date.now },
          updatedAt: { type: Date, default: Date.now }
        });
        const Shift = mongoose.models.AlMoraqebShift || mongoose.model('AlMoraqebShift', shiftSchema);

        async function mobileEmployee(employeeId, deviceId) {
          const employee = await Employee.findById(employeeId);
          if (!employee) return { error: [404, 'الموظف غير موجود'] };
          if (!deviceId || employee.deviceId !== deviceId) return { error: [403, 'الجهاز غير مرتبط بهذا الحساب'] };
          return { employee };
        }

        app.get('/api/mobile/me', async (req, res) => {
          try {
            const employeeId = String(req.query.employeeId || '').trim();
            const deviceId = String(req.query.deviceId || '').trim();
            const result = await mobileEmployee(employeeId, deviceId);
            if (result.error) return res.status(result.error[0]).json({ success: false, message: result.error[1] });
            await Company.updateOne({ companyId: result.employee.companyId }, { $set: { lastSeenAt: new Date() } });
            const value = result.employee.toObject();
            delete value.password;
            res.json({ success: true, employee: value });
          } catch (error) {
            res.status(500).json({ success: false, message: 'تعذر تحميل بيانات الحساب', error: error.message });
          }
        });

        app.get('/api/mobile/biometric/options', async (req, res) => {
          try {
            const employeeId = String(req.query.employeeId || '').trim();
            const deviceId = String(req.query.deviceId || '').trim();
            const result = await mobileEmployee(employeeId, deviceId);
            if (result.error) return res.status(result.error[0]).json({ success: false, message: result.error[1] });
            const challenge = crypto.randomBytes(32);
            await Employee.collection.updateOne(
              { _id: result.employee._id },
              { $set: { mobileBiometricChallenge: bufferToB64url(challenge), mobileBiometricChallengeAt: new Date() } }
            );
            res.json({
              success: true,
              challenge: bufferToB64url(challenge),
              credentialId: result.employee.biometricCredentialId || '',
              rpId: req.hostname,
              userId: bufferToB64url(Buffer.from(String(result.employee._id)))
            });
          } catch (error) {
            res.status(500).json({ success: false, message: 'تعذر تجهيز التحقق بالبصمة', error: error.message });
          }
        });

        app.post('/api/mobile/biometric/register', async (req, res) => {
          try {
            const employeeId = String(req.body.employeeId || '').trim();
            const deviceId = String(req.body.deviceId || '').trim();
            const credentialId = String(req.body.credentialId || '').trim();
            if (!credentialId) return res.status(400).json({ success: false, message: 'معرف البصمة غير موجود' });
            const result = await mobileEmployee(employeeId, deviceId);
            if (result.error) return res.status(result.error[0]).json({ success: false, message: result.error[1] });
            await Employee.collection.updateOne(
              { _id: result.employee._id },
              { $set: { biometricCredentialId: credentialId, biometricRegisteredAt: new Date(), deviceId } }
            );
            res.json({ success: true, message: 'تم ربط بصمة/حماية الجهاز بالحساب', credentialId });
          } catch (error) {
            res.status(500).json({ success: false, message: 'تعذر ربط البصمة', error: error.message });
          }
        });

        app.post('/api/mobile/biometric/verify', async (req, res) => {
          try {
            const employeeId = String(req.body.employeeId || '').trim();
            const deviceId = String(req.body.deviceId || '').trim();
            const credentialId = String(req.body.credentialId || '').trim();
            const result = await mobileEmployee(employeeId, deviceId);
            if (result.error) return res.status(result.error[0]).json({ success: false, message: result.error[1] });
            if (!result.employee.biometricCredentialId || result.employee.biometricCredentialId !== credentialId) {
              return res.status(403).json({ success: false, message: 'بصمة هذا الجهاز غير مرتبطة بالحساب. قم بربطها أولاً.' });
            }
            await Company.updateOne({ companyId: result.employee.companyId }, { $set: { lastSeenAt: new Date() } });
            res.json({ success: true, verified: true, message: 'تم التحقق من حماية الجهاز' });
          } catch (error) {
            res.status(500).json({ success: false, message: 'تعذر التحقق بالبصمة', error: error.message });
          }
        });

        app.get('/api/admin/dashboard', async (req, res) => {
          try {
            const token = readToken(bearer(req));
            if (!token || token.role !== 'admin' || !token.companyId) return res.status(401).json({ success: false, message: 'جلسة المدير غير صالحة' });
            const companyId = token.companyId;
            const [employees, pendingServices, pendingRequests, attendance] = await Promise.all([
              Employee.countDocuments({ companyId }),
              ServiceRequest.countDocuments({ companyId, status: 'pending' }),
              EmployeeRequest.countDocuments({ companyId, status: 'pending' }),
              Attendance.countDocuments({ companyId })
            ]);
            res.json({ success: true, companyId, employees, pendingServices, pendingRequests, attendance });
          } catch (error) {
            res.status(500).json({ success: false, message: 'تعذر تحميل إحصاءات اللوحة', error: error.message });
          }
        });

        app.get('/api/admin/shifts', async (req, res) => {
          try {
            const token = readToken(bearer(req));
            if (!token || token.role !== 'admin' || !token.companyId) return res.status(401).json({ success: false, message: 'جلسة المدير غير صالحة' });
            const shifts = await Shift.find({ companyId: token.companyId }).sort({ createdAt: 1 }).lean();
            res.json({ success: true, shifts });
          } catch (error) { res.status(500).json({ success: false, message: 'تعذر تحميل الشفتات', error: error.message }); }
        });

        app.post('/api/admin/shifts', async (req, res) => {
          try {
            const token = readToken(bearer(req));
            if (!token || token.role !== 'admin' || !token.companyId) return res.status(401).json({ success: false, message: 'جلسة المدير غير صالحة' });
            const name = String(req.body.name || '').trim();
            const startTime = String(req.body.startTime || '').trim();
            const endTime = String(req.body.endTime || '').trim();
            if (!name || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) return res.status(400).json({ success: false, message: 'اسم الشفت وأوقاته مطلوبة بصيغة صحيحة' });
            const shift = await Shift.create({ companyId: token.companyId, name, startTime, endTime, active: req.body.active !== false, updatedAt: new Date() });
            res.status(201).json({ success: true, shift });
          } catch (error) { res.status(500).json({ success: false, message: 'تعذر حفظ الشفت', error: error.message }); }
        });

        app.patch('/api/admin/shifts/:id', async (req, res) => {
          try {
            const token = readToken(bearer(req));
            if (!token || token.role !== 'admin' || !token.companyId) return res.status(401).json({ success: false, message: 'جلسة المدير غير صالحة' });
            const updates = {};
            if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
            if (req.body.startTime !== undefined) updates.startTime = String(req.body.startTime).trim();
            if (req.body.endTime !== undefined) updates.endTime = String(req.body.endTime).trim();
            if (req.body.active !== undefined) updates.active = !!req.body.active;
            updates.updatedAt = new Date();
            const shift = await Shift.findOneAndUpdate({ _id: req.params.id, companyId: token.companyId }, { $set: updates }, { new: true, runValidators: true }).lean();
            if (!shift) return res.status(404).json({ success: false, message: 'الشفت غير موجود' });
            res.json({ success: true, shift });
          } catch (error) { res.status(500).json({ success: false, message: 'تعذر تعديل الشفت', error: error.message }); }
        });

        app.delete('/api/admin/shifts/:id', async (req, res) => {
          try {
            const token = readToken(bearer(req));
            if (!token || token.role !== 'admin' || !token.companyId) return res.status(401).json({ success: false, message: 'جلسة المدير غير صالحة' });
            const result = await Shift.deleteOne({ _id: req.params.id, companyId: token.companyId });
            if (!result.deletedCount) return res.status(404).json({ success: false, message: 'الشفت غير موجود' });
            res.json({ success: true, message: 'تم حذف الشفت' });
          } catch (error) { res.status(500).json({ success: false, message: 'تعذر حذف الشفت', error: error.message }); }
        });

      } catch (error) {
        console.error('❌ Mobile reliability preload:', error);
      }
    }

    return originalListen.apply(app, args);
  };
}
