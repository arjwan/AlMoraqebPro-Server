const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

// السماح بقراءة البيانات القادمة بصيغة JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تقديم الملفات الثابتة من المجلد الرئيسي والمجلدات الفرعية
app.use(express.static(path.join(__dirname, 'public')));
app.use('/app', express.static(path.join(__dirname, 'app')));

// توجيه الصفحة الرئيسية مباشرة إلى شاشة الترحيب في مجلد app
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'app', 'welcome.html'));
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
