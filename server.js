const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// تفعيل استقبال البيانات بصيغة JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تقديم الملفات الثابتة من المجلد الحالي
app.use(express.static(path.join(__dirname)));

// 1. مسار جلب معلومات الشركة
app.get('/api/companies/info', (req, res) => {
    const companyId = req.query.company || 'default_company';
    try {
        const dbPath = path.join(__dirname, 'database.json');
        let companyName = companyId;
        
        if (fs.existsSync(dbPath)) {
            const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
            if (dbData[companyId] && dbData[companyId].companyName) {
                companyName = dbData[companyId].companyName;
            }
        }

        res.json({ 
            success: true, 
            company: { company_name: companyName } 
        });
    } catch (err) {
        res.json({ success: true, company: { company_name: companyId } });
    }
});

// 2. مسار استقبال ومزامنة بيانات الموظفين والجداول وتحديث database.json
app.post('/api/sync-update', (req, res) => {
    try {
        const syncData = req.body;
        const dbPath = path.join(__dirname, 'database.json');
        
        let db = {};
        if (fs.existsSync(dbPath)) {
            db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        }

        const compId = syncData.companyId || 'default_company';
        db[compId] = syncData;
        
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');

        res.json({ success: true, message: 'تمت مزامنة وتحديث السيرفر والجداول بنجاح' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`Server is running successfully on port ${PORT}`);
});
