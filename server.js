const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// إعداد middleware لمعالجة طلبات JSON إذا كنت تستخدم API
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// هذه هي النقطة الأهم: ربط مجلد public لخدمة الملفات الثابتة
// تأكد أن المجلد اسمه "public" وموجود بجانب هذا الملف
app.use(express.static(path.join(__dirname, 'public')));

// مسار فحص الاتصال (Ping) لحل مشكلة تعليق "جاري الاتصال..." في الواجهة
app.get('/api/ping', (req, res) => {
    res.status(200).send('pong');
});

app.head('/api/ping', (req, res) => {
    res.status(200).end();
});

// المسار الرئيسي: يوجه المستخدم دائماً إلى index.html عند فتح الرابط
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// إضافة معالجة للمسارات الأخرى (مثل admin.html) لتعمل مباشرة
app.get('/:page', (req, res) => {
    const page = req.params.page;
    const filePath = path.join(__dirname, 'public', page);
    
    // التحقق من وجود الملف قبل إرساله
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send("الصفحة المطلوبة غير موجودة");
    }
});

// تعريف البورت
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
