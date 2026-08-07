const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تفعيل خدمة الملفات الثابتة من المجلد الرئيسي أو public
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// قاعدة بيانات مؤقتة لتخزين الطلبات (يمكن استبدالها بـ PostgreSQL أو MongoDB)
let databaseRequests = [];

// API استقبال الطلبات من الهاتف أو اللابتوب
app.post('/api/requests', (req, res) => {
    const newRequest = req.body;
    databaseRequests.unshift(newRequest);
    console.log(`📥 تم استلام طلب جديد من الموظف: ${newRequest.username}`);
    res.status(200).json({ success: true, message: "تم حفظ الطلب في قاعدة البيانات بنجاح", data: newRequest });
});

// API جلب الطلبات للمدير
app.get('/api/requests', (req, res) => {
    res.status(200).json(databaseRequests);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
