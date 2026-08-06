const { pool } = require('./database');

async function createManualCompany() {
    try {
        const companyCode = 'COMP-9999'; // الرمز الخاص بالشركة
        const companyName = 'شركة الأرجوان التجريبية';
        
        // 1. إدخال الشركة
        await pool.query(
            'INSERT INTO companies (company_id, company_name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [companyCode, companyName]
        );

        // 2. إدخال حساب المدير الخاص بها
        // اسم المستخدم: admin | كلمة المرور: 123456
        await pool.query(
            `INSERT INTO employees (company_id, name, username, password, role) 
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
            [companyCode, 'المدير العام', 'admin', '123456', 'admin']
        );

        console.log('تم إنشاء الشركة وحساب المدير يدوياً بنجاح!');
        console.log(`رمز الشركة: ${companyCode}`);
        console.log(`اسم المستخدم: admin`);
        console.log(`كلمة المرور: 123456`);
        process.exit(0);
    } catch (err) {
        console.error('حدث خطأ:', err);
        process.exit(1);
    }
}

createManualCompany();
