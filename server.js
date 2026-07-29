const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());

// تقديم الملفات الثابتة (لوحة تحكم المدير)
app.use(express.static(path.join(__dirname, 'public')));

// إعداد اتصال قاعدة بيانات PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// تهيئة قاعدة البيانات وإنشاء الجدول بالحقول الأمنية الجديدة
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS employees (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100),
                phone VARCHAR(50),
                job_title VARCHAR(100),
                salary NUMERIC DEFAULT 0,
                shift_hours VARCHAR(50),
                province VARCHAR(50),
                city VARCHAR(50),
                district VARCHAR(50),
                mahalla VARCHAR(50),
                alley VARCHAR(50),
                house_no VARCHAR(50),
                id_type VARCHAR(50),
                id_number VARCHAR(50),
                housing_card VARCHAR(50),
                start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                password VARCHAR(255),
                device_id VARCHAR(255),
                fingerprint_id VARCHAR(255),
                status VARCHAR(20) DEFAULT 'pending'
            );
        `);
        console.log("Database initialized successfully.");
    } catch (err) {
        console.error("Error initializing database:", err);
    }
}
initDB();

// 1. استقبال طلب تسجيل الموظف الجديد من هاتف الأندرويد
app.post('/api/employees/register', async (req, res) => {
    const { name, phone, job_title, password, device_id, fingerprint_id } = req.body;
    
    if (!name || !phone || !password || !device_id) {
        return res.status(400).json({ message: 'الرجاء ملء كافة الحقول الأساسية وتوفير معرف الجهاز.' });
    }

    try {
        const checkPhone = await pool.query('SELECT * FROM employees WHERE phone = $1', [phone]);
        if (checkPhone.rows.length > 0) {
            return res.status(400).json({ message: 'رقم الهاتف هذا مستخدم مسبقاً.' });
        }

        const query = `
            INSERT INTO employees (name, phone, job_title, password, device_id, fingerprint_id, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'pending')
            RETURNING *;
        `;
        const values = [name, phone, job_title || '', password, device_id, fingerprint_id || ''];
        const newEmp = await pool.query(query, values);

        res.status(201).json({ 
            message: 'تم إنشاء الحساب بنجاح وهو بانتظار موافقة وتفعيل المدير.',
            employee: newEmp.rows[0] 
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ message: 'خطأ في السيرفر أثناء تسجيل الحساب.' });
    }
});

// 2. جلب الموظفين لوحة تحكم المدير
app.get('/api/employees', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM employees ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching employees:', err);
        res.status(500).json({ message: 'خطأ في جلب بيانات الموظفين' });
    }
});

// 3. تحديث وتفعيل الموظف من لوحة المدير
app.put('/api/employees/:id', async (req, res) => {
    const { id } = req.params;
    const { name, phone, job_title, salary, shift_hours, status } = req.body;
    try {
        const query = `
            UPDATE employees 
            SET name = COALESCE($1, name), 
                phone = COALESCE($2, phone), 
                job_title = COALESCE($3, job_title), 
                salary = COALESCE($4, salary), 
                shift_hours = COALESCE($5, shift_hours), 
                status = COALESCE($6, status)
            WHERE id = $7 
            RETURNING *;
        `;
        const values = [name, phone, job_title, salary, shift_hours, status, id];
        const updated = await pool.query(query, values);
        
        if (updated.rows.length === 0) {
            return res.status(404).json({ message: 'الموظف غير موجود' });
        }
        res.json({ message: 'تم تحديث وتفعيل الموظف بنجاح', employee: updated.rows[0] });
    } catch (err) {
        console.error('Error updating employee:', err);
        res.status(500).json({ message: 'خطأ في تحديث البيانات' });
    }
});

// 4. حذف موظف
app.delete('/api/employees/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM employees WHERE id = $1', [id]);
        res.json({ message: 'تم حذف الموظف بنجاح' });
    } catch (err) {
        console.error('Error deleting employee:', err);
        res.status(500).json({ message: 'خطأ أثناء الحذف' });
    }
});

// 5. حذف كافة الموظفين
app.delete('/api/employees/all', async (req, res) => {
    try {
        await pool.query('DELETE FROM employees');
        res.json({ message: 'تم حذف كافة الموظفين بنجاح' });
    } catch (err) {
        console.error('Error deleting all employees:', err);
        res.status(500).json({ message: 'خطأ أثناء حذف السجلات' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
