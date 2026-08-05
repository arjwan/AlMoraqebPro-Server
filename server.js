// السماح بقراءة مجلد 'public' للملفات الثابتة (CSS, JS, الصور، إلخ)
app.use(express.static(path.join(__dirname, 'public')));

// توجيه رابط صفحة التسجيل الخاصة بالعملاء
app.get('/admin-register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-register.html'));
});

// جعل صفحة تسجيل العميل هي الصفحة الرئيسية افتراضياً عند فتح الرابط الأساسي للموقع
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-register.html'));
});

// مسار صفحة إدارة الشركات الخاصة بك (لو أردت الدخول إليها يدوياً)
app.get('/create-company.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'create-company.html'));
});

// مسار صفحة الأدمن المحمي بالكامل (لن تفتح ولن يستجيب السيرفر إلا بمعرف شركة صحيح من القاعدة)
app.get('/admin.html', verifyAdminAccess, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
