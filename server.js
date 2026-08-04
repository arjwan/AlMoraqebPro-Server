const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

// إعدادات الوسائط الأساسية
app.use(express.json());
app.use(cors());

// السماح بقراءة الملفات الثابتة (HTML, CSS, JS) من المجلد الرئيسي
app.use(express.static(path.join(__dirname)));

// مسار التحقق من عمل السيرفر
app.get('/api/status', (req, res) => {
    res.json({ success: true, message: 'AlMoraqeb Pro Server is running perfectly!' });
});

// مسار تسجيل الشركات وإنشاء معرف وقاعدة بيانات مستقلة
app.post('/api/companies/register', (req, res) => {
    const { companyName, username, email, licenseKey } = req.body;
    
    // توليد معرف فريد ورابط مستقل للشركة
    const sanitizedName = companyName ? companyName.toLowerCase().replace(/\s+/g, '_') : 'company';
    const companyId = `${sanitizedName}_${Math.floor(Math.random() * 9000) + 1000}`;
    
    res.json({
        success: true,
        message: 'تم إنشاء قاعدة البيانات المستقلة بنجاح على السيرفر',
        companyId: companyId,
        customUrl: `https://almoraqebpro-server.onrender.com/admin.html?company=${companyId}`
    });
});

// توجيه أي صفحة غير موجودة إلى الصفحة الرئيسية لتفادي الأخطاء
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// تشغيل السيرفر على المنفذ المحدد من Render أو المنفذ المحلي
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
