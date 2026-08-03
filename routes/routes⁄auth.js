const express = require('express');
const router = express.Router();
// إذا كان لديك ملف اتصال بقاعدة البيانات، يمكنك تفعيل السطر التالي:
// const pool = require('../db'); 

// مسار تسجيل الدخول
router.post('/login', async (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ message: 'الرجاء إدخال اسم المستخدم وكلمة المرور' });
    }

    try {
        // يمكنك لاحقاً ربطه بقاعدة البيانات (PostgreSQL) للتحقق من الموظفين:
        // const query = 'SELECT * FROM employees WHERE email = $1 OR username = $1';
        // const result = await pool.query(query, [identifier]);
        // if (result.rows.length === 0) {
        //     return res.status(401).json({ message: 'المستخدم غير موجود' });
        // }
        // const user = result.rows[0];

        // التحقق التجريبي (يمكنك تعديله لاحقاً عندما تربطه بقاعدة البيانات الفعلية)
        if (identifier === "admin" && password === "123456") {
            return res.status(200).json({ 
                success: true,
                message: 'تم تسجيل الدخول بنجاح', 
                token: 'mock-jwt-token' 
            });
        } else {
            return res.status(401).json({ 
                success: false,
                message: 'بيانات تسجيل الدخول غير صحيحة' 
            });
        }

    } catch (err) {
        console.error('Database error during login:', err);
        res.status(500).json({ message: 'خطأ في الخادم الداخلي' });
    }
});

module.exports = router;
