const express = require('express');
const router = express.Router();

// 1. مسار تسجيل موظف جديد
router.post('/employees/register', (req, res) => {
    try {
        const { companyName, name, phone, username, password, faceData } = req.body;
        
        if (!companyName || !username || !password) {
            return res.status(400).json({ success: false, message: 'الحقول الأساسية مطلوبة' });
        }

        const newUser = {
            id: 'EMP_' + Date.now(),
            companyName,
            name,
            phone,
            username,
            password,
            faceData,
            createdAt: new Date()
        };

        global.db.users.push(newUser);
        res.status(200).json({ success: true, message: 'تم تسجيل المستخدم بنجاح', user: newUser });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في السيرفر أثناء التسجيل' });
    }
});

// 2. مسار تسجيل الدخول
router.post('/login', (req, res) => {
    try {
        const { identifier, password, faceData, location } = req.body;
        
        // البحث عن المستخدم باستخدام اسم المستخدم أو البريد
        const user = global.db.users.find(u => u.username === identifier || u.phone === identifier);

        if (!user && !faceData) {
            return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
        }

        res.status(200).json({ 
            success: true, 
            message: 'تم تسجيل الدخول بنجاح', 
            user: user ? { name: user.name, company: user.companyName } : { name: 'موظف بمعرف حي' }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في عملية تسجيل الدخول' });
    }
});

// 3. مسار تسجيل الحضور والانصراف
router.post('/attendance', (req, res) => {
    try {
        const { type, timestamp, location } = req.body;
        
        const attendanceRecord = {
            id: 'ATT_' + Date.now(),
            type,
            timestamp,
            location
        };

        global.db.attendance.push(attendanceRecord);
        res.status(200).json({ success: true, message: 'تم تسجیل الحضور بنجاح', record: attendanceRecord });
    } catch (error) {
        res.status(500).json({ success: false, message: 'خطأ في تسجيل الحضور' });
    }
});

module.exports = router;
