const express = require('express');
const path = require('path');
const app = express();

// إعداد مجلد الملفات الثابتة (الواجهات)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// مسار تجريبي للتأكد من عمل الخادم
app.get('/api/status', (req, res) => {
    res.json({ status: 'success', message: 'AlMoraqebPro Server is running smoothly!' });
});

// تحديد المنفذ تلقائياً (من السيرفر السحابي أو محلياً على 3000)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running and listening on port ${PORT}`);
});
