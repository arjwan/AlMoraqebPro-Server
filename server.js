const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(__dirname)); // لخدمة ملفات الـ HTML (login.html, register_2.html, الخ)

// الاتصال بقاعدة بيانات الهارد دسك
const db = new sqlite3.Database('./almoraqeb_pro.db');

// 1. ربط الصفحة الرئيسية (صفحة تسجيل الدخول)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html')); // تأكد أن اسم ملفك هو login.html
});

// 2. مسار تسجيل الدخول (للتحقق من البيانات)
app.post('/api/v1/login', (req, res) => {
    const { companyId, username, password } = req.body;
    
    // البحث في القاعدة المحلية
    const query = `SELECT * FROM employees WHERE company_id = ? AND username = ? AND password = ?`;
    db.get(query, [companyId, username, password], (err, row) => {
        if (err || !row) {
            return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
        }
        res.json({ success: true, user: row });
    });
});

// 3. مسار حفظ البيانات مع المزامنة (للموظفين الجدد)
app.post('/api/v1/employees', async (req, res) => {
    const employeeData = req.body;
    
    // الحفظ المحلي
    const query = `INSERT INTO employees (company_id, name, username, password) VALUES (?, ?, ?, ?)`;
    db.run(query, [employeeData.companyId, employeeData.name, employeeData.username, employeeData.password], function(err) {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الحفظ المحلي' });
        
        // المزامنة مع السحابة (Render)
        axios.post('https://your-app-name.onrender.com/api/v1/employees', employeeData)
             .catch(err => console.log('خطأ في المزامنة السحابية (سيتم لاحقاً)'));
             
        res.status(201).json({ success: true, id: this.lastID });
    });
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
});
